use async_trait::async_trait;
use tokio::sync::watch;
use std::error::Error;
use tauri::Emitter;
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};
use crate::services::asr_task::AsrTaskOutput;

pub struct checkpoint_task {
    pub id: String,
    pub active_task_id: String,
    pub asr_task_id: String,
    pub expected_responses: Vec<String>,
}

impl checkpoint_task {
    pub fn new(
        id: String,
        active_task_id: String,
        asr_task_id: String,
        expected_responses: Vec<String>,
    ) -> Self {
        Self {
            id,
            active_task_id,
            asr_task_id,
            expected_responses,
        }
    }

    /// 检查ASR结果是否匹配预期回复
    fn check_asr_response(&self, asr_result: &str) -> bool {
        let response = asr_result.trim().to_lowercase();
        
        // 如果没有预期回复，只要ASR有结果就算成功
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

    /// 判断唤醒检测是否成功
    async fn check_wake_detection_success(&self, context: &WorkflowContext) -> bool {
        let context_guard = context.read().await;
        let mut active_task_completed = false;
        let mut asr_result: Option<String> = None;
        
        // 检查 Active 任务结果
        if let Some(active_task_result_any) = context_guard.get(&self.active_task_id) {
            if let Some(active_task_result) = active_task_result_any.downcast_ref::<serde_json::Value>() {
                if let Some(status) = active_task_result.get("status").and_then(|s| s.as_str()) {
                    if status == "completed" {
                        active_task_completed = true;
                    }
                }
            }
        }
        
        // 检查 ASR 任务结果
        if let Some(asr_task_result_any) = context_guard.get(&self.asr_task_id) {
            if let Some(asr_task_output) = asr_task_result_any.downcast_ref::<AsrTaskOutput>() {
                let response = asr_task_output.response.trim();
                if !response.is_empty() {
                    asr_result = Some(asr_task_output.response.clone());
                }
            }
        }
        
        // 判断成功条件：
        // 1. 如果视觉检测成功，则唤醒成功
        // 2. 如果ASR结果存在且匹配预期回复，则唤醒成功
        // 3. 否则唤醒失败
        if active_task_completed {
            return true;
        }
        
        if let Some(ref asr_text) = asr_result {
            return self.check_asr_response(asr_text);
        }
        
        false
    }
}

// 该任务的作用是判断唤醒检测是否成功，并设置相应的标志

#[async_trait]
impl Task for checkpoint_task {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        println!("[CheckpointTask '{}'] Starting wake detection success check", self.id);

        // 判断唤醒检测是否成功
        let wake_success = self.check_wake_detection_success(&context).await;
        
        // 在 context 中设置唤醒检测结果
        {
            let mut context_guard = context.write().await;
            context_guard.insert(
                "wake_detection_success".to_string(),
                Box::new(wake_success),
            );
            
            // 如果唤醒失败，设置跳过标志
            if !wake_success {
                context_guard.insert(
                    "should_skip_task".to_string(),
                    Box::new(true),
                );
                println!("[CheckpointTask '{}'] Wake detection failed, setting skip flag", self.id);
            } else {
                println!("[CheckpointTask '{}'] Wake detection succeeded", self.id);
            }
        }

        // 发送唤醒检测结果到前端
        app_handle
            .emit(
                "wake_detection_result",
                serde_json::json!({
                    "success": wake_success,
                    "task_id": self.id
                }),
            )
            .ok();

        // 主控制循环 - 持续检查控制信号
        loop {
            let signal = control_rx.borrow().clone();
            match signal {
                ControlSignal::Running => {
                    return Ok(());
                }
                ControlSignal::Paused => {
                    println!("[{}] Paused, waiting for resume...", self.id);
                    if control_rx.changed().await.is_err() {
                        println!("[{}] Control channel closed, stopping.", self.id);
                        return Ok(());
                    }
                    continue;
                }
                ControlSignal::Stopped => {
                    println!("[{}] Stopped gracefully.", self.id);
                    return Ok(());
                }
            }
        }
    }
}