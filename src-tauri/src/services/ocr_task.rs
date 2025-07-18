use crate::commands::stop_ocr_session;
use crate::models::VideoFrame;
use crate::services::ocr_engine::{initialize_ocr_pool, shutdown_ocr_pool};
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};
use async_trait::async_trait;
use std::error::Error;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, Mutex, Semaphore};
use tokio::sync::watch;
use tokio::time::{timeout, Duration};

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

        // 修复：从app_handle获取AppState
        let state = app_handle.state::<Arc<crate::state::AppState>>();

        // 2. 从 State 守卫中拿到内部的 Arc<AppState>
        let state_arc = state.inner().clone();

        // 初始化OCR引擎
        //如果不clone，父函数就会在调用子函数后“失去”它的 state_arc。
        initialize_ocr_pool(state_arc.clone(), &app_handle, 6)
            .await
            .ok();

        // 创建帧通道
        let (frame_tx, mut frame_rx) = mpsc::channel::<VideoFrame>(100);

        // 设置帧发送器到AppState
        {
            let mut sender_guard = state_arc.ocr_frame_sender.lock().await;
            *sender_guard = Some(frame_tx);
        }

        println!("OCR任务初始化完成，等待视频帧...");

         // --- 并发处理核心：在这里初始化并发原语 ---

        // 1. 创建一个信号量，许可数量与OCR引擎数量相同，用于控制并发度
        let semaphore = Arc::new(Semaphore::new(6));

        // 2. 创建原子变量来安全地在并发任务间共享状态
        let processed_frames = Arc::new(AtomicU64::new(0));
        let frame_count_for_fps = Arc::new(AtomicU64::new(0));
        let consecutive_errors = Arc::new(AtomicUsize::new(0));
        let stop_signal_received = Arc::new(AtomicBool::new(false));
        let max_consecutive_errors = 5;

        //唤醒前端来向后端传递帧数据
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

        let frame_timeout = tokio::time::Duration::from_secs(10);
        let last_frame_time = Arc::new(Mutex::new(std::time::Instant::now()));

        // --- 监控任务：独立计算FPS和检查超时 ---
        let monitoring_stop_signal = stop_signal_received.clone();
        let monitoring_frame_count = frame_count_for_fps.clone();
        let monitoring_last_frame_time = last_frame_time.clone();
        let monitoring_processed_frames = processed_frames.clone();
        let monitoring_frame_rx_len = {
            // This is a bit tricky as we can't directly share `frame_rx.len()`
            // A simple way is to just print it from the main loop when needed,
            // or create another atomic for it if high accuracy is required.
            // For now, we'll just print from the main loop's perspective.
        };

        tokio::spawn(async move {
            let mut last_fps_calculation = std::time::Instant::now();
            loop {
                if monitoring_stop_signal.load(Ordering::SeqCst) {
                    break;
                }

                tokio::time::sleep(Duration::from_secs(1)).await;

                let now = std::time::Instant::now();
                let elapsed_secs = now.duration_since(last_fps_calculation).as_secs_f32();

                if elapsed_secs >= 1.0 {
                    let count = monitoring_frame_count.swap(0, Ordering::SeqCst);
                    let fps = if elapsed_secs > 0.0 {
                        count as f32 / elapsed_secs
                    } else {
                        0.0
                    };
                    println!("当前处理FPS: {:.1}", fps);
                    last_fps_calculation = now;
                }

                if monitoring_processed_frames.load(Ordering::SeqCst) > 0 {
                    let last_frame_t = *monitoring_last_frame_time.lock().await;
                    if now.duration_since(last_frame_t) > frame_timeout {
                        println!("警告: 超过 {} 秒未接收到视频帧", frame_timeout.as_secs());
                        // Consider sending a warning event to the frontend here
                    }
                }
            }
        });


        // 主处理循环
        loop {
            // 检查全局停止信号
            if stop_signal_received.load(Ordering::SeqCst) {
                println!("检测到全局停止信号，准备退出主循环。");
                break;
            }

            // 检查控制信号
            tokio::select! {
                biased;
                // 监听控制信号
                signal_result = control_rx.changed() => {
                    if signal_result.is_err() {
                        println!("控制通道已关闭，任务将停止。");
                        let stop_event = serde_json::json!({
                            "type": "stop",
                            "task_id": self.id,
                            "reason": "控制通道已关闭，任务将停止。",
                            "message": "控制通道已关闭，任务将停止。",
                        });
                        let _ = app_handle.emit("ocr_task_event", stop_event);
                        stop_signal_received.store(true, Ordering::SeqCst);
                        break;
                    }

                    let signal = control_rx.borrow().clone();
                    match signal {
                        ControlSignal::Paused => {
                            println!("信号变更为 Paused，通知前端。");
                            let stop_event = serde_json::json!({
                            "type": "stop",
                            "task_id": self.id,
                            "reason": "信号变更为 Paused。",
                            "message": "信号变更为 Paused。",
                        });
                        let _ = app_handle.emit("ocr_task_event", stop_event);
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
                            stop_signal_received.store(true, Ordering::SeqCst);
                            break;
                        }
                        ControlSignal::Running => {
                            // 继续处理
                        }
                    }
                }

                // 监听并派发帧处理任务
                Ok(permit) = semaphore.clone().acquire_owned() => {
                    // 成功获取到一个信号量许可，意味着有一个OCR引擎是空闲的
                    // 现在我们可以去接收一帧并为它创建一个处理任务

                    if let Some(frame) = frame_rx.recv().await {
                        // 更新最后接收帧的时间
                        *last_frame_time.lock().await = std::time::Instant::now();

                        // 克隆所有需要在新任务中使用的共享资源
                        let state_clone = state_arc.clone();
                        let context_clone = context.clone();
                        let app_handle_clone = app_handle.clone();
                        let task_id_clone = self.id.clone();
                        let stop_signal_clone = stop_signal_received.clone();
                        let processed_frames_clone = processed_frames.clone();
                        let frame_count_for_fps_clone = frame_count_for_fps.clone();
                        let consecutive_errors_clone = consecutive_errors.clone();

                        // 使用 tokio::spawn 创建一个并发任务来处理这一帧
                        tokio::spawn(async move {
                            // `permit` 被移动到这里，当这个 spawned 任务结束时，它会被自动丢弃，
                            // 从而释放一个信号量许可，允许下一个等待的任务开始。
                            let _permit = permit;

                            let ocr_result = crate::services::ocr_engine::perform_ocr(
                                frame.data, // 不再需要 clone frame.data
                                frame.timestamp,
                                state_clone,
                            ).await;
                            
                            processed_frames_clone.fetch_add(1, Ordering::SeqCst);
                            frame_count_for_fps_clone.fetch_add(1, Ordering::SeqCst);

                            match ocr_result {
                                Ok(session_result) => {
                                    // 重置连续错误计数
                                    consecutive_errors_clone.store(0, Ordering::SeqCst);

                                    if session_result.should_stop_ocr {
                                        println!("一个会话完成，最终文本: {}", session_result.final_text);
                                        // 写入上下文
                                        context_clone.write().await.insert(task_id_clone.clone(), Box::new(session_result));
                                        // 设置全局停止标志
                                        stop_signal_clone.store(true, Ordering::SeqCst);
                                    }
                                }
                                Err(e) => {
                                    let error_count = consecutive_errors_clone.fetch_add(1, Ordering::SeqCst) + 1;
                                    eprintln!("处理帧失败 ({}/{}): {}", error_count, max_consecutive_errors, e);

                                    // 发送错误事件到前端
                                    let error_event = serde_json::json!({
                                        "type": "error", "task_id": task_id_clone, "error": e.to_string()
                                    });
                                    let _ = app_handle_clone.emit("ocr_task_event", error_event);

                                    if error_count >= max_consecutive_errors {
                                        eprintln!("连续 {} 次处理帧失败，任务将终止", max_consecutive_errors);
                                        // 设置全局停止标志
                                        stop_signal_clone.store(true, Ordering::SeqCst);
                                    }
                                }
                            }
                        });
                    } else {
                        // 通道已关闭
                        println!("帧接收通道已关闭，退出任务。");
                        stop_signal_received.store(true, Ordering::SeqCst);
                        break;
                    }
                }

            }
        }

        println!("任务主循环已退出，开始清理资源...");
        let final_processed_count = processed_frames.load(Ordering::SeqCst);

        // 要先把前端的调用停了
        // 发送任务完成事件
        let stop_event = serde_json::json!({
            "type": "stop",
            "task_id": self.id,
            "reason": "completed",
            "message": "OCR任务正常完成",
            "processed_frames": final_processed_count,
            "timestamp": chrono::Utc::now().timestamp_millis()
        });
        let _ = app_handle.emit("ocr_task_event", stop_event);

        // -----------------------------------------------------
        // 第一个逻辑块：清理 ocr_channel
        // -----------------------------------------------------
        {
            println!("获取appstate中的ocr_channel（带2秒超时）...");
            let lock_timeout = Duration::from_secs(2);

            // 使用 tokio::time::timeout 包裹 lock() 操作
            let lock_result = timeout(lock_timeout, state_arc.ocr_channel.lock()).await;

            match lock_result {
                // Ok(guard) 代表在超时时间内成功获取了锁
                Ok(mut channel_guard) => {
                    if channel_guard.is_some() {
                        println!("获得ocr_channel成功，开始清理OCR通道");
                        *channel_guard = None;
                    } else {
                        println!("ocr_channel已经是None，无需清理");
                    }
                }
                // Err(_) 代表超时
                Err(_) => {
                    // 在这里打印你的超时提醒
                    eprintln!(
                        "警告：清理 OCR 通道失败，在 {} 秒内无法获取锁。可能存在死锁或任务繁忙。",
                        lock_timeout.as_secs()
                    );
                    // 这里你可以选择继续执行后续代码，或者返回一个错误
                }
            }
        }

        // -----------------------------------------------------
        // 第二个逻辑块：清理 ocr_frame_sender
        // -----------------------------------------------------
        {
            println!("获取appstate中的ocr_frame_sender（带2秒超时）...");
            let lock_timeout = Duration::from_secs(2);

            // 对第二个锁应用相同的模式
            let lock_result = timeout(lock_timeout, state_arc.ocr_frame_sender.lock()).await;

            match lock_result {
                Ok(mut sender_guard) => {
                    if sender_guard.is_some() {
                        println!("获得ocr_frame_sender成功，开始清理帧发送器");
                        *sender_guard = None;
                    } else {
                        println!("ocr_frame_sender已经是None，无需清理");
                    }
                }
                Err(_) => {
                    eprintln!(
                        "警告：清理帧发送器失败，在 {} 秒内无法获取锁。可能存在死锁或任务繁忙。",
                        lock_timeout.as_secs()
                    );
                }
            }
        }

        // 重置会话管理器
        println!("清除appstate中的ocr_session_manager");
        state_arc.clone().ocr_session_manager.lock().reset();

        shutdown_ocr_pool(state_arc.clone()).await.ok();

        println!("[{}] 任务已正常停止。共处理 {} 帧", self.id, final_processed_count);
        Ok(())
    }
}
