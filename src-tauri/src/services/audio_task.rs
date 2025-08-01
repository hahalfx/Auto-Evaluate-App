use async_trait::async_trait;
use tauri::Emitter;
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
        // 检查是否应该跳过此任务（仅对语音指令播放任务，不是唤醒词播放任务）
        // 通过任务ID判断：wakeword_task_开头的任务是唤醒词播放任务，其他的是语音指令播放任务
        if !self.id.starts_with("wakeword_task_") { // 语音指令播放任务
            let context_reader = context.read().await;
            if let Some(should_skip) = context_reader.get("should_skip_task") {
                if let Some(flag) = should_skip.downcast_ref::<bool>() {
                    if *flag {
                        println!("[AudioTask '{}'] Wake detection failed, skipping audio task", self.id);
                        return Ok(());
                    }
                }
            }
        }
        
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
                        if let Some(url) = audio_dir {
                            crate::services::audio_controller::play(&url)
                        } else {
                            // 如果没有提供URL，使用关键字查找匹配的音频文件
                            crate::services::audio_controller::play_matching_sync(&keyword, None)
                        }
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

                            app_handle.emit("task_completed", "wake_task_completed").unwrap();
                            
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