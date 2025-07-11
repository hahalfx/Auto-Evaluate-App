use crate::models::*;
use crate::permissions;
use crate::services::analysis_task::analysis_task;
use crate::services::asr_task::AsrTask;
use crate::services::audio_task::audio_task;
use crate::services::finish_task::finish_task;
use crate::services::ocr_engine::load_ocr_engine_on_demand;
use crate::services::ocr_engine::perform_ocr;
use crate::services::ocr_engine::OcrResultItem;
use crate::services::workflow::Workflow;
use crate::state::AppState;
use chrono::Utc;
use std::sync::Arc;
use tauri::State;

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

#[tauri::command]
pub async fn get_task_progress(state: State<'_, Arc<AppState>>) -> Result<TaskProgress, String> {
    let current_task_id = state.current_task_id.read().await;
    if let Some(task_id) = *current_task_id {
        let task = state
            .db
            .get_task_by_id(task_id)
            .await
            .map_err(|e| format!("获取任务失败: {}", e))?
            .ok_or("任务不存在")?;

        let completed_count = state
            .db
            .get_analysis_results_by_task(task_id)
            .await
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

#[tauri::command]
pub async fn create_samples_batch(
    state: State<'_, Arc<AppState>>,
    samples: Vec<SampleCreationPayload>, // Changed to accept a new payload
) -> Result<Vec<i64>, String> {
    let samples_to_create: Vec<(String, Option<String>)> = samples
        .into_iter()
        .map(|s| (s.text, s.audio_file))
        .collect();
    state
        .db
        .create_samples_batch(samples_to_create)
        .await
        .map_err(|e| format!("批量创建样本失败: {}", e))
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

        // 为第一个样本创建工作流（简化版本，后续可以扩展为多样本）
        let sample_id = task_samples.first().map(|s| s.id).unwrap_or(0);
        
        workflow.add_task(audio_task {
            id: "audio_task".to_string(),
            keyword: keyword.clone(),
        });
        workflow.add_task(AsrTask::new(
            "asr_task".to_string(),
            keyword.clone(),
        ));
        workflow.add_task(analysis_task {
            id: "analysis_task".to_string(),
            dependency_id: "asr_task".to_string(),
            http_client: state.http_client.clone(),
        });
        workflow.add_task(finish_task::new("finish_task".to_string(), task_id, sample_id, state.db.clone()));
        
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
pub async fn test_audio_permissions() -> Result<String, String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    use log::{error, info};

    let mut result = String::new();

    let permission_result = request_microphone_permission().await;
    match permission_result {
        Ok(granted) => {
            if granted {
                info!("✅ 麦克风权限已授予");
                result.push_str("✅ 麦克风权限已授予\n");
            } else {
                error!("❌ 麦克风权限被拒绝");
                result.push_str("❌ 麦克风权限被拒绝\n");
            }
        }
        Err(e) => {
            error!("权限请求失败: {}", e);
        }
    }

    // 测试音频主机
    let host = cpal::default_host();
    result.push_str(&format!("音频主机: {:?}\n", host.id()));

    // 列出输入设备
    match host.input_devices() {
        Ok(devices) => {
            let devices: Vec<_> = devices.collect();
            result.push_str(&format!("可用输入设备数量: {}\n", devices.len()));

            for (i, device) in devices.iter().enumerate() {
                let name = device.name().unwrap_or_else(|_| format!("Device {}", i));
                result.push_str(&format!("设备 {}: {}\n", i, name));

                // 测试设备配置
                match device.supported_input_configs() {
                    Ok(configs) => {
                        for config in configs {
                            result.push_str(&format!(
                                "  - 采样率: {:?}, 通道数: {}, 格式: {:?}\n",
                                config.min_sample_rate(),
                                config.channels(),
                                config.sample_format()
                            ));
                        }
                    }
                    Err(e) => {
                        result.push_str(&format!("  - 获取配置失败: {}\n", e));
                    }
                }
            }
        }
        Err(e) => {
            result.push_str(&format!("获取输入设备失败: {}\n", e));
        }
    }

    // 测试默认输入设备
    match host.default_input_device() {
        Some(device) => {
            let name = device.name().unwrap_or_else(|_| "Unknown".to_string());
            result.push_str(&format!("默认输入设备: {}\n", name));

            // 尝试创建音频流
            use cpal::{SampleRate, StreamConfig};
            let config = StreamConfig {
                channels: 1,
                sample_rate: SampleRate(16000),
                buffer_size: cpal::BufferSize::Fixed(1024),
            };

            match device.build_input_stream(
                &config,
                |_data: &[f32], _: &cpal::InputCallbackInfo| {
                    // 空回调
                },
                |err| {
                    error!("音频流错误: {}", err);
                },
                None,
            ) {
                Ok(_stream) => {
                    result.push_str("✅ 音频流创建成功\n");
                }
                Err(e) => {
                    result.push_str(&format!("❌ 音频流创建失败: {}\n", e));
                    result.push_str("这可能是权限问题，请检查系统设置中的麦克风权限\n");
                }
            }
        }
        None => {
            result.push_str("❌ 未找到默认输入设备\n");
        }
    }

    info!("音频权限测试结果:\n{}", result);
    Ok(result)
}

#[tauri::command]
pub async fn request_microphone_permission() -> Result<bool, String> {
    permissions::request_microphone_permission()
}

#[tauri::command]
pub async fn check_microphone_permission() -> Result<bool, String> {
    Ok(permissions::check_microphone_permission())
}

#[tauri::command]
pub async fn perform_ocr_only(
    state: State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // 只负责加载和初始化OCR引擎
    load_ocr_engine_on_demand(&**state, &app_handle)
        .await
        .map_err(|e| format!("Failed to load OCR engine: {}", e))
}
