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
use crate::services::audio_task::audio_task;
use crate::services::middle_task::middle_task;
use crate::services::workflow::ControlSignal;
use crate::services::workflow::Task;
use crate::services::workflow::Workflow;
use crate::services::workflow::WorkflowContext;
use crate::state::AppState;

/// 唤醒检测测试结果
#[derive(Debug, Clone, serde::Serialize)]
pub struct WakeDetectionResult {
    pub test_index: u32,
    pub wake_task_completed: bool,
    pub active_task_completed: bool,
    pub success: bool,
    pub confidence: Option<f64>,
    pub timestamp: i64,
    pub duration_ms: u64,
}

/// 唤醒检测元任务 - 执行多次唤醒词测试
pub struct wake_detection_meta_executor {
    id: String,
    wakeword: WakeWord,
    repeat_count: u32,
    visual_config: VisualWakeConfig,
    state_snapshot: Arc<AppState>,
}

impl wake_detection_meta_executor {
    pub fn new(
        id: &str,
        wakeword: WakeWord,
        repeat_count: u32,
        visual_config: VisualWakeConfig,
        state: Arc<AppState>,
    ) -> Self {
        Self {
            id: id.to_string(),
            wakeword,
            repeat_count,
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
            "[WakeDetectionMetaTask '{}'] Starting {} wake detection tests for '{}'",
            self.id, self.repeat_count, self.wakeword.text
        );
        
        app_handle
            .emit(
                "wake_detection_meta_update",
                format!("开始执行 {} 次唤醒检测测试，唤醒词：{}", self.repeat_count, self.wakeword.text),
            )
            .ok();

        let mut results = Vec::new();

        for test_index in 0..self.repeat_count {
            println!(
                "[WakeDetectionMetaTask '{}'] Starting test {}/{}",
                self.id, test_index + 1, self.repeat_count
            );
            
            app_handle
                .emit(
                    "wake_detection_meta_update",
                    format!("开始第 {}/{} 次测试", test_index + 1, self.repeat_count),
                )
                .ok();

            // 检查控制信号
            tokio::select! {
                biased;
                _ = control_rx.changed() => {
                    let signal = *control_rx.borrow();
                    if signal == ControlSignal::Stopped {
                        println!("[WakeDetectionMetaTask] Stopped by control signal before test {}.", test_index + 1);
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

            // 创建子工作流
            let (mut sub_workflow, _) = Workflow::new();
            let test_start_time = chrono::Utc::now().timestamp_millis();

            // 创建任务ID
            let wake_task_id = format!("wake_task_{}", test_index);
            let active_task_id = format!("active_task_{}", test_index);
            let middle_task_id = format!("middle_task_{}", test_index);

            // 添加任务
            sub_workflow.add_task(audio_task {
                id: wake_task_id.clone(),
                keyword: self.wakeword.text.clone(),
                url: Some("/Volumes/应用/LLM Analysis Interface/public/audio/wakeword".to_string()),
            });

            sub_workflow.add_task(ActiveTask::new(
                active_task_id.clone(),
                self.visual_config.clone(),
            ));

            sub_workflow.add_task(middle_task {
                id: middle_task_id.clone(),
            });

            // 设置依赖关系 - middle_task 等待两个任务完成
            sub_workflow.add_dependency(&middle_task_id, &wake_task_id);
            sub_workflow.add_dependency(&middle_task_id, &active_task_id);

            // 执行子工作流
            let result = sub_workflow
                .run_and_wait(app_handle.clone(), control_rx.clone())
                .await;

            let test_end_time = chrono::Utc::now().timestamp_millis();
            let duration_ms = (test_end_time - test_start_time) as u64;

            // 记录结果
            let test_result = WakeDetectionResult {
                test_index: test_index + 1,
                wake_task_completed: true, // 如果工作流完成，说明任务都完成了
                active_task_completed: true,
                success: result.is_ok(),
                confidence: None, // 可以从视觉检测结果中获取
                timestamp: test_end_time,
                duration_ms,
            };

            results.push(test_result.clone());

            // 发送进度更新
            let progress_value = (test_index + 1) as f32 / self.repeat_count as f32 * 100.0;
            app_handle
                .emit(
                    "wake_detection_progress",
                    TaskProgress {
                        value: progress_value,
                        current_sample: (test_index + 1) as u32,
                        current_stage: Some(format!("测试 {}/{}", test_index + 1, self.repeat_count)),
                        total: self.repeat_count,
                    },
                )
                .ok();

            // 发送测试结果
            app_handle
                .emit("wake_detection_test_result", test_result)
                .ok();

            if let Err(e) = result {
                let error_message = format!("第 {} 次测试失败: {}. 终止所有测试。", test_index + 1, e);
                eprintln!("[WakeDetectionMetaTask] {}", error_message);
                app_handle.emit("wake_detection_meta_error", &error_message).ok();
                return Err(error_message.into());
            }

            app_handle
                .emit(
                    "wake_detection_meta_update",
                    format!("第 {} 次测试完成", test_index + 1),
                )
                .ok();

            // 测试间隔
            if test_index < self.repeat_count - 1 {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }

        // 发送最终统计结果
        let success_count = results.iter().filter(|r| r.success).count();
        let total_duration: u64 = results.iter().map(|r| r.duration_ms).sum();
        let avg_duration = if !results.is_empty() {
            total_duration / results.len() as u64
        } else {
            0
        };

        let final_stats = serde_json::json!({
            "total_tests": self.repeat_count,
            "success_count": success_count,
            "success_rate": success_count as f64 / self.repeat_count as f64,
            "total_duration_ms": total_duration,
            "avg_duration_ms": avg_duration,
            "results": results
        });

        app_handle
            .emit("wake_detection_final_stats", final_stats)
            .ok();

        println!(
            "[WakeDetectionMetaTask '{}'] All {} tests completed. Success rate: {}/{}",
            self.id, self.repeat_count, success_count, self.repeat_count
        );
        
        app_handle
            .emit(
                "wake_detection_meta_update",
                format!("所有测试完成！成功率: {}/{}", success_count, self.repeat_count),
            )
            .ok();

        Ok(())
    }
} 