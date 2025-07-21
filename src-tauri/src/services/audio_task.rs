use async_trait::async_trait;
use tokio::sync::watch;
use tokio::time;
use std::error::Error;
use chrono::Utc;
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};
use crate::models::TimingData;

pub struct audio_task {
    pub id: String,
    pub keyword: String,
    pub url : Option<String>,
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
                    time::sleep(std::time::Duration::from_secs(1)).await;
                    
                    // 记录语音指令开始时间
                    let voice_start_time = Utc::now();
                    println!("[{}] Voice command started at: {}", self.id, voice_start_time);
                    
                    // 使用 tokio::task::block_in_place 在异步上下文中执行同步播放
                    let keyword = self.keyword.clone();
                    let audio_dir = self.url.clone();
                    let result = tokio::task::block_in_place(|| {
                        crate::services::audio_controller::play_matching_sync(&keyword, audio_dir)
                    });
                    
                    // 记录语音指令结束时间
                    let voice_end_time = Utc::now();
                    println!("[{}] Voice command ended at: {}", self.id, voice_end_time);
                    
                    match result {
                        Ok(_) => {
                            println!("Task '{}' completed successfully.", self.keyword);
                            
                            // 将时间数据保存到context中
                            let mut timing = TimingData::new();
                            timing.voice_command_start_time = Some(voice_start_time);
                            timing.voice_command_end_time = Some(voice_end_time);
                            
                            context.write().await.insert(
                                format!("{}_timing", self.id),
                                Box::new(timing)
                            );
                            
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