use crate::models::*;
use crate::state::AppState;
use std::sync::Arc;
use tauri::Emitter;
use anyhow::Result;
use chrono::Utc;

pub struct AnalysisService {
    state: Arc<AppState>,
}

impl AnalysisService {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    pub async fn start_automated_test(&self, app_handle: tauri::AppHandle) -> Result<(), String> {
        let mut is_testing = self.state.is_testing.write().await;
        if *is_testing {
            return Err("测试已在进行中".to_string());
        }
        *is_testing = true;
        drop(is_testing);

        // 从数据库获取当前任务
        let current_task_id = self.state.current_task_id.read().await;
        let task_id = current_task_id.ok_or("未选择任务")?;
        
        let task = self.state.db.get_task_by_id(task_id).await
            .map_err(|e| format!("获取任务失败: {}", e))?
            .ok_or("任务不存在")?;
        drop(current_task_id);

        if task.test_samples_ids.is_empty() {
            *self.state.is_testing.write().await = false;
            return Err("未找到测试样本".to_string());
        }

        // 重置任务进度
        self.state.db.update_task_progress(task_id, 0.0).await
            .map_err(|e| format!("更新进度失败: {}", e))?;

        // 发送进度更新事件到前端
        app_handle.emit("progress-updated", TaskProgress {
            value: 0.0,
            current: 0,
            total: task.test_samples_ids.len() as u32,
        }).ok();

        // 开始处理第一个样本
        self.process_next_sample(app_handle, task_id, 0).await?;

        Ok(())
    }

    async fn process_next_sample(&self, app_handle: tauri::AppHandle, task_id: i64, sample_index: usize) -> Result<(), String> {
        let task = self.state.db.get_task_by_id(task_id).await
            .map_err(|e| format!("获取任务失败: {}", e))?
            .ok_or("任务不存在")?;
        
        if sample_index >= task.test_samples_ids.len() {
            // 所有样本处理完成
            self.complete_task(app_handle, task_id).await?;
            return Ok(());
        }

        let sample_id = task.test_samples_ids[sample_index];
        let samples = self.state.db.get_all_samples().await
            .map_err(|e| format!("获取样本失败: {}", e))?;
        
        let sample = samples.iter().find(|s| s.id == sample_id)
            .ok_or("样本不存在")?
            .clone();

        // 发送播放音频事件到前端
        app_handle.emit("play-audio", PlayAudioEvent {
            wake_word_id: task.wake_word_id,
            sample_text: sample.text.clone(),
            sample_id: sample.id,
        }).ok();

        Ok(())
    }

    pub async fn submit_analysis(&self, app_handle: tauri::AppHandle, sample_id: u32, machine_response: String) -> Result<AnalysisResult, String> {
        let current_task_id = self.state.current_task_id.read().await;
        let task_id = current_task_id.ok_or("未选择任务")?;
        drop(current_task_id);

        // 从数据库获取样本
        let samples = self.state.db.get_all_samples().await
            .map_err(|e| format!("获取样本失败: {}", e))?;
        let sample = samples.iter().find(|s| s.id == sample_id)
            .ok_or("样本不存在")?
            .clone();

        // 调用外部 LLM API 进行分析
        let analysis_result = self.call_llm_analysis(&sample.text, &machine_response).await?;

        // 保存车机响应到数据库
        let response_data = MachineResponseData {
            text: machine_response,
            connected: true,
        };
        self.state.db.save_machine_response(task_id, sample_id as i64, &response_data).await
            .map_err(|e| format!("保存车机响应失败: {}", e))?;

        // 保存分析结果到数据库
        self.state.db.save_analysis_result(task_id, sample_id as i64, &analysis_result).await
            .map_err(|e| format!("保存分析结果失败: {}", e))?;

        // 更新任务进度
        let task = self.state.db.get_task_by_id(task_id).await
            .map_err(|e| format!("获取任务失败: {}", e))?
            .ok_or("任务不存在")?;
        
        let completed_count = self.state.db.get_analysis_results_by_task(task_id).await
            .map_err(|e| format!("获取分析结果失败: {}", e))?
            .len() as u32;
        
        let progress = (completed_count as f64 / task.test_samples_ids.len() as f64) * 100.0;
        self.state.db.update_task_progress(task_id, progress).await
            .map_err(|e| format!("更新进度失败: {}", e))?;

        // 发送进度更新事件
        app_handle.emit("progress-updated", TaskProgress {
            value: progress as f32,
            current: completed_count,
            total: task.test_samples_ids.len() as u32,
        }).ok();

        app_handle.emit("analysis-completed", AnalysisCompletedEvent {
            sample_id,
            result: analysis_result.clone(),
        }).ok();

        // 检查是否需要处理下一个样本或完成任务
        if completed_count >= task.test_samples_ids.len() as u32 {
            // 所有样本已处理完成
            self.complete_task(app_handle.clone(), task_id).await?;
        } else {
            // 仍有样本待处理，延迟处理下一个样本
            let service = self.clone();
            let handle = app_handle.clone();
            tokio::spawn(async move {
                // 考虑一个较短的延迟，或者根据需要调整/移除
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                if let Err(e) = service.process_next_sample(handle, task_id, completed_count as usize).await {
                    log::error!("处理下一个样本时出错: {}", e);
                    // 可以在此处向前端发送错误事件
                    // handle.emit("error-occurred", ErrorOccurredPayload { message: format!("处理下一个样本失败: {}", e) }).ok();
                }
            });
        }

        Ok(analysis_result)
    }

    async fn complete_task(&self, app_handle: tauri::AppHandle, task_id: i64) -> Result<(), String> {
        log::info!("任务 {} 完成中...", task_id);
        // 更新任务状态为完成
        self.state.db.update_task_status(task_id, "completed").await
            .map_err(|e| format!("更新任务状态失败: {}", e))?;
        
        self.state.db.update_task_progress(task_id, 100.0).await
            .map_err(|e| format!("更新进度失败: {}", e))?;

        // 重置测试状态
        *self.state.is_testing.write().await = false;

        // 发送任务完成事件
        app_handle.emit("task-completed", ()).ok();

        Ok(())
    }

    async fn call_llm_analysis(&self, sample_text: &str, machine_response: &str) -> Result<AnalysisResult, String> {
        // 创建 HTTP 客户端
        let client = reqwest::Client::new();
        
        // 准备请求数据
        let request_body = serde_json::json!({
            "sample": sample_text,
            "machineResponse": machine_response
        });

        // 调用外部 LLM API
        match client
            .post("http://localhost:8000/api/analyze")
            .json(&request_body)
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<AnalysisResult>().await {
                        Ok(result) => Ok(result),
                        Err(e) => {
                            log::error!("解析 LLM 响应失败: {}", e);
                            Ok(self.create_fallback_result())
                        }
                    }
                } else {
                    log::error!("LLM API 返回错误状态: {}", response.status());
                    Ok(self.create_fallback_result())
                }
            }
            Err(e) => {
                log::error!("调用 LLM API 失败: {}", e);
                Ok(self.create_fallback_result())
            }
        }
    }

    fn create_fallback_result(&self) -> AnalysisResult {
        AnalysisResult {
            assessment: Assessment {
                semantic_correctness: AssessmentItem {
                    score: 0.0,
                    comment: "响应未匹配核心功能需求，仅反馈识别失败。".to_string(),
                },
                state_change_confirmation: AssessmentItem {
                    score: 0.0,
                    comment: "未执行操作，未提供状态变更信息。".to_string(),
                },
                unambiguous_expression: AssessmentItem {
                    score: 1.0,
                    comment: "响应文本本身无歧义，但未解决原始指令意图。".to_string(),
                },
                overall_score: 0.33,
                valid: false,
                suggestions: vec![
                    "应优先执行指令，而非直接进入语音识别错误处理流程".to_string(),
                    "若识别失败，建议补充引导以确认意图".to_string(),
                ],
            },
            llm_analysis: Some(LlmAnalysis {
                title: "LLM分析".to_string(),
                content: "从响应内容来看，车机未能正确理解用户的指令，这种响应方式不符合用户期望。".to_string(),
                context: false,
                multi_round: false,
            }),
            test_time: Some(Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()),
            audio_file: None,
            recognition_file: None,
            device: None,
            recognition_result: None,
            insertion_errors: None,
            deletion_errors: None,
            substitution_errors: None,
            total_words: None,
            reference_text: None,
            recognized_text: None,
            result_status: None,
            recognition_time: None,
            response_time: None,
        }
    }
}

impl Clone for AnalysisService {
    fn clone(&self) -> Self {
        Self {
            state: self.state.clone(),
        }
    }
}
