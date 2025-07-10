mod models;
mod db;
mod state;
mod services;
mod commands;
mod permissions;

use state::AppState;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 加载环境变量
    if let Err(e) = dotenv::dotenv() {
        log::warn!("无法加载.env文件: {}", e);
    } else {
        log::info!("成功加载.env文件");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_macos_permissions::init())
        .setup(|app| {
            // 初始化应用状态
            let app_handle = app.handle().clone();
            
            // 使用应用本地数据目录下的数据库文件
            let app_local_data_dir = match app.path().app_local_data_dir() {
                Ok(path) => path,
                Err(e) => {
                    let err_msg = format!("无法获取应用本地数据目录: {}", e);
                    log::error!("{}", err_msg);
                    // Box the tauri::Error directly, as it implements std::error::Error
                    return Err(Box::new(e) as Box<dyn std::error::Error + Send + Sync>);
                }
            };
            
            // Ensure the main app local data directory exists
            if let Err(e) = std::fs::create_dir_all(&app_local_data_dir) {
                log::error!("创建应用本地数据目录失败: {}", e);
                return Err(Box::new(e));
            }
            
            // 创建数据库文件路径 directly in app_local_data_dir
            let db_path = app_local_data_dir.join("llm_analysis.db");
            let database_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy()); // Added ?mode=rwc
            log::info!("数据库路径 (with mode=rwc): {}", database_url);
            
            // 在 setup 中同步初始化数据库
            let result = tauri::async_runtime::block_on(async {
                AppState::new(&database_url).await
            });
            
            match result {
                Ok(state) => {
                    app_handle.manage(Arc::new(state));
                    log::info!("数据库初始化成功: {}", database_url);
                }
                Err(e) => {
                    log::error!("数据库初始化失败: {}", e);
                    return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("数据库初始化失败: {}", e))));
                }
            }


            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_all_tasks,
            commands::get_current_task,
            commands::set_current_task,
            commands::get_all_samples,
            commands::get_all_wake_words,
            commands::create_task,
            commands::get_task_progress,
            commands::get_analysis_results,
            commands::get_machine_responses,
            commands::create_sample,
            commands::create_wake_word,
            commands::update_task_status,
            commands::delete_task,
            commands::is_testing,
            commands::stop_testing,
            commands::create_samples_batch,
            commands::delete_sample,
            commands::delete_sample_safe,
            commands::get_samples_by_task_id,
            commands::update_task_samples,
            commands::play_match_audio,
            commands::new_workflow,
            commands::pause_workflow,
            commands::resume_workflow,
            commands::stop_workflow,
            commands::test_audio_permissions,
            commands::request_microphone_permission,
            commands::check_microphone_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
