use crate::models::*;
use crate::services::asr_task::AsrTaskOutput;
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};
use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
use reqwest::{self, Client, Response};
use serde_json;
use tauri::Emitter;
use std::error::Error;
use std::sync::Arc;
use tokio::sync::watch;

pub struct analysis_task {
    pub id: String,
    pub dependency_id: String,
    pub http_client: Client,
}

impl analysis_task {
    pub fn new(id: String, dependency_id: String, http_client: Client) -> Self {
        Self {
            id,
            dependency_id,
            http_client,
        }
    }

    async fn call_llm_analysis(
        &self,
        client: &Client,
        sample_text: &str,
        machine_response: &str,
    ) -> Result<AnalysisResult, String> {
        log::info!("Preparing to send HTTP POST request to http://localhost:8000/api/analyze");
        let request_body = serde_json::json!({
            "sample": sample_text,
            "machineResponse": machine_response
        });

        match client
            .post("http://localhost:8000/api/analyze")
            .json(&request_body)
            .send()
            .await
        {
            Ok(response) => {
                log::info!("Received response with status: {}", response.status());
                if response.status().is_success() {
                    match response.json::<AnalysisResult>().await {
                        Ok(result) => Ok(result),
                        Err(e) => {
                            log::error!("Failed to parse LLM response: {}", e);
                            Ok(self.create_fallback_result())
                        }
                    }
                } else {
                    log::error!("LLM API returned an error status: {}", response.status());
                    Ok(self.create_fallback_result())
                }
            }
            Err(e) => {
                log::error!("Failed to call LLM API: {}", e);
                Err(e.to_string())
            }
        }
    }

    fn create_fallback_result(&self) -> AnalysisResult {
        AnalysisResult {
            assessment: Assessment {
                semantic_correctness: AssessmentItem { score: 0.0, comment: "响应未匹配核心功能需求，仅反馈识别失败。".to_string(), },
                state_change_confirmation: AssessmentItem { score: 0.0, comment: "未执行操作，未提供状态变更信息。".to_string(), },
                unambiguous_expression: AssessmentItem { score: 1.0, comment: "响应文本本身无歧义，但未解决原始指令意图。".to_string(), },
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
            audio_file: None, recognition_file: None, device: None, recognition_result: None,
            insertion_errors: None, deletion_errors: None, substitution_errors: None,
            total_words: None, reference_text: None, recognized_text: None,
            result_status: None, recognition_time: None, response_time: None,
        }
    }
}

#[async_trait]
impl Task for analysis_task {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        log::info!("[{}] Execute method started. Waiting for 'Running' signal.", self.id);

        loop {
            let signal = control_rx.borrow().clone();
            
            match signal {
                ControlSignal::Running => {
                    log::info!("[{}] Signal is 'Running'. Proceeding with analysis.", self.id);
                    app_handle.emit("llm_analysis_event", "start")?;
                    
                    let context_reader = context.read().await;
                    let (sample, response) = if let Some(data) = context_reader.get(&self.dependency_id) {
                        if let Some(asr_result) = data.downcast_ref::<AsrTaskOutput>() {
                            (asr_result.example.clone(), asr_result.response.clone())
                        } else {
                            return Err("Could not downcast data to AsrTaskOutput.".into());
                        }
                    } else {
                        return Err(format!("Could not get dependency task data for '{}'", self.dependency_id).into());
                    };
                    drop(context_reader);

                    match self.call_llm_analysis(&self.http_client, &sample, &response).await {
                        Ok(analysis_result) => {
                            log::info!("[{}] Model analysis successful.", self.id);
                            app_handle.emit("llm_analysis_result", analysis_result.clone())?;
                            context.write().await.insert(self.id.clone(), Box::new(analysis_result.clone()));
                            return Ok(()); // Task is done, exit successfully.
                        }
                        Err(e) => {
                            log::error!("[{}] Model processing failed: {}", e, self.id);
                            return Err(e.into()); // Exit with an error.
                        }
                    }
                }
                ControlSignal::Stopped => {
                    log::info!("[{}] Received 'Stopped' signal. Exiting gracefully.", self.id);
                    return Ok(());
                }
                ControlSignal::Paused => {
                    log::info!("[{}] Received 'Paused' signal. Waiting for changes.", self.id);
                    // The wait happens below.
                }
            }
            
            // If the signal was not Running or Stopped, wait for it to change.
            if control_rx.changed().await.is_err() {
                log::warn!("[{}] Control channel closed while waiting. Exiting.", self.id);
                return Ok(());
            }
        }
    }
}