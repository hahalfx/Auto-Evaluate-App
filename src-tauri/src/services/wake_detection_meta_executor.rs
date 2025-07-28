use async_trait::async_trait;
use std::error::Error;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::watch;

use crate::models::TaskProgress;
use crate::models::WakeWord;
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
}

/// 唤醒检测元任务 - 执行多个唤醒词的测试
pub struct wake_detection_meta_executor {
    id: String,
    task_id: i64,
    visual_config: VisualWakeConfig,
    state_snapshot: Arc<AppState>,
}

impl wake_detection_meta_executor {
    pub fn new(
        id: &str,
        task_id: i64,
        visual_config: VisualWakeConfig,
        state: Arc<AppState>,
    ) -> Self {
        Self {
            id: id.to_string(),
            task_id,
            visual_config,
            state_snapshot: state,
        }
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
                            } else if status == "timeout" {
                                active_task_is_completed = false; // 明确设置为false
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
                            println!("[WakeDetectionMetaTask] ASR task completed successfully for wake word '{}' with response: '{}'", wakeword.text, asr_task_output.response);
                        } else {
                            println!("[WakeDetectionMetaTask] ASR task completed but response is empty for wake word '{}'", wakeword.text);
                        }
                    }
                }
                
                // 只要有一个任务成功就认为测试成功
                if active_task_is_completed || asr_result.is_some() {
                    test_is_successful = true;
                } else {
                    test_is_successful = false;
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
                duration_ms,
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

            // 测试间隔
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
