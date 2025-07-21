use opencv::{prelude::*, imgproc};
use tauri::{Emitter, AppHandle};
use std::sync::Arc;
// ... existing code ...
    /// 图像预处理
    fn preprocess_image(&self, input: &Mat) -> opencv::Result<Mat> {
        let mut gray = Mat::default();
        
        // 如果输入是彩色图像，转换为灰度
        if input.channels() == 3 {
            imgproc::cvt_color_def(input, &mut gray, imgproc::COLOR_BGR2GRAY)?;
        } else {
// ... existing code ...
        // 将字节数据转换为OpenCV Mat
        let frame = self.bytes_to_mat(frame_data)?;
        
        // 预处理帧
        let processed_frame = if let Some(roi) = self.roi {
            let roi_rect = opencv::core::Rect::new(roi[0], roi[1], roi[2], roi[3]);
            let roi_frame = Mat::roi(&frame, roi_rect).map_err(|e| format!("ROI裁剪失败: {}", e))?;
            self.preprocess_image(&roi_frame)
                .map_err(|e| format!("帧预处理失败: {}", e))?
        } else {
            self.preprocess_image(&frame)
                .map_err(|e| format!("帧预处理失败: {}", e))?
        };

        // 执行模板匹配
        let mut best_match_score = 0.0;
// ... existing code ...
/// 执行视觉唤醒检测
pub async fn perform_visual_wake_detection(
    image_data: &[u8],
    app_handle: &AppHandle,
) -> Result<(), String> {
    // 获取或创建检测器实例
    let detector = get_or_create_detector().await;
// ... existing code ...
            app_handle.emit("visual_wake_event", event_data)
                .map_err(|e| format!("发送事件失败: {}", e))?;
        }
        Ok(None) => {
// ... existing code ...
            app_handle.emit("visual_wake_event", event_data).ok();
        }
        Err(e) => {
            eprintln!("视觉检测错误: {}", e);
// ... existing code ...
            app_handle.emit("visual_wake_event", event_data).ok();
        }
    }
    
    Ok(())
}
// ... existing code ...
