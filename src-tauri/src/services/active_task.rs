use async_trait::async_trait;
use tauri::Emitter;
use tokio::sync::watch;
use std::error::Error;
use std::time::{Duration, Instant};
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};
use crate::services::visual_wake_detection::get_or_create_detector;

#[derive(Debug, Clone)]
pub struct VisualWakeConfig {
    pub template_data: Vec<(String, String)>,
    // pub roi: Option<[i32; 4]>,
    pub frame_rate: u32,
    pub threshold: f64,
    pub max_detection_time_secs: Option<u64>, // 最大检测时间（秒）
}

pub struct ActiveTask {
    pub id: String,
    pub visual_wake_config: VisualWakeConfig,
}

impl ActiveTask {
    pub fn new(id: String, visual_wake_config: VisualWakeConfig) -> Self {
        Self { id, visual_wake_config }
    }
}

#[async_trait]
impl Task for ActiveTask {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        _context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        let config = &self.visual_wake_config;
        let detector = get_or_create_detector().await;
        let mut detector_guard = detector.lock().await;
        // 加载模板和参数
        detector_guard.load_templates_from_base64(config.template_data.clone()).await?;
        detector_guard.set_enabled(false); // 初始关闭
        // if let Some(roi) = config.roi {
        //     detector_guard.set_roi(roi);
        // }
        // detector_guard.set_threshold(config.threshold);
        drop(detector_guard);

        let mut last_signal = ControlSignal::Stopped;
        let mut wake_detected = false; // 标记是否检测到唤醒事件
        let mut detection_start_time: Option<Instant> = None; // 检测开始时间
        let max_detection_time = config.max_detection_time_secs
            .map(|secs| Duration::from_secs(secs))
            .unwrap_or(Duration::from_secs(30)); // 默认30秒超时
        
        loop {
            let signal = control_rx.borrow().clone();
            if signal != last_signal {
                let mut detector_guard = detector.lock().await;
                match signal {
                    ControlSignal::Running => {
                        detector_guard.set_enabled(true);
                        detection_start_time = Some(Instant::now()); // 记录检测开始时间
                        app_handle.emit("active_task_info", "started").ok();
                        println!("ActiveTask: 唤醒前端进行检测，最大检测时间: {}秒", max_detection_time.as_secs());
                    }
                    ControlSignal::Paused => {
                        detector_guard.set_enabled(false);
                        detection_start_time = None; // 暂停时重置开始时间
                        app_handle.emit("active_task_info", "stopped").ok();
                    }
                    ControlSignal::Stopped => {
                        detector_guard.set_enabled(false);
                        app_handle.emit("active_task_info", "stopped").ok();
                        return Ok(());
                    }
                }
                last_signal = signal;
            }
            
            // 检查检测器状态
            let detector_guard = detector.lock().await;
            if detector_guard.is_enabled() {
                // 检查是否超时
                if let Some(start_time) = detection_start_time {
                    let elapsed = start_time.elapsed();
                    if elapsed >= max_detection_time {
                        drop(detector_guard);
                        println!("ActiveTask: 检测超时 ({}秒)，未检测到唤醒事件", max_detection_time.as_secs());
                        app_handle.emit("active_task_info", "timeout").ok();
                        app_handle.emit("task_completed", "active_task_timeout").ok();
                        return Ok(());
                    }
                }
                
                // 如果检测器仍然启用，继续等待
                drop(detector_guard);
                // 等待信号变化或超时，使用更短的检查间隔
                tokio::select! {
                    _ = control_rx.changed() => {
                        // 控制信号变化，检查是否需要停止
                        let signal = control_rx.borrow().clone();
                        if signal == ControlSignal::Stopped {
                            let mut detector_guard = detector.lock().await;
                            detector_guard.set_enabled(false);
                            app_handle.emit("active_task_info", "stopped").ok();
                            return Ok(());
                        }
                    }
                    _ = tokio::time::sleep(std::time::Duration::from_millis(500)) => {
                        // 每500ms检查一次检测器状态，以便更快响应
                        continue;
                    }
                }
            } else {
                // 检测器被禁用，检查是否是因为检测到唤醒事件
                drop(detector_guard);
                
                // 如果检测器被禁用且不是因为手动停止，说明检测到了唤醒事件
                if !wake_detected && last_signal != ControlSignal::Stopped {
                    wake_detected = true;
                    println!("ActiveTask: 检测器被禁用，检测到了唤醒事件，任务完成");
                    app_handle.emit("active_task_info", "stopped").ok();
                    app_handle.emit("task_completed", "active_task_completed").ok();
                    return Ok(());
                } else if last_signal == ControlSignal::Stopped {
                    // 手动停止的情况
                    app_handle.emit("active_task_info", "stopped").ok();
                    return Ok(());
                }
            }
        }
    }
}