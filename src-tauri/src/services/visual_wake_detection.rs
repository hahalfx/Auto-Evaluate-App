use opencv::{prelude::*, imgproc};
use tauri::{Emitter, Manager};
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Serialize, Deserialize};
use base64;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualWakeEvent {
    pub event_type: String,
    pub confidence: Option<f64>,
    pub timestamp: i64,
    pub message: Option<String>,
}

pub struct VisualWakeDetector {
    templates: Vec<Mat>,
    threshold: f64,
    roi: Option<[i32; 4]>, // [x, y, width, height]
    is_calibrated: bool,
    last_process_time: std::time::Instant,
    min_interval_ms: u64,
    is_enabled: bool, // 手动控制是否启用
}

impl VisualWakeDetector {
    pub fn new() -> Self {
        Self {
            templates: Vec::new(),
            threshold: 0.6, // 降低阈值，更适合实际场景
            roi: None,
            is_calibrated: false,
            last_process_time: std::time::Instant::now(),
            min_interval_ms: 100, // 10 FPS
            is_enabled: false,
        }
    }

    /// 检查视觉检测是否已启用
    pub fn is_enabled(&self) -> bool {
        self.is_enabled
    }
    
    /// 手动设置启用状态
    pub fn set_enabled(&mut self, enabled: bool) {
        self.is_enabled = enabled;
    }

    /// 检查是否应该处理当前帧
    pub fn should_process_frame(&mut self) -> bool {
        // 首先检查检测器是否启用
        if !self.is_enabled {
            return false;
        }
        
        let now = std::time::Instant::now();
        if now.duration_since(self.last_process_time).as_millis() >= self.min_interval_ms as u128 {
            self.last_process_time = now;
            true
        } else {
            false
        }
    }

    /// 加载模板图像
    pub async fn load_templates(&mut self, template_paths: Vec<String>) -> Result<(), String> {
        self.templates.clear();
        
        for path in template_paths {
            let template = opencv::imgcodecs::imread(&path, opencv::imgcodecs::IMREAD_GRAYSCALE)
                .map_err(|e| format!("无法加载模板 {}: {}", path, e))?;
            
            if template.empty() {
                return Err(format!("模板图像为空: {}", path));
            }
            
            // 对模板进行预处理
            let processed_template = self.preprocess_image(&template)
                .map_err(|e| format!("模板预处理失败: {}", e))?;
            
            self.templates.push(processed_template);
        }
        
        println!("成功加载 {} 个模板", self.templates.len());
        Ok(())
    }

    /// 加载Base64模板数据
    pub async fn load_templates_from_base64(&mut self, template_data: Vec<(String, String)>) -> Result<(), String> {
        println!("🧹 清空现有模板");
        self.templates.clear();
        
        for (i, (filename, base64_data)) in template_data.iter().enumerate() {
            println!("📁 处理模板 {}/{}: {}", i + 1, template_data.len(), filename);
            println!("📏 Base64数据长度: {}", base64_data.len());
            
            // 解码Base64数据
            let decoded_data = base64::decode(&base64_data)
                .map_err(|e| {
                    println!("❌ Base64解码失败: {}", e);
                    format!("Base64解码失败 {}: {}", filename, e)
                })?;
            
            println!("✅ Base64解码成功，数据大小: {} bytes", decoded_data.len());
            
            // 将解码后的数据加载为OpenCV Mat
            let template = opencv::imgcodecs::imdecode(
                &opencv::core::Vector::from_slice(&decoded_data),
                opencv::imgcodecs::IMREAD_GRAYSCALE
            ).map_err(|e| {
                println!("❌ OpenCV图像解码失败: {}", e);
                format!("模板图像解码失败 {}: {}", filename, e)
            })?;
            
            if template.empty() {
                println!("❌ 解码后的图像为空");
                return Err(format!("模板图像为空: {}", filename));
            }
            
            println!("📐 图像尺寸: {}x{}", template.cols(), template.rows());
            
            // 对模板进行预处理
            let processed_template = self.preprocess_image(&template)
                .map_err(|e| {
                    println!("❌ 模板预处理失败: {}", e);
                    format!("模板预处理失败 {}: {}", filename, e)
                })?;
            
            self.templates.push(processed_template);
            println!("✅ 成功加载模板: {}", filename);
        }
        
        println!("🎉 成功加载 {} 个模板", self.templates.len());
        Ok(())
    }

    /// 设置兴趣区域
    pub fn set_roi(&mut self, roi: [i32; 4]) {
        self.roi = Some(roi);
        println!("设置ROI: {:?}", roi);
    }

    /// 图像预处理
    fn preprocess_image(&self, input: &Mat) -> opencv::Result<Mat> {
        let mut gray = Mat::default();

        // 如果输入是彩色图像，转换为灰度
        let channels = input.channels();
        if channels == 3 {
            imgproc::cvt_color_def(input, &mut gray, imgproc::COLOR_BGR2GRAY)?;
        } else {
            gray = input.clone();
        }

        // 简化预处理：直接使用灰度图像，保留更多细节
        let processed = gray;

        Ok(processed)
    }

    /// 执行模板匹配
    pub fn detect_wake_event(&self, frame_data: &[u8]) -> Result<Option<f64>, String> {
        if self.templates.is_empty() {
            return Err("未加载模板图像".to_string());
        }

        // 将字节数据转换为OpenCV Mat
        let frame = self.bytes_to_mat(frame_data)?;
        
        // 注意：前端已经进行了ROI裁剪，所以这里直接使用接收到的图像
        // 不需要再次进行ROI裁剪，避免坐标越界错误
        let frame_to_process = frame;

        // 预处理帧
        let processed_frame = self.preprocess_image(&frame_to_process)
            .map_err(|e| format!("帧预处理失败: {}", e))?;

        // 执行多尺度模板匹配
        let mut best_match_score = 0.0;
        
        for (i, template) in self.templates.iter().enumerate() {
            let mut template_best_score = 0.0;
            
            // 尝试不同的缩放比例
            let scales = vec![1.0, 0.8, 0.6, 0.4, 0.3, 0.2];
            
            for scale in scales {
                // 缩放模板
                let scaled_template = if scale != 1.0 {
                    let new_width = (template.cols() as f64 * scale) as i32;
                    let new_height = (template.rows() as f64 * scale) as i32;
                    
                    if new_width < 10 || new_height < 10 {
                        continue; // 跳过太小的模板
                    }
                    
                    let mut scaled = Mat::default();
                    imgproc::resize(
                        template,
                        &mut scaled,
                        opencv::core::Size::new(new_width, new_height),
                        0.0,
                        0.0,
                        imgproc::INTER_AREA,
                    ).map_err(|e| format!("模板缩放失败: {}", e))?;
                    scaled
                } else {
                    template.clone()
                };
                
                // 检查模板是否比图像大
                if scaled_template.cols() > processed_frame.cols() || 
                   scaled_template.rows() > processed_frame.rows() {
                    continue;
                }
                
                let mut result = Mat::default();
                
                imgproc::match_template(
                    &processed_frame,
                    &scaled_template,
                    &mut result,
                    imgproc::TM_CCOEFF_NORMED,
                    &Mat::default()
                ).map_err(|e| format!("模板匹配失败: {}", e))?;

                let mut min_val = 0.0;
                let mut max_val = 0.0;
                let mut min_loc = opencv::core::Point::default();
                let mut max_loc = opencv::core::Point::default();

                opencv::core::min_max_loc(
                    &result,
                    Some(&mut min_val),
                    Some(&mut max_val),
                    Some(&mut min_loc),
                    Some(&mut max_loc),
                    &Mat::default()
                ).map_err(|e| format!("查找匹配位置失败: {}", e))?;

                if max_val > template_best_score {
                    template_best_score = max_val;
                }
            }
            
            if template_best_score > best_match_score {
                best_match_score = template_best_score;
            }
            
            println!("模板 {} 最佳匹配度: {:.3}", i, template_best_score);
        }

        // 检查是否超过阈值
        if best_match_score >= self.threshold {
            Ok(Some(best_match_score))
        } else {
            Ok(None)
        }
    }

    /// 将字节数据转换为OpenCV Mat
    fn bytes_to_mat(&self, data: &[u8]) -> Result<Mat, String> {
        // 假设输入是JPEG格式
        let mat = opencv::imgcodecs::imdecode(
            &opencv::core::Vector::from_slice(data),
            opencv::imgcodecs::IMREAD_COLOR
        ).map_err(|e| format!("图像解码失败: {}", e))?;
        
        if mat.empty() {
            return Err("解码后的图像为空".to_string());
        }
        
        Ok(mat)
    }

    /// 动态阈值校准
    pub async fn calibrate_threshold(&mut self, frame_data: &[u8]) -> Result<(), String> {
        println!("开始校准视觉检测阈值...");
        
        // 在校准模式下运行收集匹配分数
        let mut scores = Vec::new();
        
        // 收集当前帧的匹配分数（不触发检测事件）
        if let Ok(frame) = self.bytes_to_mat(frame_data) {
            let processed_frame = self.preprocess_image(&frame)
                .map_err(|e| format!("帧预处理失败: {}", e))?;
            
            for template in &self.templates {
                let scales = vec![1.0, 0.8, 0.6, 0.4, 0.3, 0.2];
                
                for scale in scales {
                    let scaled_template = if scale != 1.0 {
                        let new_width = (template.cols() as f64 * scale) as i32;
                        let new_height = (template.rows() as f64 * scale) as i32;
                        
                        if new_width < 10 || new_height < 10 {
                            continue;
                        }
                        
                        let mut scaled = Mat::default();
                        imgproc::resize(
                            template,
                            &mut scaled,
                            opencv::core::Size::new(new_width, new_height),
                            0.0,
                            0.0,
                            imgproc::INTER_AREA,
                        ).map_err(|e| format!("模板缩放失败: {}", e))?;
                        scaled
                    } else {
                        template.clone()
                    };
                    
                    if scaled_template.cols() > processed_frame.cols() || 
                       scaled_template.rows() > processed_frame.rows() {
                        continue;
                    }
                    
                    let mut result = Mat::default();
                    if imgproc::match_template(
                        &processed_frame,
                        &scaled_template,
                        &mut result,
                        imgproc::TM_CCOEFF_NORMED,
                        &Mat::default()
                    ).is_ok() {
                        let mut max_val = 0.0;
                        if opencv::core::min_max_loc(
                            &result,
                            None,
                            Some(&mut max_val),
                            None,
                            None,
                            &Mat::default()
                        ).is_ok() {
                            scores.push(max_val);
                        }
                    }
                }
            }
        }
        
        if scores.is_empty() {
            return Err("校准失败：未收集到有效分数".to_string());
        }
        
        // 计算统计信息
        scores.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let max_score = scores.last().unwrap();
        let percentile_95 = scores[(scores.len() as f64 * 0.95) as usize];
        
        // 设置相对保守的阈值：95百分位数的85%
        self.threshold = percentile_95 * 0.85;
        self.is_calibrated = true;
        
        println!("校准完成：阈值设置为 {:.3} (最高分: {:.3}, 95%分位: {:.3})", 
                 self.threshold, max_score, percentile_95);
        
        Ok(())
    }

    /// 优化内存使用
    pub fn optimize_memory(&mut self) {
        // 限制模板数量
        if self.templates.len() > 10 {
            self.templates.truncate(10);
        }
        
        // 压缩模板图像
        for template in &mut self.templates {
            if template.rows() > 200 || template.cols() > 200 {
                let mut resized = Mat::default();
                imgproc::resize(
                    template,
                    &mut resized,
                    opencv::core::Size::new(200, 200),
                    0.0,
                    0.0,
                    imgproc::INTER_AREA,
                ).ok();
                *template = resized;
            }
        }
    }
}

/// 执行视觉唤醒检测
pub async fn perform_visual_wake_detection(
    image_data: &[u8],
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    // 获取或创建检测器实例
    let detector = get_or_create_detector().await;
    let mut detector_guard = detector.lock().await;
    
    // 检查检测器是否启用
    if !detector_guard.is_enabled() {
        return Ok(());
    }
    
    // 检查是否应该处理当前帧
    if !detector_guard.should_process_frame() {
        return Ok(());
    }
    
    // 执行检测
    match detector_guard.detect_wake_event(image_data) {
        Ok(Some(score)) => {
            println!("检测到唤醒事件！匹配度: {:.3}", score);
            
            // 自动禁用检测器，停止后续检测
            detector_guard.set_enabled(false);
            
            // 发送事件到前端
            let event_data = VisualWakeEvent {
                event_type: "wake_detected".to_string(),
                confidence: Some(score),
                timestamp: chrono::Utc::now().timestamp_millis(),
                message: Some(format!("检测到唤醒事件，匹配度: {:.3}", score)),
            };
            
            app_handle.emit("visual_wake_event", event_data)
                .map_err(|e| format!("发送事件失败: {}", e))?;
            
            // 发送任务完成事件，通知工作流结束任务
            app_handle.emit("task_completed", "visual_wake_detected")
                .map_err(|e| format!("发送任务完成事件失败: {}", e))?;
        }
        Ok(None) => {
            // 未检测到唤醒事件，可以选择发送低置信度事件
            let event_data = VisualWakeEvent {
                event_type: "no_wake_detected".to_string(),
                confidence: None,
                timestamp: chrono::Utc::now().timestamp_millis(),
                message: Some("未检测到唤醒事件".to_string()),
            };
            
            app_handle.emit("visual_wake_event", event_data).ok();
        }
        Err(e) => {
            eprintln!("视觉检测错误: {}", e);
            
            let event_data = VisualWakeEvent {
                event_type: "detection_error".to_string(),
                confidence: None,
                timestamp: chrono::Utc::now().timestamp_millis(),
                message: Some(format!("检测错误: {}", e)),
            };
            
            app_handle.emit("visual_wake_event", event_data).ok();
        }
    }
    
    Ok(())
}

// 全局检测器实例
static DETECTOR: once_cell::sync::Lazy<Arc<Mutex<VisualWakeDetector>>> = 
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(VisualWakeDetector::new())));

pub async fn get_or_create_detector() -> Arc<Mutex<VisualWakeDetector>> {
    DETECTOR.clone()
} 