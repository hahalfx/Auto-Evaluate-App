use crate::models::VideoFrame;
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};
use async_trait::async_trait;
use std::error::Error;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
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

        // 发送结构化的开始事件
        let start_event = serde_json::json!({
            "type": "start",
            "task_id": self.id,
            "timestamp": chrono::Utc::now().timestamp_millis(),
            "message": "OCR任务开始，准备初始化"
        });

        if let Err(e) = app_handle.emit("ocr_task_event", start_event) {
            eprintln!("启动任务失败：无法发送初始事件。错误：{}", e);
            return Err(e.into());
        }

        // 修复：从app_handle获取AppState
        let state = app_handle.state::<Arc<crate::state::AppState>>();

        // 创建帧通道
        let (frame_tx, mut frame_rx) = mpsc::channel::<VideoFrame>(100);

        // 设置帧发送器到AppState
        {
            let mut sender_guard = state.ocr_frame_sender.lock().await;
            *sender_guard = Some(frame_tx);
        }

        println!("OCR任务初始化完成，等待视频帧...");

        // 发送结构化的就绪信号给前端
        let ready_event = serde_json::json!({
            "type": "ready",
            "task_id": self.id,
            "timestamp": chrono::Utc::now().timestamp_millis(),
            "message": "OCR任务已准备就绪，开始处理视频帧"
        });

        if let Err(e) = app_handle.emit("ocr_task_event", ready_event) {
            eprintln!("发送OCR就绪信号失败：{}", e);
            return Err(e.into());
        }
        println!("OCR就绪信号已发送给前端");

        let mut processed_frames = 0;
        let mut last_fps_calculation = std::time::Instant::now();
        let mut frame_count_for_fps = 0;
        let mut consecutive_errors = 0;
        let max_consecutive_errors = 5;

        // 添加超时机制
        let task_timeout = tokio::time::Duration::from_secs(30);
        let start_time = tokio::time::Instant::now();
        let mut last_frame_time = tokio::time::Instant::now();
        let frame_timeout = tokio::time::Duration::from_secs(10); // 10秒没有帧就超时

        // 主处理循环
        loop {
            // 检查控制信号
            tokio::select! {
                        // 监听控制信号
                        signal_result = control_rx.changed() => {
                            if signal_result.is_err() {
                                println!("控制通道已关闭，任务将停止。");
                                let _ = app_handle.emit("ocr_event", "stop".to_string());
                                break;
                            }

                            let signal = control_rx.borrow().clone();
                            match signal {
                                ControlSignal::Paused => {
                                    println!("信号变更为 Paused，通知前端。");
                                    let _ = app_handle.emit("ocr_event", "pause".to_string());
                                    // 等待恢复信号
                                    while let Ok(()) = control_rx.changed().await {
                                        if *control_rx.borrow() == ControlSignal::Running {
                                            break;
                                        }
                                    }
                                    let _ = app_handle.emit("ocr_event", "resume".to_string());
                                }
                                ControlSignal::Stopped => {
                                    println!("信号变更为 Stopped，通知前端并退出任务。");
                                    let _ = app_handle.emit("ocr_event", "stop".to_string());
                                    break;
                                }
                                ControlSignal::Running => {
                                    // 继续处理
                                }
                            }
                        }

                        // 监听视频帧
                        frame_result = frame_rx.recv() => {
                            match frame_result {
                                Some(frame) => {
                                    // 更新最后接收帧的时间
                                    last_frame_time = tokio::time::Instant::now();

                                    // 处理视频帧
                                    let should_stop = match crate::services::ocr_engine::perform_ocr(
                                        frame.data.clone(),
                                        frame.timestamp,
                                        (*state).clone(),
                                    ).await {
                                         Ok(session_result) => {
                                            consecutive_errors = 0; // 重置错误计数

                                            // 从返回的结构体中直接访问 should_stop_ocr 字段
                                            let stop_signal = session_result.should_stop_ocr;

                                            if stop_signal {
                                                // 在这里可以访问 session_result 中的任何信息
                                                println!("会话完成，最终文本: {}", session_result.final_text);
                                                //我希望在这里把得到的seesion_result写入workflow_context中以便在finsh_task任务中将相应数据写入数据库的相应字段

                                                context.write().await.insert(self.id(), Box::new(session_result));
                                            }

                                            stop_signal // 将布尔值返回给 should_stop 变量
                                        }
                                        Err(e) => {
                                            consecutive_errors += 1;
                                            eprintln!("处理帧失败 ({}/{}): {}", consecutive_errors, max_consecutive_errors, e);

                                            // 发送错误事件到前端
                                            let error_event = serde_json::json!({
                                                "type": "error",
                                                "task_id": self.id,
                                                "error": e.to_string(),
                                                "consecutive_errors": consecutive_errors
                                            });
                                            let _ = app_handle.emit("ocr_task_event", error_event);

                                            if consecutive_errors >= max_consecutive_errors {
                                                let error_msg = format!("连续 {} 次处理帧失败，任务终止", max_consecutive_errors);
                                                eprintln!("{}", error_msg);

                                                let stop_event = serde_json::json!({
                                                    "type": "stop",
                                                    "task_id": self.id,
                                                    "reason": "too_many_errors",
                                                    "message": error_msg
                                                });
                                                let _ = app_handle.emit("ocr_task_event", stop_event);

                                                return Err(error_msg.into());
                                            }
                                            false
                                        }
                                    };

                                    processed_frames += 1;
                                    frame_count_for_fps += 1;

                                    // 计算FPS
                                    let now = std::time::Instant::now();
                                    if now.duration_since(last_fps_calculation).as_secs() >= 1 {
                                        let fps = frame_count_for_fps as f32 / now.duration_since(last_fps_calculation).as_secs_f32();
                                        println!("当前FPS: {:.1}", fps);

                                        // 发送状态更新
                                        let status = crate::models::OcrTaskStatus {
                                            is_running: true,
                                            processed_frames,
                                            queue_size: 0, // 简化处理
                                            current_fps: fps,
                                        };
                                        let _ = app_handle.emit("ocr_status", status);

                                        last_fps_calculation = now;
                                        frame_count_for_fps = 0;
                                    }

                                    // 检查是否应该停止（基于session_manager）
                                    if should_stop {
                                        println!("OCR会话完成，检测到稳定结果，准备停止任务");

                                        // 先发送会话完成事件
                                        let complete_event = serde_json::json!({
                                            "type": "session_complete",
                                            "task_id": self.id,
                                            "processed_frames": processed_frames,
                                            "message": "OCR会话完成"
                                        });
                                        let _ = app_handle.emit("ocr_task_event", complete_event);


                                        // 然后正常退出循环，让任务自然完成
                                        break;
                                    }
                                }
                                None => {
                                    // 通道已关闭
                                    println!("帧接收通道已关闭");
                                    break;
                                }
                            }
                        }

                        // 超时检查
                        _ = tokio::time::sleep(tokio::time::Duration::from_secs(1)) => {
                            let now = tokio::time::Instant::now();

                            // 检查整体任务超时
                            if start_time.elapsed() > task_timeout {
                                let timeout_msg = format!("OCR任务超时 ({} 秒)", task_timeout.as_secs());
                                eprintln!("{}", timeout_msg);

                                let timeout_event = serde_json::json!({
                                    "type": "stop",
                                    "task_id": self.id,
                                    "reason": "timeout",
                                    "message": timeout_msg,
                                    "processed_frames": processed_frames
                                });
                                let _ = app_handle.emit("ocr_task_event", timeout_event);

                                return Err(timeout_msg.into());
                            }

                            // 检查帧接收超时（只有在处理过帧之后才检查）
                            if processed_frames > 0 && now.duration_since(last_frame_time) > frame_timeout {
                                let frame_timeout_msg = format!("超过 {} 秒未接收到视频帧", frame_timeout.as_secs());
                                println!("警告: {}", frame_timeout_msg);

                                let warning_event = serde_json::json!({
                                    "type": "warning",
                                    "task_id": self.id,
                                    "message": frame_timeout_msg
                                });
                                let _ = app_handle.emit("ocr_task_event", warning_event);

                                // 可以选择继续等待或者终止任务
                                // 这里选择继续等待，但发出警告
                            }
                        }
                    }
        }

        // 清理资源并发送停止事件
        {
            let mut sender_guard = state.ocr_frame_sender.lock().await;
            *sender_guard = None;
        }

        // 发送任务完成事件
        let stop_event = serde_json::json!({
            "type": "stop",
            "task_id": self.id,
            "reason": "completed",
            "message": "OCR任务正常完成",
            "processed_frames": processed_frames,
            "timestamp": chrono::Utc::now().timestamp_millis()
        });
        let _ = app_handle.emit("ocr_task_event", stop_event);

        println!(
            "[{}] 任务已正常停止。共处理 {} 帧",
            self.id, processed_frames
        );
        Ok(())
    }
}
