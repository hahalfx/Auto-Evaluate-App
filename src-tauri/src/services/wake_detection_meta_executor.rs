use async_trait::async_trait;
use std::error::Error;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::watch;

use crate::models::TaskProgress;
use crate::services::active_task::ActiveTask;
use crate::services::active_task::VisualWakeConfig;
use crate::services::asr_task::AsrTask;
use crate::services::audio_task::audio_task;
use crate::services::finish_task::finish_task;
use crate::services::workflow::ControlSignal;
use crate::services::workflow::Task;
use crate::services::workflow::Workflow;
use crate::services::workflow::WorkflowContext;
use crate::state::AppState;

/// 唤醒检测测试结果
#[derive(Debug, Clone, serde::Serialize)]
pub struct WakeDetectionResult {
    pub test_index: u32,
    pub wake_word_id: u32,
    pub wake_word_text: String,
    pub wake_task_completed: bool,
    pub active_task_completed: bool,
    pub success: bool,
    pub confidence: Option<f64>,
    pub timestamp: i64,
    pub duration_ms: u64,
    pub asr_result: Option<String>,
    pub asr_matches_expected: Option<bool>,
    pub expected_responses: Vec<String>,
}

/// 唤醒检测元任务 - 执行多个唤醒词的测试
pub struct wake_detection_meta_executor {
    id: String,
    task_id: i64,
    visual_config: VisualWakeConfig,
    state_snapshot: Arc<AppState>,
    expected_responses: Vec<String>, // 用户输入的预期回复
}

impl wake_detection_meta_executor {
    pub fn new(
        id: &str,
        task_id: i64,
        visual_config: VisualWakeConfig,
        state: Arc<AppState>,
        expected_responses: Vec<String>,
    ) -> Self {
        Self {
            id: id.to_string(),
            task_id,
            visual_config,
            state_snapshot: state,
            expected_responses,
        }
    }

    /// 检查ASR结果是否匹配用户输入的预期回复
    fn check_asr_response(&self, asr_result: &str) -> bool {
        let response = asr_result.trim().to_lowercase();
        
        // 如果没有预期回复，保持原有逻辑（只要ASR有结果就算成功）
        if self.expected_responses.is_empty() {
            return !response.is_empty();
        }
        
        // 检查ASR结果是否匹配任何一个预期回复
        for expected in &self.expected_responses {
            let expected_lower = expected.trim().to_lowercase();
            
            // 完全匹配
            if response == expected_lower {
                return true;
            }
            
            // 包含匹配（允许部分匹配）
            if response.contains(&expected_lower) || expected_lower.contains(&response) {
                return true;
            }
            
            // 去除标点符号后的匹配
            let response_clean = response.replace(|c: char| !c.is_alphanumeric(), "");
            let expected_clean = expected_lower.replace(|c: char| !c.is_alphanumeric(), "");
            if response_clean == expected_clean {
                return true;
            }
        }
        
        false
    }
}

#[async_trait]
impl Task for wake_detection_meta_executor {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        _context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        println!(
            "[WakeDetectionMetaTask '{}'] Starting wake detection tests for task {}",
            self.id, self.task_id
        );

        // 从数据库获取任务信息
        let task = self
            .state_snapshot
            .db
            .get_task_by_id(self.task_id)
            .await
            .map_err(|e| format!("获取任务失败: {}", e))?
            .ok_or("任务不存在")?;

        // 获取所有唤醒词信息
        let mut wakewords = Vec::new();
        for &wake_word_id in &task.wake_word_ids {
            let wakeword = self
                .state_snapshot
                .db
                .get_wake_word_by_id(wake_word_id)
                .await
                .map_err(|e| format!("获取唤醒词 {} 失败: {}", wake_word_id, e))?
                .ok_or(format!("唤醒词 {} 不存在", wake_word_id))?;
            wakewords.push(wakeword);
        }

        if wakewords.is_empty() {
            return Err("任务没有关联的唤醒词".into());
        }

        app_handle
            .emit(
                "wake_detection_meta_update",
                format!("开始执行 {} 个唤醒词的检测测试", wakewords.len()),
            )
            .ok();

        let mut all_results = Vec::new();
        let mut total_tests = 0;

        // 为每个唤醒词执行测试
        for (wake_word_index, wakeword) in wakewords.iter().enumerate() {
            println!(
                "[WakeDetectionMetaTask '{}'] Starting tests for wake word {}/{}: '{}'",
                self.id,
                wake_word_index + 1,
                wakewords.len(),
                wakeword.text
            );

            app_handle
                .emit(
                    "wake_detection_meta_update",
                    format!(
                        "开始测试唤醒词 {}/{}: {}",
                        wake_word_index + 1,
                        wakewords.len(),
                        wakeword.text
                    ),
                )
                .ok();

            // 检查控制信号
            tokio::select! {
                biased;
                _ = control_rx.changed() => {
                    let signal = *control_rx.borrow();
                    if signal == ControlSignal::Stopped {
                        println!("[WakeDetectionMetaTask] Stopped by control signal before testing wake word '{}'.", wakeword.text);
                        return Err("WakeDetectionMetaTask was stopped externally.".into());
                    }
                    if signal == ControlSignal::Paused {
                        println!("[WakeDetectionMetaTask] Paused. Waiting to resume...");
                        app_handle.emit("wake_detection_meta_update", "任务已暂停...").ok();
                        while *control_rx.borrow() == ControlSignal::Paused {
                            if control_rx.changed().await.is_err() {
                                return Err("Control channel closed while paused".into());
                            }
                        }
                        println!("[WakeDetectionMetaTask] Resumed.");
                        app_handle.emit("wake_detection_meta_update", "任务已恢复。").ok();
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(1)) => {}
            }

            // 为当前唤醒词创建子工作流
            let (mut sub_workflow, _) = Workflow::new();
            let test_start_time = chrono::Utc::now().timestamp_millis();

            // 创建任务ID
            let wake_task_id = format!("wake_task_{}_{}", wakeword.id, wake_word_index);
            let active_task_id = format!("active_task_{}_{}", wakeword.id, wake_word_index);
            let asr_task_id = format!("asr_task_{}_{}", wakeword.id, wake_word_index);
            let finish_task_id = format!("finish_task_{}_{}", wakeword.id, wake_word_index);

            // 添加任务，使用唤醒词的音频文件路径
            sub_workflow.add_task(audio_task {
                id: wake_task_id.clone(),
                keyword: wakeword.text.clone(),
                url: wakeword.audio_file.clone(), // 使用数据库中的音频文件路径
            });

            sub_workflow.add_task(ActiveTask::new(
                active_task_id.clone(),
                self.visual_config.clone(),
            ));

            sub_workflow.add_task(AsrTask::new(asr_task_id.clone(), wakeword.text.clone()));

            sub_workflow.add_task(finish_task::new_for_wake_detection(
                finish_task_id.clone(),
                self.task_id,
                active_task_id.clone(),
                wakeword.id,
                self.state_snapshot.db.clone(),
            ));

            // 设置依赖关系 - finish_task 等待两个任务完成
            sub_workflow.add_dependency(&asr_task_id, &wake_task_id);
            sub_workflow.add_dependency(&finish_task_id, &asr_task_id);
            sub_workflow.add_dependency(&finish_task_id, &active_task_id);

            // 执行子工作流
            let result = sub_workflow
                .run_and_wait(app_handle.clone(), control_rx.clone())
                .await;

            let test_end_time = chrono::Utc::now().timestamp_millis();
            let duration_ms = (test_end_time - test_start_time) as u64;

            let (workflow_succeeded, maybe_context) = match result {
                Ok(context) => (true, Some(context)),
                Err(_) => (false, None),
            };

            let mut active_task_is_completed = false;
            let mut asr_result: Option<String> = None;
            let mut test_is_successful = workflow_succeeded;
            let mut wake_duration = None;
            let mut asr_duration = None;
            let mut final_duration_ms = 0;

            if let Some(context) = &maybe_context {
                let context_guard = context.read().await;
                
                // 检查 Active 任务结果
                if let Some(active_task_result_any) = context_guard.get(&active_task_id) {
                    if let Some(active_task_result) =
                        active_task_result_any.downcast_ref::<serde_json::Value>()
                    {
                        if let Some(status) =
                            active_task_result.get("status").and_then(|s| s.as_str())
                        {
                            if status == "completed" {
                                active_task_is_completed = true;
                                wake_duration = active_task_result.get("duration_ms").and_then(|d| d.as_u64());
                            } else if status == "timeout" {
                                active_task_is_completed = false; // 明确设置为false
                                wake_duration = active_task_result.get("duration_ms").and_then(|d| d.as_u64());
                                println!("[WakeDetectionMetaTask] Active task timed out for wake word '{}'.", wakeword.text);
                            }
                        }
                    }
                }
                
                // 检查 ASR 任务结果
                if let Some(asr_task_result_any) = context_guard.get(&asr_task_id) {
                    if let Some(asr_task_output) = asr_task_result_any.downcast_ref::<crate::services::asr_task::AsrTaskOutput>() {
                        // 检查ASR结果是否为空字符串或只包含空白字符
                        let response = asr_task_output.response.trim();
                        if !response.is_empty() {
                            asr_result = Some(asr_task_output.response.clone());
                            asr_duration = Some(asr_task_output.duration_ms);
                            println!("[WakeDetectionMetaTask] ASR task completed successfully for wake word '{}' with response: '{}', duration: {}ms", wakeword.text, asr_task_output.response, asr_task_output.duration_ms);
                        } else {
                            asr_duration = Some(asr_task_output.duration_ms);
                            println!("[WakeDetectionMetaTask] ASR task completed but response is empty for wake word '{}', duration: {}ms", wakeword.text, asr_task_output.duration_ms);
                        }
                    }
                }
                
                // 根据成功条件确定最终duration
                final_duration_ms = if active_task_is_completed && wake_duration.is_some() {
                    wake_duration.unwrap()
                } else if asr_result.is_some() && asr_duration.is_some() {
                    asr_duration.unwrap()
                } else {
                    0 // 失败情况不记录时间
                };
                
                // 根据预期回复验证ASR结果
                let mut asr_matches_expected = false;
                if let Some(ref asr_text) = asr_result {
                    asr_matches_expected = self.check_asr_response(asr_text);
                    println!(
                        "[WakeDetectionMetaTask] ASR result validation: '{}' matches expected: {}", 
                        asr_text, asr_matches_expected
                    );
                }

                // 更新成功条件：
                // 1. 如果视觉检测成功，则任务成功
                // 2. 如果ASR结果存在且匹配预期回复，则任务成功
                // 3. 否则任务失败
                if active_task_is_completed {
                    test_is_successful = true;
                    println!(
                        "[WakeDetectionMetaTask] Visual wake detection succeeded for wake word '{}'", 
                        wakeword.text
                    );
                } else if let Some(ref asr_text) = asr_result {
                    test_is_successful = asr_matches_expected;
                    if asr_matches_expected {
                        println!(
                            "[WakeDetectionMetaTask] ASR validation passed for wake word '{}' with response: '{}'", 
                            wakeword.text, asr_text
                        );
                    } else {
                        println!(
                            "[WakeDetectionMetaTask] ASR validation failed for wake word '{}', response '{}' does not match expected responses", 
                            wakeword.text, asr_text
                        );
                    }
                } else {
                    test_is_successful = false;
                    println!(
                        "[WakeDetectionMetaTask] Both visual detection and ASR failed for wake word '{}'", 
                        wakeword.text
                    );
                }
            } else {
                test_is_successful = false;
            }

            let wake_task_is_completed = workflow_succeeded;

            // 创建结果用于统计和前端显示（数据已由finish_task保存到数据库）
            let test_result = WakeDetectionResult {
                test_index: total_tests + 1,
                wake_word_id: wakeword.id,
                wake_word_text: wakeword.text.clone(),
                wake_task_completed: wake_task_is_completed,
                active_task_completed: active_task_is_completed,
                asr_result: asr_result,
                success: test_is_successful,
                confidence: None, // 可以从视觉检测结果中获取
                timestamp: test_end_time,
                duration_ms: if test_is_successful { final_duration_ms } else { 0 },
                asr_matches_expected: None,
                expected_responses: self.expected_responses.clone(),
            };

            all_results.push(test_result.clone());
            total_tests += 1;

            // 发送进度更新
            let progress_value = (wake_word_index + 1) as f32 / wakewords.len() as f32 * 100.0;
            app_handle
                .emit(
                    "wake_detection_progress",
                    TaskProgress {
                        value: progress_value,
                        current_sample: (wake_word_index + 1) as u32,
                        current_stage: Some(format!(
                            "唤醒词 {}/{}: {}",
                            wake_word_index + 1,
                            wakewords.len(),
                            wakeword.text
                        )),
                        total: wakewords.len() as u32,
                    },
                )
                .ok();

            // 发送测试结果
            app_handle
                .emit("wake_detection_test_result", test_result)
                .ok();

            if let Some(context) = maybe_context {
                // 在这里，你可以安全地访问 context
                let context_guard = context.read().await;
                println!(
                    "[WakeDetectionMetaTask] Sub-workflow context keys for wake word '{}': {:?}",
                    wakeword.text,
                    context_guard.keys()
                );
            } else {
                let error_message = format!("唤醒词 '{}' 测试失败. 终止所有测试。", wakeword.text);
                eprintln!("[WakeDetectionMetaTask] {}", error_message);
                app_handle
                    .emit("wake_detection_meta_error", &error_message)
                    .ok();
                return Err(error_message.into());
            }

            app_handle
                .emit(
                    "wake_detection_meta_update",
                    format!("唤醒词 '{}' 测试完成", wakeword.text),
                )
                .ok();

            // 测试间隔2秒
            if wake_word_index < wakewords.len() - 1 {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }

        // 发送最终统计结果
        let success_count = all_results.iter().filter(|r| r.success).count();
        let total_duration: u64 = all_results.iter().map(|r| r.duration_ms).sum();
        let avg_duration = if !all_results.is_empty() {
            total_duration / all_results.len() as u64
        } else {
            0
        };

        let final_stats = serde_json::json!({
            "total_tests": total_tests,
            "success_count": success_count,
            "success_rate": success_count as f64 / total_tests as f64,
            "total_duration_ms": total_duration,
            "avg_duration_ms": avg_duration,
            "results": all_results
        });

        app_handle
            .emit("wake_detection_final_stats", final_stats)
            .ok();

        println!(
            "[WakeDetectionMetaTask '{}'] All {} wake word tests completed. Success rate: {}/{}",
            self.id, total_tests, success_count, total_tests
        );

        app_handle
            .emit(
                "wake_detection_meta_update",
                format!(
                    "所有唤醒词测试完成！成功率: {}/{}",
                    success_count, total_tests
                ),
            )
            .ok();

        Ok(())
    }
}
