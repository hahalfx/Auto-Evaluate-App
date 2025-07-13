use crate::services::workflow::{ControlSignal, Task, WorkflowContext};
use async_trait::async_trait;
use std::error::Error;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

pub struct ocr_task {
    pub id: String,
}

#[async_trait]
impl Task for ocr_task {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        println!("开始 {} 任务.", self.id);

        // 立即向前端发送 "start" 事件
        // 注意：这里使用 `?` 操作符，如果 `emit` 失败，整个函数会立即返回一个错误。
        // 这是一种更简洁的错误处理方式。
        if let Err(e) = app_handle.emit("ocr_event", "start".to_string()) {
            eprintln!("启动任务失败：无法发送初始事件。错误：{}", e);
            // 如果连启动事件都发不出去，任务没有意义，直接错误退出。
            return Err(e.into());
        }

        println!("初始事件发送成功，任务进入主监听循环。");

        // 现在我们进入主循环，等待信号从 Running 发生变化
        loop {
            // 核心：暂停在这里，等待控制信号发生变化。
            // 如果外部一直没有改变信号（信号保持Running），任务就会一直在这里高效地“睡眠”。
            if control_rx.changed().await.is_err() {
                // 如果控制通道关闭（发送端被丢弃），我们也应该优雅地停止任务。
                println!("控制通道已关闭，任务将停止。");
                // 尝试最后一次通知前端
                let _ = app_handle.emit("ocr_event", "stop".to_string());
                return Ok(());
            }

            // 当 .changed().await 完成后，说明信号一定发生了变化。
            // 我们获取这个新的信号值。
            let signal = control_rx.borrow().clone();

            // 根据新的信号状态执行相应的操作
            match signal {
                ControlSignal::Paused => {
                    println!("信号变更为 Paused，通知前端。");
                    if let Err(e) = app_handle.emit("ocr_event", "pause".to_string()) {
                        eprintln!("发送 pause 事件失败: {}", e);
                        return Err(e.into());
                    }
                    // 不需要做其他事，循环将回到顶部，再次等待 .changed().await
                }
                ControlSignal::Stopped => {
                    println!("信号变更为 Stopped，通知前端并退出任务。");
                    if let Err(e) = app_handle.emit("ocr_event", "stop".to_string()) {
                        eprintln!("发送 stop 事件失败: {}", e);
                        return Err(e.into());
                    }
                    // 成功发送停止事件后，优雅地退出任务
                    println!("[{}]   任务已正常停止。", self.id);
                    return Ok(()); // *** 唯一的正常退出点 ***
                }
                ControlSignal::Running => {
                    // 这个分支现在意味着：状态从 Paused 恢复到了 Running
                    println!("信号从 Paused 恢复为 Running，通知前端。");
                    // 为了更清晰，可以发送一个 "resume" 事件而不是 "start"
                    if let Err(e) = app_handle.emit("ocr_event", "resume".to_string()) {
                        eprintln!("发送 resume 事件失败: {}", e);
                        return Err(e.into());
                    }
                    // 同样，循环将回到顶部，等待下一次信号变化
                }
            }
        }
    }
}
