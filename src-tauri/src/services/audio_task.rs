use async_trait::async_trait;
use tokio::sync::watch;
use std::error::Error;
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};

pub struct audio_task {
    pub id: String,
    pub keyword: String,
}

#[async_trait]
impl Task for audio_task {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        println!("开始播放音频文件 {} .", self.keyword);

        // 主控制循环 - 持续检查控制信号
        loop {
            let signal = control_rx.borrow().clone();
            match signal {
                ControlSignal::Running => {
                    // 只有在运行状态下才执行音频播放
                    println!("执行音频播放");
                    
                    // 使用 tokio::task::block_in_place 在异步上下文中执行同步播放
                    let keyword = self.keyword.clone();
                    let result = tokio::task::block_in_place(|| {
                        crate::services::audio_controller::play_matching_sync(&keyword)
                    });
                    
                    match result {
                        Ok(_) => {
                            println!("Task '{}' completed successfully.", self.keyword);
                            return Ok(());
                        }
                        Err(e) => {
                            eprintln!(
                                "Audio Task failed: {}. Stopping dependent tasks.",
                               e
                            );
                            // 错误处理策略：这里我们选择停止后续依赖此任务的所有流程
                            return Err(e.into());
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