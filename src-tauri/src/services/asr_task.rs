use async_trait::async_trait;
use tauri::http::response;
use tokio::sync::watch;
use std::error::Error;
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};

#[derive(Debug, Clone)]
pub struct asr_task_output{
    pub example:String,
    pub response:String,
}
pub struct asr_task {
    pub id: String,
    pub example:String,
}

#[async_trait]
impl Task for asr_task {
    fn id(&self) -> String {
        self.id.clone()
    }
    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        context: WorkflowContext,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        println!("开始ASR.");

        // 主控制循环 - 持续检查控制信号
        loop {
            let signal = control_rx.borrow().clone();
            match signal {
                ControlSignal::Running => {
                    //ASR逻辑写在这里
                    // TODO: 实现实际的ASR逻辑
                    // 这里应该调用ASR服务并获取识别结果
                    
                    // 模拟ASR处理结果 - 在实际实现中应该替换为真实的ASR调用
                    let asr_result: Result<String, Box<dyn Error + Send + Sync>> = Ok("模拟ASR识别结果".to_string());
                    
                    //处理结果
                    match asr_result {
                        Ok(response_text) => {
                            println!("ASR Task completed successfully.");
                            let output = asr_task_output{
                                example: self.example.clone(),
                                response: response_text
                            };
                            //将结果写入workflow状态中
                            context.write().await.insert(self.id(), Box::new(output));

                            return Ok(());
                        }
                        Err(e) => {
                            eprintln!(
                                "ASR Task failed: {}. Stopping dependent tasks.",
                               e
                            );
                            // 错误处理策略：这里我们选择停止后续依赖此任务的所有流程
                            return Err(e);
                        }
                    }
                }
                ControlSignal::Paused => {
                    println!("[{}]   Paused, waiting for resume...", self.id);
                    // 暂停状态：等待控制信号变化，不退出任务
                    if control_rx.changed().await.is_err() {
                        println!("[{}]   Control channel closed, stopping.", self.id);
                        return Ok(());
                    }
                    // 继续循环，重新检查信号状态
                    continue;
                }
                ControlSignal::Stopped => {
                    println!("[{}]   Stopped gracefully.", self.id);
                    return Ok(());
                }
            }
        }
    }
}
