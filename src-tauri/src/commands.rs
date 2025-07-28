use crate::models::*;
use crate::services::active_task::VisualWakeConfig;
use crate::services::meta_task_executor::meta_task_executor;
use crate::services::wake_detection_meta_executor::wake_detection_meta_executor;
use crate::services::workflow::Workflow;
use crate::services::visual_wake_detection::get_or_create_detector;
use crate::state::AppState;
use chrono::Utc;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{Emitter, State};
use tokio::time::{timeout, Duration};

#[tauri::command]
pub async fn get_all_tasks(state: State<'_, Arc<AppState>>) -> Result<Vec<Task>, String> {
    state
        .db
        .get_all_tasks()
        .await
        .map_err(|e| format!("获取任务列表失败: {}", e))
}

#[tauri::command]
pub async fn get_current_task(state: State<'_, Arc<AppState>>) -> Result<Option<Task>, String> {
    let current_task_id = state.current_task_id.read().await;
    if let Some(task_id) = *current_task_id {
        state
            .db
            .get_task_by_id(task_id)
            .await
            .map_err(|e| format!("获取当前任务失败: {}", e))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn set_current_task(state: State<'_, Arc<AppState>>, task_id: u32) -> Result<(), String> {
    // 验证任务是否存在
    let task = state
        .db
        .get_task_by_id(task_id as i64)
        .await
        .map_err(|e| format!("获取任务失败: {}", e))?;

    if task.is_none() {
        return Err("任务不存在".to_string());
    }

    *state.current_task_id.write().await = Some(task_id as i64);
    Ok(())
}

#[tauri::command]
pub async fn get_all_samples(state: State<'_, Arc<AppState>>) -> Result<Vec<TestSample>, String> {
    state
        .db
        .get_all_samples()
        .await
        .map_err(|e| format!("获取样本列表失败: {}", e))
}

#[tauri::command]
pub async fn get_all_samples_raw(state: State<'_, Arc<AppState>>) -> Result<Vec<TestSampleRow>, String> {
    state
        .db
        .get_all_samples_raw()
        .await
        .map_err(|e| format!("获取样本原始数据失败: {}", e))
}

#[tauri::command]
pub async fn get_all_wake_words(state: State<'_, Arc<AppState>>) -> Result<Vec<WakeWord>, String> {
    state
        .db
        .get_all_wake_words()
        .await
        .map_err(|e| format!("获取唤醒词列表失败: {}", e))
}

#[tauri::command]
pub async fn get_all_wake_words_raw(state: State<'_, Arc<AppState>>) -> Result<Vec<WakeWordRow>, String> {
    state
        .db
        .get_all_wake_words_raw()
        .await
        .map_err(|e| format!("获取唤醒词原始数据失败: {}", e))
}

#[tauri::command]
pub async fn create_task(
    state: State<'_, Arc<AppState>>,
    name: String,
    test_samples_ids: Vec<u32>,
    wake_word_ids: Vec<u32>,
) -> Result<i64, String> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let task = Task {
        id: 0, // 将被数据库自动分配
        name,
        test_samples_ids,
        wake_word_ids,
        machine_response: None,
        test_result: None,
        task_status: "pending".to_string(),
        task_progress: Some(0.0),
        created_at: now,
        audio_type: None,
        audio_file: None,
        audio_duration: None,
        audio_category: None,
        test_collection: None,
        test_duration: None,
        sentence_accuracy: None,
        word_accuracy: None,
        character_error_rate: None,
        recognition_success_rate: None,
        total_words: None,
        insertion_errors: None,
        deletion_errors: None,
        substitution_errors: None,
        fastest_recognition_time: None,
        slowest_recognition_time: None,
        average_recognition_time: None,
        completed_samples: None,
    };

    state
        .db
        .create_task(&task)
        .await
        .map_err(|e| format!("创建任务失败: {}", e))
}

// #[tauri::command]
// pub async fn get_task_progress(state: State<'_, Arc<AppState>>) -> Result<TaskProgress, String> {
//     let current_task_id = state.current_task_id.read().await;
//     if let Some(task_id) = *current_task_id {
//         let task = state
//             .db
//             .get_task_by_id(task_id)
//             .await
//             .map_err(|e| format!("获取任务失败: {}", e))?
//             .ok_or("任务不存在")?;

//         let completed_count = state
//             .db
//             .get_analysis_results_by_task(task_id)
//             .await
//             .map_err(|e| format!("获取分析结果失败: {}", e))?
//             .len() as u32;

//         Ok(TaskProgress {
//             value: task.task_progress.unwrap_or(0.0),
//             current: completed_count,
//             total: task.test_samples_ids.len() as u32,
//         })
//     } else {
//         Ok(TaskProgress {
//             value: 0.0,
//             current: 0,
//             total: 0,
//         })
//     }
// }

#[tauri::command]
pub async fn get_analysis_results(
    state: State<'_, Arc<AppState>>,
) -> Result<std::collections::HashMap<u32, AnalysisResult>, String> {
    let current_task_id = state.current_task_id.read().await;
    if let Some(task_id) = *current_task_id {
        state
            .db
            .get_analysis_results_by_task(task_id)
            .await
            .map_err(|e| format!("获取分析结果失败: {}", e))
    } else {
        Ok(std::collections::HashMap::new())
    }
}

#[tauri::command]
pub async fn get_machine_responses(
    state: State<'_, Arc<AppState>>,
) -> Result<std::collections::HashMap<u32, MachineResponseData>, String> {
    let current_task_id = state.current_task_id.read().await;
    if let Some(task_id) = *current_task_id {
        state
            .db
            .get_machine_responses_by_task(task_id)
            .await
            .map_err(|e| format!("获取车机响应失败: {}", e))
    } else {
        Ok(std::collections::HashMap::new())
    }
}

#[tauri::command]
pub async fn get_wake_detection_results(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<Vec<crate::services::wake_detection_meta_executor::WakeDetectionResult>, String> {
    state
        .db
        .get_wake_detection_results_by_task(task_id as i64)
        .await
        .map_err(|e| format!("获取唤醒检测结果失败: {}", e))
}

#[tauri::command]
pub async fn check_wake_detection_results_exist(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<bool, String> {
    state
        .db
        .check_wake_detection_results_exist(task_id as i64)
        .await
        .map_err(|e| format!("检查唤醒检测结果失败: {}", e))
}

#[tauri::command]
pub async fn delete_wake_detection_results_by_task(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<(), String> {
    state
        .db
        .delete_wake_detection_results_by_task(task_id as i64)
        .await
        .map_err(|e| format!("删除唤醒检测结果失败: {}", e))
}

#[tauri::command]
pub async fn create_sample(
    state: State<'_, Arc<AppState>>,
    text: String,
    audio_file: Option<String>, // Added audio_file parameter
) -> Result<i64, String> {
    state
        .db
        .create_sample(&text, audio_file.as_deref())
        .await
        .map_err(|e| format!("创建样本失败: {}", e))
}

#[tauri::command]
pub async fn create_wake_word(
    state: State<'_, Arc<AppState>>,
    text: String,
    audio_file: Option<String>, // Added audio_file parameter
) -> Result<i64, String> {
    state
        .db
        .create_wake_word(&text, audio_file.as_deref())
        .await
        .map_err(|e| format!("创建唤醒词失败: {}", e))
}

#[derive(serde::Deserialize)]
pub struct WakeWordCreationPayload {
    text: String,
    audio_file: Option<String>,
}

#[tauri::command]
pub async fn create_wake_words_batch(
    state: State<'_, Arc<AppState>>,
    wakewords: Vec<WakeWordCreationPayload>,
) -> Result<Vec<i64>, String> {
    let wakewords_to_create: Vec<(String, Option<String>)> = wakewords
        .into_iter()
        .map(|w| (w.text, w.audio_file))
        .collect();
    state
        .db
        .create_wake_words_batch(wakewords_to_create)
        .await
        .map_err(|e| format!("批量创建唤醒词失败: {}", e))
}

#[tauri::command]
pub async fn delete_wake_word(
    state: State<'_, Arc<AppState>>,
    wake_word_id: u32,
) -> Result<(), String> {
    state
        .db
        .delete_wake_word(wake_word_id as i64)
        .await
        .map_err(|e| format!("删除唤醒词 {} 失败: {}", wake_word_id, e))
}

#[tauri::command]
pub async fn delete_wake_word_safe(
    state: State<'_, Arc<AppState>>,
    wake_word_id: u32,
) -> Result<(), String> {
    state
        .db
        .delete_wake_word_safe(wake_word_id as i64)
        .await
        .map_err(|e| format!("安全删除唤醒词 {} 失败: {}", wake_word_id, e))
}

#[tauri::command]
pub async fn update_task_status(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
    status: String,
) -> Result<(), String> {
    state
        .db
        .update_task_status(task_id as i64, &status)
        .await
        .map_err(|e| format!("更新任务状态失败: {}", e))
}

#[tauri::command]
pub async fn delete_task(state: State<'_, Arc<AppState>>, task_id: u32) -> Result<(), String> {
    // 如果删除的是当前任务，清除当前任务ID
    let current_task_id = state.current_task_id.read().await;
    if let Some(current_id) = *current_task_id {
        if current_id == task_id as i64 {
            drop(current_task_id);
            *state.current_task_id.write().await = None;
        }
    }

    state
        .db
        .delete_task(task_id as i64)
        .await
        .map_err(|e| format!("删除任务失败: {}", e))
}

#[tauri::command]
pub async fn is_testing(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    Ok(*state.is_testing.read().await)
}

#[tauri::command]
pub async fn stop_testing(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    *state.is_testing.write().await = false;
    Ok(())
}

/// 推送视频帧到OCR处理队列 (最佳实践)
#[tauri::command]
pub async fn push_video_frame(
    image_data: Vec<u8>,
    timestamp: u64,
    width: u32,
    height: u32,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    // 步骤 1: 检查OCR任务是否启动
    let sender_clone = {
        let sender_guard = state.ocr_frame_sender.lock().await;
        match sender_guard.as_ref() {
            Some(sender) => sender.clone(),
            None => return Err("OCR任务未启动，请先启动OCR任务".to_string()),
        }
    };

    // 步骤 3: OCR处理逻辑
    let frame = crate::models::VideoFrame {
        data: image_data,
        timestamp,
        width,
        height,
    };

    const SEND_TIMEOUT: Duration = Duration::from_millis(75);
    
    match timeout(SEND_TIMEOUT, sender_clone.send(frame)).await {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(_)) => Err("发送视频帧失败，OCR任务可能已停止".to_string()),
        Err(_) => Err("发送视频帧超时，处理队列繁忙，已丢弃当前帧".to_string()),
    }
}

/// 获取OCR任务状态
#[tauri::command]
pub async fn get_ocr_task_status(state: State<'_, Arc<AppState>>) -> Result<crate::models::OcrTaskStatus, String> {
    // 这里简化实现，实际应该从ocr_task获取实时状态
    Ok(crate::models::OcrTaskStatus {
        is_running: state.ocr_frame_sender.lock().await.is_some(),
        processed_frames: 0,
        queue_size: 0,
        current_fps: 0.0,
    })
}

#[derive(serde::Serialize)]
pub struct BatchCreationResult {
    created_ids: Vec<i64>,
    ignored_count: usize,
}



#[tauri::command]
pub async fn create_samples_batch(
    state: State<'_, Arc<AppState>>,
    samples: Vec<SampleCreationPayload>,
) -> Result<BatchCreationResult, String> {
    let samples_to_create: Vec<(String, Option<String>)> = samples
        .into_iter()
        .map(|s| (s.text, s.audio_file))
        .collect();
    
    let (created_ids, ignored_count) = state
        .db
        .create_samples_batch(samples_to_create)
        .await
        .map_err(|e| format!("批量创建样本失败: {}", e))?;

    Ok(BatchCreationResult {
        created_ids,
        ignored_count,
    })
}

// Define a helper struct for the payload of create_samples_batch
#[derive(serde::Deserialize)]
pub struct SampleCreationPayload {
    text: String,
    audio_file: Option<String>,
}

#[tauri::command]
pub async fn delete_sample(state: State<'_, Arc<AppState>>, sample_id: u32) -> Result<(), String> {
    state
        .db
        .delete_sample(sample_id as i64)
        .await
        .map_err(|e| format!("删除样本 {} 失败: {}", sample_id, e))
}

#[tauri::command]
pub async fn delete_sample_safe(
    state: State<'_, Arc<AppState>>,
    sample_id: u32,
) -> Result<(), String> {
    state
        .db
        .delete_sample_safe(sample_id as i64)
        .await
        .map_err(|e| format!("安全删除样本 {} 失败: {}", sample_id, e))
}

#[derive(serde::Serialize)]
pub struct BatchDeleteResult {
    successfully_deleted_ids: Vec<u32>,
    failed_ids: Vec<u32>,
    skipped_ids: Vec<u32>,
}

#[tauri::command]
pub async fn delete_samples_batch(
    state: State<'_, Arc<AppState>>,
    sample_ids: Vec<u32>,
) -> Result<BatchDeleteResult, String> {
    let sample_ids_i64: Vec<i64> = sample_ids.into_iter().map(|id| id as i64).collect();
    let (successful, failed) = state
        .db
        .delete_samples_batch(sample_ids_i64)
        .await
        .map_err(|e| format!("批量删除样本失败: {}", e))?;
    
    Ok(BatchDeleteResult {
        successfully_deleted_ids: successful.into_iter().map(|id| id as u32).collect(),
        failed_ids: failed.into_iter().map(|id| id as u32).collect(),
        skipped_ids: Vec::new(),
    })
}

#[tauri::command]
pub async fn delete_samples_batch_safe(
    state: State<'_, Arc<AppState>>,
    sample_ids: Vec<u32>,
) -> Result<BatchDeleteResult, String> {
    let sample_ids_i64: Vec<i64> = sample_ids.into_iter().map(|id| id as i64).collect();
    let (successful, failed, skipped) = state
        .db
        .delete_samples_batch_safe(sample_ids_i64)
        .await
        .map_err(|e| format!("安全批量删除样本失败: {}", e))?;
    
    Ok(BatchDeleteResult {
        successfully_deleted_ids: successful.into_iter().map(|id| id as u32).collect(),
        failed_ids: failed.into_iter().map(|id| id as u32).collect(),
        skipped_ids: skipped.into_iter().map(|id| id as u32).collect(),
    })
}

#[derive(serde::Serialize)]
pub struct PrecheckResult {
    new_texts: Vec<String>,
    duplicate_texts: Vec<String>,
}

#[tauri::command]
pub async fn precheck_samples(
    state: State<'_, Arc<AppState>>,
    texts: Vec<String>,
) -> Result<PrecheckResult, String> {
    let (new_texts, duplicate_texts) = state
        .db
        .precheck_samples(texts)
        .await
        .map_err(|e| format!("预检查样本失败: {}", e))?;
    
    Ok(PrecheckResult {
        new_texts,
        duplicate_texts,
    })
}

#[tauri::command]
pub async fn get_samples_by_task_id(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<Vec<TestSample>, String> {
    state
        .db
        .get_samples_by_task_id(task_id as i64)
        .await
        .map_err(|e| format!("获取任务 {} 的样本列表失败: {}", task_id, e))
}

#[tauri::command]
pub async fn update_task_samples(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
    sample_ids: Vec<u32>,
) -> Result<(), String> {
    let sample_ids_i64: Vec<i64> = sample_ids.into_iter().map(|id| id as i64).collect();
    state
        .db
        .update_task_samples(task_id as i64, sample_ids_i64)
        .await
        .map_err(|e| format!("更新任务 {} 的样本关联失败: {}", task_id, e))
}

#[tauri::command]
pub async fn play_match_audio(
    state: State<'_, Arc<AppState>>,
    keyword: String,
) -> Result<(), String> {
    state
        .audio_controller
        .play_matching(keyword)
        .await
        .map_err(|e| format!("播放匹配音频失败: {}", e))
}

#[tauri::command]
pub async fn play_match_audio_with_url(
    state: State<'_, Arc<AppState>>,
    keyword: String,
    url: String,
) -> Result<(), String> {
    state
        .audio_controller
        .play_matching_sync(keyword, Some(url))
        .await
        .map_err(|e| format!("播放匹配音频失败: {}", e))
}

#[tauri::command]
pub async fn play_audio(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<(), String> {
    state.audio_controller.play(path).await.map_err(|e| format!("播放音频失败: {}", e))
}

#[tauri::command]
pub async fn pause_workflow(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut workflow_handle_guard = state.workflow_handle.lock().await;
    if let Some(handle) = workflow_handle_guard.as_mut() {
        handle.pause();
    }

    Ok(())
}

#[tauri::command]
pub async fn resume_workflow(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut workflow_handle_guard = state.workflow_handle.lock().await;
    if let Some(handle) = workflow_handle_guard.as_mut() {
        handle.resume();
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_workflow(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut workflow_handle_guard = state.workflow_handle.lock().await;
    if let Some(handle) = workflow_handle_guard.as_mut() {
        handle.stop();
    }

    Ok(())
}

#[tauri::command]
pub async fn start_ocr_session(
    state: State<'_, Arc<AppState>>,
    channel: Channel,
) -> Result<(), String> {
    // This command now only registers the communication channel.
    // The engine must be initialized separately by the `initialize_ocr_engine` command.
    *state.ocr_channel.lock().await = Some(channel);
    
    // 重置OCR会话状态
    state.ocr_session_manager.lock().reset();
    println!("OCR Session Started. Channel registered and session reset.");
    Ok(())
}

#[tauri::command]
pub async fn stop_ocr_session(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    println!("Stop OCR session requested, waiting for task to complete naturally...");
    
    
    // 清理 Channel 和相关资源
    {
        let mut channel_guard = state.ocr_channel.lock().await;
        if channel_guard.is_some() {
            println!("Cleaning up OCR channel...");
            *channel_guard = None;
        }
    }
    
    // 清理帧发送器
    {
        let mut sender_guard = state.ocr_frame_sender.lock().await;
        if sender_guard.is_some() {
            println!("Cleaning up OCR frame sender...");
            *sender_guard = None;
        }
    }
    
    // 重置会话管理器
    state.ocr_session_manager.lock().reset();
    
    println!("OCR Session Stopped. All resources cleaned up.");
    Ok(())
}

#[tauri::command]
pub async fn new_meta_workflow(
    state: State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
    wake_word_id: Option<u32>, // 可选的唤醒词ID，如果没有提供则使用任务的第一个
    template_data: Option<Vec<(String, String)>>, // 可选的模板数据
    frame_rate: Option<u32>, // 可选的帧率，默认10
    threshold: Option<f64>, // 可选的阈值，默认0.5
    max_detection_time_secs: Option<u64>, // 可选的最大检测时间，默认30秒
) -> Result<(), String> {
    // 1. 获取任务ID
    let task_id = state.current_task_id.read().await.ok_or("没有设置当前任务ID")?;

    // 2. 从数据库一次性获取所有需要的数据
    let task_samples = state.db.get_samples_by_task_id(task_id)
        .await
        .map_err(|e| e.to_string())?;
    
    if task_samples.is_empty() {
        return Err("任务样本列表为空".to_string());
    }

    let task = state.db.get_task_by_id(task_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("任务不存在")?;
    
    // 3. 选择唤醒词
    let selected_wake_word_id = if let Some(wid) = wake_word_id {
        // 验证提供的唤醒词ID是否属于当前任务
        if !task.wake_word_ids.contains(&wid) {
            return Err("指定的唤醒词不属于当前任务".to_string());
        }
        wid
    } else if let Some(first_wake_word_id) = task.wake_word_ids.first() {
        *first_wake_word_id
    } else {
        return Err("任务没有关联的唤醒词".to_string());
    };

    let wakeword = state.db.get_wake_word_by_id(selected_wake_word_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("唤醒词不存在")?;

    // 4. 创建视觉配置
    let visual_config = VisualWakeConfig {
        template_data: template_data.unwrap_or_else(|| vec![]), // 如果没有提供模板，使用空列表
        frame_rate: frame_rate.unwrap_or(10),
        threshold: threshold.unwrap_or(0.5),
        max_detection_time_secs: Some(max_detection_time_secs.unwrap_or(5)), // 提供默认值5秒
    };

    // 5. 创建主工作流
    let (mut main_workflow, _) = Workflow::new();

    // 6. 创建元任务，传入视觉配置
    let multi_sample_executor = meta_task_executor::new(
        &format!("multi_sample_task_{}", task_id),
        task_id,
        task_samples,
        wakeword,
        visual_config, // 传入视觉配置
        state.inner().clone(),
    );

    // 7. 将元任务作为唯一任务添加到主工作流
    main_workflow.add_task(multi_sample_executor);

    // 8. 运行主工作流，获取总控制句柄
    let handle = main_workflow.run(app_handle).await;

    // 9. 将总控制句柄存入全局状态
    let mut workflow_handle_guard = state.workflow_handle.lock().await;
    *workflow_handle_guard = Some(handle);

    Ok(())
}

#[tauri::command]
pub async fn get_timing_data_by_task(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<std::collections::HashMap<u32, crate::models::TimingData>, String> {
    state
        .db
        .get_timing_data_by_task(task_id as i64)
        .await
        .map_err(|e| format!("获取时间参数失败: {}", e))
}

#[tauri::command]
pub async fn start_wake_detection_workflow(
    state: State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
    template_data: Vec<(String, String)>,
    frame_rate: u32,
    threshold: f64,
) -> Result<(), String> {
    // 1. 获取当前任务ID
    let task_id = state.current_task_id.read().await.ok_or("没有设置当前任务ID")?;

    // 2. 从数据库获取任务信息
    let task = state.db.get_task_by_id(task_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("任务不存在")?;

    if task.wake_word_ids.is_empty() {
        return Err("任务没有关联的唤醒词".to_string());
    }

    // 3. 创建视觉配置
    let visual_config = VisualWakeConfig {
        template_data,
        frame_rate,
        threshold,
        max_detection_time_secs: Some(5),
    };

    // 4. 创建主工作流
    let (mut main_workflow, _) = Workflow::new();

    // 5. 创建唤醒检测元任务
    let wake_detection_executor = wake_detection_meta_executor::new(
        &format!("wake_detection_task_{}", task_id),
        task_id,
        visual_config,
        state.inner().clone(),
    );

    // 6. 将元任务添加到主工作流
    main_workflow.add_task(wake_detection_executor);

    // 7. 运行主工作流，获取总控制句柄
    let handle = main_workflow.run(app_handle).await;

    // 8. 将总控制句柄存入全局状态
    let mut workflow_handle_guard = state.workflow_handle.lock().await;
    *workflow_handle_guard = Some(handle);

    Ok(())
}

// ==================== 视觉唤醒检测相关命令 ====================

/// 启动视觉唤醒检测
#[tauri::command]
pub async fn start_visual_wake_detection(
    template_paths: Vec<String>,
    roi: Option<[i32; 4]>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let detector = get_or_create_detector().await;
    let mut _detector_guard = detector.lock().await;
    
    // 由于现在使用HTML文件选择器，暂时跳过模板加载
    // 后续可以改为接受Base64数据
    println!("启动视觉检测，模板数量: {}", template_paths.len());
    
    // 手动启用检测器
    _detector_guard.set_enabled(true);
    
    // 设置ROI
    if let Some(roi_data) = roi {
        _detector_guard.set_roi(roi_data);
    }
    
    // 发送启动事件
    app_handle.emit("visual_wake_status", "started").ok();
    
    Ok(())
}

/// 启动视觉唤醒检测（使用Base64模板数据）
#[tauri::command]
pub async fn start_visual_wake_detection_with_data(
    template_data: Vec<(String, String)>, // (文件名, Base64数据)
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!("🚀 start_visual_wake_detection_with_data 被调用");
    println!("📊 接收到的模板数据数量: {}", template_data.len());
    
    let detector = get_or_create_detector().await;
    let mut detector_guard = detector.lock().await;
    
    println!("🔒 获取检测器锁成功");
    
    // 加载Base64模板数据
    println!("📷 开始加载模板数据...");
    match detector_guard.load_templates_from_base64(template_data).await {
        Ok(_) => println!("✅ 模板加载成功"),
        Err(e) => {
            println!("❌ 模板加载失败: {}", e);
            return Err(e);
        }
    }
    
    // 手动启用检测器
    detector_guard.set_enabled(true);
    println!("🟢 检测器已启用");
    
    // 发送启动事件
    match app_handle.emit("visual_wake_status", "started") {
        Ok(_) => println!("📡 启动事件发送成功"),
        Err(e) => println!("📡 启动事件发送失败: {}", e),
    }
    
    println!("🎉 视觉检测启动完成");
    Ok(())
}

/// 停止视觉唤醒检测
#[tauri::command]
pub async fn stop_visual_wake_detection(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let detector = get_or_create_detector().await;
    let mut detector_guard = detector.lock().await;
    
    // 禁用检测器
    detector_guard.set_enabled(false);
    
    // 发送停止事件
    app_handle.emit("visual_wake_status", "stopped").ok();
    
    Ok(())
}

/// 校准视觉检测阈值
#[tauri::command]
pub async fn calibrate_visual_detection(
    frame_data: Vec<u8>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let detector = get_or_create_detector().await;
    let mut detector_guard = detector.lock().await;
    
    detector_guard.calibrate_threshold(&frame_data).await?;
    
    // 发送校准完成事件
    app_handle.emit("visual_wake_status", "calibrated").ok();
    
    Ok(())
}

/// 验证模板路径是否有效
#[tauri::command]
pub async fn validate_template_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    let mut valid_paths = Vec::new();
    
    for path in paths {
        if std::path::Path::new(&path).exists() {
            // 检查文件扩展名
            if let Some(extension) = std::path::Path::new(&path).extension() {
                let ext = extension.to_string_lossy().to_lowercase();
                if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "bmp") {
                    valid_paths.push(path);
                }
            }
        }
    }
    
    Ok(valid_paths)
}

/// 获取已加载的模板信息
#[tauri::command]
pub async fn get_loaded_templates() -> Result<Vec<String>, String> {
    // 从检测器中获取当前已加载的模板路径
    let detector = get_or_create_detector().await;
    let _detector_guard = detector.lock().await;
    
    // 简单实现，返回空数组（实际实现需要在VisualWakeDetector中添加获取模板路径的方法）
    Ok(Vec::new())
}

/// 推送视频帧到视觉检测（独立于OCR）
#[tauri::command]
pub async fn push_video_frame_visual(
    image_data: Vec<u8>,
    _timestamp: u64,
    _width: u32,
    _height: u32,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // 直接执行视觉检测，让函数内部检查状态
    // 这样可以避免竞态条件
    if let Err(e) = crate::services::visual_wake_detection::perform_visual_wake_detection(&image_data, &app_handle).await {
        eprintln!("视觉检测失败: {}", e);
        return Err(format!("视觉检测失败: {}", e));
    }

    Ok(())
}

/// 保存模板图像到templates文件夹
#[tauri::command]
pub async fn save_template_image(
    filename: String,
    image_data: String, // Base64编码的图像数据
) -> Result<(), String> {
    use std::fs;
    use std::path::Path;
    use base64::prelude::*;

    // 创建templates目录（如果不存在）
    // 使用相对路径指向主目录的public/templates
    let templates_dir = Path::new("../public/templates");
    if !templates_dir.exists() {
        fs::create_dir_all(templates_dir)
            .map_err(|e| format!("创建templates目录失败: {}", e))?;
    }

    // 构建完整的文件路径
    let file_path = templates_dir.join(&filename);

    // 解码Base64数据
    let image_bytes = BASE64_STANDARD
        .decode(&image_data)
        .map_err(|e| format!("Base64解码失败: {}", e))?;

    // 写入文件
    fs::write(&file_path, image_bytes)
        .map_err(|e| format!("保存文件失败: {}", e))?;

    println!("✅ 模板图像已保存: {:?}", file_path);
    Ok(())
}

/// 获取templates文件夹中的所有模板文件
#[tauri::command]
pub async fn get_templates_from_folder() -> Result<Vec<String>, String> {
    use std::fs;
    use std::path::Path;

    // 使用相对路径指向主目录的public/templates
    let templates_dir = Path::new("../public/templates");
    
    if !templates_dir.exists() {
        return Ok(Vec::new());
    }

    let mut template_files = Vec::new();
    
    match fs::read_dir(templates_dir) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(extension) = path.extension() {
                            let ext = extension.to_string_lossy().to_lowercase();
                            // 只包含图片文件
                            if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "bmp") {
                                if let Some(filename) = path.file_name() {
                                    template_files.push(filename.to_string_lossy().to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            return Err(format!("读取templates目录失败: {}", e));
        }
    }

    // 排序文件名
    template_files.sort();
    Ok(template_files)
}

/// 从templates文件夹加载指定模板的Base64数据
#[tauri::command]
pub async fn load_template_from_folder(filename: String) -> Result<String, String> {
    use std::fs;
    use std::path::Path;
    use base64::prelude::*;

    // 使用相对路径指向主目录的public/templates
    let templates_dir = Path::new("../public/templates");
    let file_path = templates_dir.join(&filename);

    if !file_path.exists() {
        return Err(format!("模板文件不存在: {}", filename));
    }

    // 读取文件
    let file_bytes = fs::read(&file_path)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    // 转换为Base64
    let base64_data = BASE64_STANDARD.encode(&file_bytes);
    
    Ok(base64_data)
}

#[tauri::command]
pub async fn delete_template_from_folder(filename: String) -> Result<(), String> {
    use std::path::Path;
    
    // 使用相对路径指向主目录的public/templates
    let templates_dir = Path::new("../public/templates");
    let file_path = templates_dir.join(&filename);

    if file_path.exists() && file_path.is_file() {
        std::fs::remove_file(file_path).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("模板文件不存在: {}", filename))
    }
}

// ==================== 任务包导入相关命令 ====================

use std::path::Path;
use calamine::{Reader, open_workbook};

// 路径规范化辅助函数
fn normalize_path(path: &Path) -> String {
    // 转换为绝对路径（如果可能）
    let absolute_path = if path.is_relative() {
        // 对于相对路径，我们保持原样，但确保格式一致
        path.to_string_lossy().to_string()
    } else {
        path.to_string_lossy().to_string()
    };
    
    // 统一路径分隔符
    let normalized = if cfg!(windows) {
        absolute_path.replace('/', "\\")
    } else {
        absolute_path.replace('\\', "/")
    };
    
    // 移除末尾的斜杠（如果有）
    normalized.trim_end_matches(|c| c == '/' || c == '\\').to_string()
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TaskPackageImportResult {
    pub task_id: i64,
    pub wake_words_created: usize,
    pub samples_created: usize,
    pub wake_words_ignored: usize,
    pub samples_ignored: usize,
}

#[tauri::command]
pub async fn import_task_package(
    state: State<'_, Arc<AppState>>,
    package_path: String,
    task_name: String,
) -> Result<TaskPackageImportResult, String> {
    println!("Rust import_task_package - 接收到的参数:");
    println!("  package_path: {:?}", package_path);
    println!("  package_path类型: {}", std::any::type_name::<String>());
    println!("  package_path长度: {}", package_path.len());
    println!("  task_name: {:?}", task_name);
    
    // 检查路径是否为空或无效
    if package_path.trim().is_empty() {
        return Err("接收到的路径为空".to_string());
    }
    
    // 如果路径是"/"，说明可能有问题
    if package_path == "/" {
        return Err("接收到根路径，这可能表示dialog API有问题".to_string());
    }
    
    let package_path = Path::new(&package_path);
    
    // 添加调试信息
    println!("导入任务包 - 路径: {:?}", package_path);
    println!("导入任务包 - 路径存在: {}", package_path.exists());
    println!("导入任务包 - 是目录: {}", package_path.is_dir());
    
    // 验证任务包路径
    if !package_path.exists() || !package_path.is_dir() {
        return Err(format!("任务包路径不存在或不是目录: {:?}", package_path));
    }

    // 列出目录内容以进行调试
    if let Ok(entries) = std::fs::read_dir(package_path) {
        println!("目录内容:");
        for entry in entries {
            if let Ok(entry) = entry {
                println!("  - {:?}", entry.file_name());
            }
        }
    }

    // 查找Excel文件
    let wake_word_excel = package_path.join("唤醒词语料列表.xlsx");
    let sample_excel = package_path.join("测试语料列表.xlsx");
    
    println!("唤醒词Excel路径: {:?}, 存在: {}", wake_word_excel, wake_word_excel.exists());
    println!("测试语料Excel路径: {:?}, 存在: {}", sample_excel, sample_excel.exists());
    
    if !wake_word_excel.exists() {
        return Err(format!("未找到唤醒词语料列表.xlsx文件，路径: {:?}", wake_word_excel));
    }
    
    if !sample_excel.exists() {
        return Err(format!("未找到测试语料列表.xlsx文件，路径: {:?}", sample_excel));
    }

    // 查找audio文件夹
    let audio_dir = package_path.join("audio");
    println!("audio文件夹路径: {:?}, 存在: {}, 是目录: {}", audio_dir, audio_dir.exists(), audio_dir.is_dir());
    
    if !audio_dir.exists() || !audio_dir.is_dir() {
        return Err(format!("未找到audio文件夹，路径: {:?}", audio_dir));
    }

    let wake_word_audio_dir = audio_dir.join("wakeword");
    let sample_audio_dir = audio_dir.join("samples");
    
    println!("wakeword文件夹路径: {:?}, 存在: {}, 是目录: {}", wake_word_audio_dir, wake_word_audio_dir.exists(), wake_word_audio_dir.is_dir());
    println!("samples文件夹路径: {:?}, 存在: {}, 是目录: {}", sample_audio_dir, sample_audio_dir.exists(), sample_audio_dir.is_dir());
    
    if !wake_word_audio_dir.exists() || !wake_word_audio_dir.is_dir() {
        return Err(format!("未找到audio/wakeword文件夹，路径: {:?}", wake_word_audio_dir));
    }
    
    if !sample_audio_dir.exists() || !sample_audio_dir.is_dir() {
        return Err(format!("未找到audio/samples文件夹，路径: {:?}", sample_audio_dir));
    }

    // 读取唤醒词Excel文件
    let wake_words_data = read_excel_file(&wake_word_excel)?;
    
    // 读取测试语料Excel文件
    let samples_data = read_excel_file(&sample_excel)?;

    // 处理唤醒词 - 确保所有Excel中的数据都包含在任务中
    let mut wake_word_ids = Vec::new();
    let mut wake_words_created = 0;
    let mut wake_words_ignored = 0;
    
    // 准备唤醒词数据（包含音频文件路径）
    let mut wake_words_with_files = Vec::new();
    let mut processed_wake_words = std::collections::HashSet::new();
    
    for (filename, text) in wake_words_data {
        // 跳过重复的文本
        if processed_wake_words.contains(&text) {
            println!("跳过重复的唤醒词文本: {}", text);
            continue;
        }
        processed_wake_words.insert(text.clone());
        
        let audio_path = wake_word_audio_dir.join(&filename);
        let audio_file = if audio_path.exists() {
            // 规范化路径
            let normalized_path = normalize_path(&audio_path);
            Some(normalized_path)
        } else {
            println!("警告: 唤醒词音频文件不存在: {:?}", audio_path);
            None
        };
        
        wake_words_with_files.push((text, audio_file));
    }
    
    // 使用新的预检查函数
    let (new_wake_words, duplicate_wake_words) = state.db.precheck_wake_words(wake_words_with_files.clone())
        .await
        .map_err(|e| format!("预检查唤醒词失败: {}", e))?;
    
    // 处理新的唤醒词
    for (text, audio_file) in new_wake_words {
        let new_wake_word_id = state.db.create_wake_word(&text, audio_file.as_deref())
            .await
            .map_err(|e| format!("创建唤醒词失败: {}", e))?;
        wake_word_ids.push(new_wake_word_id);
        wake_words_created += 1;
        println!("创建新唤醒词: {} -> {} (音频文件: {:?})", text, new_wake_word_id, audio_file);
    }
    
    // 处理重复的唤醒词（获取现有ID）
    for (text, audio_file) in duplicate_wake_words {
        let existing_id = state.db.check_wake_word_exists(&text, audio_file.as_deref())
            .await
            .map_err(|e| format!("检查唤醒词存在性失败: {}", e))?
            .expect("重复检查中应该能找到现有ID");
        wake_word_ids.push(existing_id);
        wake_words_ignored += 1;
        println!("唤醒词已存在，使用现有ID: {} -> {} (音频文件: {:?})", text, existing_id, audio_file);
    }

    // 处理测试语料 - 确保所有Excel中的数据都包含在任务中
    let mut sample_ids = Vec::new();
    let mut samples_created = 0;
    let mut samples_ignored = 0;
    
    // 准备测试语料数据（包含音频文件路径）
    let mut samples_with_files = Vec::new();
    let mut processed_samples = std::collections::HashSet::new();
    
    for (filename, text) in samples_data {
        // 跳过重复的文本
        if processed_samples.contains(&text) {
            println!("跳过重复的测试语料文本: {}", text);
            continue;
        }
        processed_samples.insert(text.clone());
        
        let audio_path = sample_audio_dir.join(&filename);
        let audio_file = if audio_path.exists() {
            // 规范化路径
            let normalized_path = normalize_path(&audio_path);
            Some(normalized_path)
        } else {
            println!("警告: 测试语料音频文件不存在: {:?}", audio_path);
            None
        };
        
        samples_with_files.push((text, audio_file));
    }
    
    // 使用新的预检查函数
    let (new_samples, duplicate_samples) = state.db.precheck_samples_with_files(samples_with_files.clone())
        .await
        .map_err(|e| format!("预检查测试语料失败: {}", e))?;
    
    // 处理新的测试语料
    for (text, audio_file) in new_samples {
        let new_sample_id = state.db.create_sample(&text, audio_file.as_deref())
            .await
            .map_err(|e| format!("创建测试语料失败: {}", e))?;
        sample_ids.push(new_sample_id);
        samples_created += 1;
        println!("创建新测试语料: {} -> {} (音频文件: {:?})", text, new_sample_id, audio_file);
    }
    
    // 处理重复的测试语料（获取现有ID）
    for (text, audio_file) in duplicate_samples {
        let existing_id = state.db.check_sample_exists(&text, audio_file.as_deref())
            .await
            .map_err(|e| format!("检查测试语料存在性失败: {}", e))?
            .expect("重复检查中应该能找到现有ID");
        sample_ids.push(existing_id);
        samples_ignored += 1;
        println!("测试语料已存在，使用现有ID: {} -> {} (音频文件: {:?})", text, existing_id, audio_file);
    }

    // 打印调试信息
    println!("准备创建任务:");
    println!("  任务名称: {}", task_name);
    println!("  唤醒词ID列表: {:?}", wake_word_ids);
    println!("  测试语料ID列表: {:?}", sample_ids);
    println!("  唤醒词统计: 创建 {} 个, 忽略 {} 个", wake_words_created, wake_words_ignored);
    println!("  测试语料统计: 创建 {} 个, 忽略 {} 个", samples_created, samples_ignored);

    // 检查是否已存在同名任务
    let existing_tasks = state.db.get_all_tasks()
        .await
        .map_err(|e| format!("获取现有任务失败: {}", e))?;
    
    let existing_task = existing_tasks.iter().find(|t| t.name == task_name);
    if let Some(existing_task) = existing_task {
        println!("警告: 已存在同名任务 (ID: {}), 但将继续创建新任务", existing_task.id);
    }

    // 创建任务
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let task = Task {
        id: 0,
        name: task_name,
        test_samples_ids: sample_ids.iter().map(|&id| id as u32).collect(),
        wake_word_ids: wake_word_ids.iter().map(|&id| id as u32).collect(),
        machine_response: None,
        test_result: None,
        task_status: "pending".to_string(),
        task_progress: Some(0.0),
        created_at: now,
        audio_type: None,
        audio_file: None,
        audio_duration: None,
        audio_category: None,
        test_collection: None,
        test_duration: None,
        sentence_accuracy: None,
        word_accuracy: None,
        character_error_rate: None,
        recognition_success_rate: None,
        total_words: None,
        insertion_errors: None,
        deletion_errors: None,
        substitution_errors: None,
        fastest_recognition_time: None,
        slowest_recognition_time: None,
        average_recognition_time: None,
        completed_samples: None,
    };

    let task_id = state.db.create_task(&task)
        .await
        .map_err(|e| format!("创建任务失败: {}", e))?;
    
    Ok(TaskPackageImportResult {
        task_id,
        wake_words_created,
        samples_created,
        wake_words_ignored,
        samples_ignored,
    })
}



fn read_excel_file(file_path: &Path) -> Result<Vec<(String, String)>, String> {
    let mut workbook: calamine::Xlsx<_> = open_workbook(file_path)
        .map_err(|e| format!("无法打开Excel文件: {}", e))?;
    
    let sheet_name = workbook.sheet_names()[0].clone();
    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| format!("读取工作表失败: {}", e))?;

    let mut data = Vec::new();
    
    for row in range.rows().skip(1) { // 跳过标题行
        if row.len() >= 2 {
            let filename = match &row[0] {
                calamine::Data::String(s) => s.clone(),
                calamine::Data::Int(i) => i.to_string(),
                calamine::Data::Float(f) => f.to_string(),
                _ => continue,
            };
            
            let text = match &row[1] {
                calamine::Data::String(s) => s.clone(),
                calamine::Data::Int(i) => i.to_string(),
                calamine::Data::Float(f) => f.to_string(),
                _ => continue,
            };
            
            if !filename.trim().is_empty() && !text.trim().is_empty() {
                data.push((filename, text));
            }
        }
    }
    
    Ok(data)
}
