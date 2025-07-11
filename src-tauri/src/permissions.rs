#[cfg(target_os = "macos")]
pub fn request_microphone_permission() -> Result<bool, String> {
    use std::sync::mpsc;
    use block::ConcreteBlock;
    use cocoa::base::YES;
    use objc::runtime::BOOL;
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use log::{info, error};

    info!("开始请求麦克风权限");

    let (tx, rx) = mpsc::channel();

    unsafe {
        let av_audio_session_class = Class::get("AVAudioSession").unwrap();
        let shared_instance: *mut Object = msg_send![av_audio_session_class, sharedInstance];

        let block = ConcreteBlock::new(move |granted: BOOL| {
            let permission_granted = granted == YES;
            info!("麦克风权限请求结果: {}", permission_granted);
            tx.send(permission_granted).unwrap();
        });
        let block = block.copy();

        let _: () = msg_send![shared_instance, requestRecordPermission: block];
    }

    // 等待回调完成
    match rx.recv() {
        Ok(granted) => {
            if granted {
                info!("✅ 麦克风权限已授予");
                Ok(true)
            } else {
                error!("❌ 麦克风权限被拒绝");
                Ok(false)
            }
        }
        Err(e) => {
            error!("权限请求失败: {}", e);
            Err(format!("权限请求失败: {}", e))
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn request_microphone_permission() -> Result<bool, String> {
    // 非macOS平台默认返回true
    Ok(true)
}

#[cfg(target_os = "macos")]
pub fn check_microphone_permission() -> bool {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use log::info;

    unsafe {
        let av_audio_session_class = Class::get("AVAudioSession").unwrap();
        let shared_instance: *mut Object = msg_send![av_audio_session_class, sharedInstance];
        
        // 获取录音权限状态
        let permission_status: i32 = msg_send![shared_instance, recordPermission];
        
        // AVAudioSessionRecordPermission枚举值:
        // Undetermined = 1970168948 ('undt')
        // Denied = 1684369017 ('deny') 
        // Granted = 1735552628 ('grnt')
        
        let granted = permission_status == 1735552628; // 'grnt'
        info!("当前麦克风权限状态: {} ({})", if granted { "已授予" } else { "未授予" }, permission_status);
        granted
    }
}

#[cfg(not(target_os = "macos"))]
pub fn check_microphone_permission() -> bool {
    // 非macOS平台默认返回true
    true
}
