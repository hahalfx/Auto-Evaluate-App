mod models;
mod db;
mod state;
mod services;
mod commands;
mod config;
mod config_manager;

use state::AppState;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化配置系统
    config_manager::init_config_system();
    
    // 加载环境变量（向后兼容）
    if let Err(e) = dotenv::dotenv() {
        log::warn!("无法加载.env文件: {}", e);
    } else {
        log::info!("成功加载.env文件");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_dialog::init())
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
            commands::get_all_samples_raw,
            commands::get_all_wake_words,
            commands::get_all_wake_words_raw,
            commands::create_task,
            commands::get_analysis_results,
            commands::get_machine_responses,
            commands::get_wake_detection_results,
            commands::check_wake_detection_results_exist,
            commands::delete_wake_detection_results_by_task,
            commands::create_sample,
            commands::create_wake_word,
            commands::update_task_status,
            commands::delete_task,
            commands::is_testing,
            commands::stop_testing,
            commands::create_samples_batch,
            commands::delete_sample,
            commands::delete_sample_safe,
            commands::delete_samples_batch,
            commands::delete_samples_batch_safe,
            commands::precheck_samples,
            commands::get_samples_by_task_id,
            commands::update_task_samples,
            commands::play_match_audio,
            commands::play_match_audio_with_url,
            commands::play_audio,
            commands::pause_workflow,
            commands::resume_workflow,
            commands::stop_workflow,
            commands::stop_ocr_session,
            commands::push_video_frame,
            commands::get_ocr_task_status,
            commands::new_meta_workflow,
            commands::delete_wake_word_safe,
            commands::get_timing_data_by_task,
            commands::start_visual_wake_detection,
            commands::start_visual_wake_detection_with_data,
            commands::stop_visual_wake_detection,
            commands::calibrate_visual_detection,
            commands::push_video_frame_visual,
            commands::validate_template_paths,
            commands::get_loaded_templates,
            commands::save_template_image,
            commands::get_templates_from_folder,
            commands::load_template_from_folder,
            commands::start_wake_detection_workflow,
            commands::delete_template_from_folder,
            commands::import_task_package,
            // Configuration commands
            config_manager::get_app_config,
            config_manager::update_app_config,
            config_manager::reset_app_config,
            config_manager::get_config_directory,
            config_manager::export_config,
            config_manager::import_config,
            config_manager::validate_config,
            config_manager::get_config_value,
            config_manager::set_config_value,
            config_manager::migrate_from_env,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
