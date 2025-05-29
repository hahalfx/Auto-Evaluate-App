use crate::state::AppState;
use crate::analysis_service::AnalysisService;
use crate::models::*;
use std::sync::Arc;
use tauri::State;
use chrono::Utc;

#[tauri::command]
pub async fn get_all_tasks(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Task>, String> {
    state.db.get_all_tasks().await
        .map_err(|e| format!("获取任务列表失败: {}", e))
}

#[tauri::command]
pub async fn get_current_task(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<Task>, String> {
    let current_task_id = state.current_task_id.read().await;
    if let Some(task_id) = *current_task_id {
        state.db.get_task_by_id(task_id).await
            .map_err(|e| format!("获取当前任务失败: {}", e))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn set_current_task(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<(), String> {
    // 验证任务是否存在
    let task = state.db.get_task_by_id(task_id as i64).await
        .map_err(|e| format!("获取任务失败: {}", e))?;
    
    if task.is_none() {
        return Err("任务不存在".to_string());
    }
    
    *state.current_task_id.write().await = Some(task_id as i64);
    Ok(())
}

#[tauri::command]
pub async fn get_all_samples(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<TestSample>, String> {
    state.db.get_all_samples().await
        .map_err(|e| format!("获取样本列表失败: {}", e))
}

#[tauri::command]
pub async fn get_all_wake_words(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<WakeWord>, String> {
    state.db.get_all_wake_words().await
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

    state.db.create_task(&task).await
        .map_err(|e| format!("创建任务失败: {}", e))
}

#[tauri::command]
pub async fn start_automated_test(
    state: State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let service = AnalysisService::new(state.inner().clone());
    service.start_automated_test(app_handle).await
}

#[tauri::command]
pub async fn submit_analysis(
    state: State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
    sample_id: u32,
    machine_response: String,
) -> Result<AnalysisResult, String> {
    let service = AnalysisService::new(state.inner().clone());
    service.submit_analysis(app_handle, sample_id, machine_response).await
}

#[tauri::command]
pub async fn get_task_progress(
    state: State<'_, Arc<AppState>>,
) -> Result<TaskProgress, String> {
    let current_task_id = state.current_task_id.read().await;
    if let Some(task_id) = *current_task_id {
        let task = state.db.get_task_by_id(task_id).await
            .map_err(|e| format!("获取任务失败: {}", e))?
            .ok_or("任务不存在")?;
        
        let completed_count = state.db.get_analysis_results_by_task(task_id).await
            .map_err(|e| format!("获取分析结果失败: {}", e))?
            .len() as u32;
        
        Ok(TaskProgress {
            value: task.task_progress.unwrap_or(0.0),
            current: completed_count,
            total: task.test_samples_ids.len() as u32,
        })
    } else {
        Ok(TaskProgress {
            value: 0.0,
            current: 0,
            total: 0,
        })
    }
}

#[tauri::command]
pub async fn get_analysis_results(
    state: State<'_, Arc<AppState>>,
) -> Result<std::collections::HashMap<u32, AnalysisResult>, String> {
    let current_task_id = state.current_task_id.read().await;
    if let Some(task_id) = *current_task_id {
        state.db.get_analysis_results_by_task(task_id).await
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
        state.db.get_machine_responses_by_task(task_id).await
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
    state.db.create_sample(&text, audio_file.as_deref()).await
        .map_err(|e| format!("创建样本失败: {}", e))
}

#[tauri::command]
pub async fn create_wake_word(
    state: State<'_, Arc<AppState>>,
    text: String,
    audio_file: Option<String>, // Added audio_file parameter
) -> Result<i64, String> {
    state.db.create_wake_word(&text, audio_file.as_deref()).await
        .map_err(|e| format!("创建唤醒词失败: {}", e))
}

#[tauri::command]
pub async fn update_task_status(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
    status: String,
) -> Result<(), String> {
    state.db.update_task_status(task_id as i64, &status).await
        .map_err(|e| format!("更新任务状态失败: {}", e))
}

#[tauri::command]
pub async fn delete_task(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<(), String> {
    // 如果删除的是当前任务，清除当前任务ID
    let current_task_id = state.current_task_id.read().await;
    if let Some(current_id) = *current_task_id {
        if current_id == task_id as i64 {
            drop(current_task_id);
            *state.current_task_id.write().await = None;
        }
    }

    state.db.delete_task(task_id as i64).await
        .map_err(|e| format!("删除任务失败: {}", e))
}

#[tauri::command]
pub async fn is_testing(
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    Ok(*state.is_testing.read().await)
}

#[tauri::command]
pub async fn stop_testing(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    *state.is_testing.write().await = false;
    Ok(())
}

#[tauri::command]
pub async fn create_samples_batch(
    state: State<'_, Arc<AppState>>,
    samples: Vec<SampleCreationPayload>, // Changed to accept a new payload
) -> Result<Vec<i64>, String> {
    let samples_to_create: Vec<(String, Option<String>)> = samples
        .into_iter()
        .map(|s| (s.text, s.audio_file))
        .collect();
    state.db.create_samples_batch(samples_to_create).await
        .map_err(|e| format!("批量创建样本失败: {}", e))
}

// Define a helper struct for the payload of create_samples_batch
#[derive(serde::Deserialize)]
pub struct SampleCreationPayload {
    text: String,
    audio_file: Option<String>,
}

#[tauri::command]
pub async fn delete_sample(
    state: State<'_, Arc<AppState>>,
    sample_id: u32,
) -> Result<(), String> {
    state.db.delete_sample(sample_id as i64).await
        .map_err(|e| format!("删除样本 {} 失败: {}", sample_id, e))
}

#[tauri::command]
pub async fn delete_sample_safe(
    state: State<'_, Arc<AppState>>,
    sample_id: u32,
) -> Result<(), String> {
    state.db.delete_sample_safe(sample_id as i64).await
        .map_err(|e| format!("安全删除样本 {} 失败: {}", sample_id, e))
}

#[tauri::command]
pub async fn get_samples_by_task_id(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<Vec<TestSample>, String> {
    state.db.get_samples_by_task_id(task_id as i64).await
        .map_err(|e| format!("获取任务 {} 的样本列表失败: {}", task_id, e))
}

#[tauri::command]
pub async fn update_task_samples(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
    sample_ids: Vec<u32>,
) -> Result<(), String> {
    let sample_ids_i64: Vec<i64> = sample_ids.into_iter().map(|id| id as i64).collect();
    state.db.update_task_samples(task_id as i64, sample_ids_i64).await
        .map_err(|e| format!("更新任务 {} 的样本关联失败: {}", task_id, e))
}
