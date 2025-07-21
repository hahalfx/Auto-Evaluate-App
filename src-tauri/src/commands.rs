use crate::models::*;
use crate::services::analysis_task::analysis_task;
use crate::services::asr_task::AsrTask;
use crate::services::audio_task::audio_task;
use crate::services::finish_task::finish_task;
use crate::services::meta_task_executor::meta_task_executor;
use crate::services::workflow::Workflow;
use crate::state::AppState;
use chrono::Utc;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::State;
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
pub async fn get_all_wake_words(state: State<'_, Arc<AppState>>) -> Result<Vec<WakeWord>, String> {
    state
        .db
        .get_all_wake_words()
        .await
        .map_err(|e| format!("获取唤醒词列表失败: {}", e))
}

#[tauri::command]
pub async fn create_task(
    state: State<'_, Arc<AppState>>,
    name: String,
    test_samples_ids: Vec<u32>,
    wake_word_id: u32,
) -> Result<i64, String> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let task = Task {
        id: 0, // 将被数据库自动分配
        name,
        test_samples_ids,
        wake_word_id,
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
    // 步骤 1: 快速获取锁，克隆 Sender，然后立即释放锁
    let sender_clone = { // 使用代码块来限定 sender_guard 的作用域
        let sender_guard = state.ocr_frame_sender.lock().await;
        match sender_guard.as_ref() {
            Some(sender) => sender.clone(), // 克隆 Sender
            None => return Err("OCR任务未启动，请先启动OCR任务".to_string()),
        }
    }; // <- sender_guard 在这里被丢弃，锁立即被释放！

    // 步骤 2: 在锁之外，从容地准备和发送数据
    let frame = crate::models::VideoFrame {
        data: image_data,
        timestamp,
        width,
        height,
    };

    // 50毫秒超时检查
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
    log::info!("[COMMAND] precheck_samples called with {} texts", texts.len());
    
    let (new_texts, duplicate_texts) = state
        .db
        .precheck_samples(texts)
        .await
        .map_err(|e| {
            log::error!("[COMMAND] precheck_samples failed: {}", e);
            format!("预检查样本失败: {}", e)
        })?;
    
    log::info!("[COMMAND] precheck_samples completed: {} new, {} duplicate", new_texts.len(), duplicate_texts.len());
    
    Ok(PrecheckResult {
        new_texts,
        duplicate_texts,
    })
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
pub async fn new_workflow(
    state: State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let (mut workflow, _handle) = Workflow::new();
    if let Some(task_id) = *state.current_task_id.read().await {
        // We check if the task exists, but we don't need to use it further in this function.
        let task_samples = state
            .db
            .get_samples_by_task_id(task_id)
            .await
            .map_err(|e| format!("获取任务失败: {}", e))?;

        let keyword = task_samples
            .first()
            .map(|sample| sample.text.clone())
            .ok_or("任务样本列表为空")?;

        let task = state
            .db
            .get_task_by_id(task_id)
            .await
            .map_err(|e| format!("获取任务失败: {}", e))?
            .ok_or("任务不存在")?;

        let wakewordid = task.wake_word_id;
        let wakeword = state
            .db
            .get_wake_word_by_id(wakewordid)
            .await
            .map_err(|e| format!("获取唤醒词失败: {}", e))?
            .ok_or("唤醒词不存在")?;

        // 为第一个样本创建工作流（简化版本，后续可以扩展为多样本）
        let sample_id = task_samples.first().map(|s| s.id).unwrap_or(0);

        workflow.add_task(audio_task {
            id: "wakeword_task".to_string(),
            keyword: wakeword.text.clone(),
            url: Some("/Volumes/应用/LLM Analysis Interface/public/audio/wakeword".to_string()),
        });

        workflow.add_task(audio_task {
            id: "audio_task".to_string(),
            keyword: keyword.clone(),
            url: None,
        });
        workflow.add_task(AsrTask::new("asr_task".to_string(), keyword.clone()));
        workflow.add_task(analysis_task {
            id: "analysis_task".to_string(),
            dependency_id: "asr_task".to_string(),
            http_client: state.http_client.clone(),
        });
        workflow.add_task(finish_task::new(
            "finish_task".to_string(),
            task_id,
            sample_id,
            "asr_task".to_string(),
            "analysis_task".to_string(),
            "audio_ocr_task".to_string(),
            "ocr_task".to_string(),
            "audio_task".to_string(),
            state.db.clone(),
        ));

        workflow.add_dependency("audio_task", "wakeword_task");
        workflow.add_dependency("asr_task", "audio_task");
        workflow.add_dependency("analysis_task", "asr_task");
        workflow.add_dependency("finish_task", "analysis_task");

        // 开始工作流
        let handle = workflow.run(app_handle).await;

        // 将控制器 handle 交给全局状态 AppState
        let mut workflow_handle_guard = state.workflow_handle.lock().await;
        *workflow_handle_guard = Some(handle);

        Ok(())
    } else {
        Err("没有设置当前任务".to_string())
    }
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
) -> Result<(), String> {
    // 1. 获取任务ID
    let task_id = state.current_task_id.read().await.ok_or("没有设置当前任务ID")?;

    // 2. 从数据库一次性获取所有需要的数据
    // [FIX] Converted anyhow::Error to String
    let task_samples = state.db.get_samples_by_task_id(task_id)
        .await
        .map_err(|e| e.to_string())?;
    
    if task_samples.is_empty() {
        return Err("任务样本列表为空".to_string());
    }

    // [FIX] Converted anyhow::Error to String
    let task = state.db.get_task_by_id(task_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("任务不存在")?;
    
    // [FIX] Converted anyhow::Error to String
    let wakeword = state.db.get_wake_word_by_id(task.wake_word_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("唤醒词不存在")?;

    // 3. 创建主工作流
    let (mut main_workflow, _) = Workflow::new();

    // 4. 创建元任务，将所有数据和依赖注入
    let multi_sample_executor = meta_task_executor::new(
        &format!("multi_sample_task_{}", task_id),
        task_id,
        task_samples,
        wakeword,
        state.inner().clone(), // 传入 Arc<AppState> 的克隆
    );

    // 5. 将元任务作为唯一任务添加到主工作流
    main_workflow.add_task(multi_sample_executor);

    // 6. 运行主工作流，获取总控制句柄
    let handle = main_workflow.run(app_handle).await;

    // 7. 将总控制句柄存入全局状态
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
