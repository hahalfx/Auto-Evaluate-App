use crate::models::*; // Assuming your model definitions are here
use crate::services::asr_task::AsrTaskOutput;
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::Utc;
use reqwest::{self, Client};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;
use std::error::Error;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::watch;

// --- Data Structures Mirroring Python Pydantic Models ---
// These structs are used to deserialize the JSON response from the LLM.

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EvaluationResult {
    pub assessment: Assessment,
}

// This is the structure we will serialize as the request body for the LLM.
#[derive(Serialize)]
struct LlmRequestPayload<'a> {
    model: &'a str,
    messages: Vec<LlmMessage<'a>>,
    response_format: ResponseFormat,
}

#[derive(Serialize)]
struct LlmMessage<'a> {
    role: &'a str,
    content: String,
}

#[derive(Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    format_type: String,
}

// This is the structure we expect back from the LLM.
// Note: The actual response has a complex structure, we are interested in the message content.
#[derive(Deserialize, Debug)]
struct LlmResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize, Debug)]
struct Choice {
    message: MessageContent,
}

#[derive(Deserialize, Debug)]
struct MessageContent {
    content: String,
}

// --- The Task Implementation ---

pub struct analysis_task {
    pub id: String,
    pub dependency_id: String,
    pub http_client: Client,
}

impl analysis_task {
    pub fn new(id: String, dependency_id: String, http_client: Client) -> Self {
        // It's a good practice to load environment variables once at startup,
        // but loading them here is also fine for this specific task.
        dotenv::dotenv().expect("Failed to load .env file");
        Self {
            id,
            dependency_id,
            http_client,
        }
    }

    /// Builds the prompt and calls the OpenRouter LLM API directly.
    async fn call_llm_analysis(
        &self,
        client: &Client,
        instruction: &str,
        response: &str,
    ) -> Result<EvaluationResult> {
        log::info!("Calling OpenRouter API for analysis...");

        let api_key = env::var("OPENROUTER_API_KEY")
            .map_err(|_| anyhow!("OPENROUTER_API_KEY not found in environment"))?;

        // 1. Construct the detailed prompt
        let prompt_content = format!(
            r#"作为车机系统测试专家，请严格评估：
指令：{instruction}
响应：{response}

请按以下维度评估并返回严格JSON格式：
1. semantic_correctness: 评分0-1和评估意见
2. state_change_confirmation: 评分0-1和评估意见
3. unambiguous_expression: 评分0-1和评估意见
4. overall_score: 三个维度的平均分
5. valid: 测试是否通过
6. suggestions: 改进建议列表

输出必须为中文

输出必须严格符合以下JSON结构：
{{
  "assessment": {{
    "semantic_correctness": {{"score": 0.0, "comment": "..."}},
    "state_change_confirmation": {{"score": 0.0, "comment": "..."}},
    "unambiguous_expression": {{"score": 0.0, "comment": "..."}},
    "overall_score": 0.0,
    "valid": false,
    "suggestions": ["...", "..."]
  }}
}}"#
        );

        // 2. Create the request body payload
        let request_body = LlmRequestPayload {
            model: "google/gemini-2.5-flash", // Or another model you prefer
            messages: vec![LlmMessage {
                role: "user",
                content: prompt_content,
            }],
            response_format: ResponseFormat {
                format_type: "json_object".to_string(),
            },
        };

        // 3. Send the request
        let res = client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .bearer_auth(api_key)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to send request to OpenRouter: {}", e))?;

        if !res.status().is_success() {
            let error_body = res
                .text()
                .await
                .unwrap_or_else(|_| "Could not read error body".to_string());
            log::error!("OpenRouter API returned an error status: {}", error_body);
            return Err(anyhow!("LLM API Error: {}", error_body));
        }

        log::info!("Received successful response from OpenRouter.");

        // 4. Parse the response
        let llm_response = res
            .json::<LlmResponse>()
            .await
            .map_err(|e| anyhow!("Failed to parse LLM response structure: {}", e))?;

        if let Some(choice) = llm_response.choices.into_iter().next() {
            // The actual JSON we need is a string inside the response content, so we parse it again.
            let evaluation_result: EvaluationResult = serde_json::from_str(&choice.message.content)
                .map_err(|e| anyhow!("Failed to parse the inner JSON content from LLM: {}", e))?;
            Ok(evaluation_result)
        } else {
            Err(anyhow!("LLM response contained no choices."))
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
        log::info!(
            "[{}] Execute method started. Waiting for 'Running' signal.",
            self.id
        );

        // 检查active_task的结果，如果超时则直接返回
        let context_reader = context.read().await;
        for (task_id, result) in context_reader.iter() {
            if task_id.contains("active_task") {
                if let Some(result_any) = result.downcast_ref::<serde_json::Value>() {
                    if let Some(status) = result_any.get("status").and_then(|s| s.as_str()) {
                        if status == "timeout" {
                            println!("[{}] Active task timed out, skipping analysis task", self.id);
                            return Ok(()); // 直接成功退出，让工作流继续
                        }
                    }
                }
            }
        }
        drop(context_reader);

        loop {
            let signal = control_rx.borrow().clone();

            match signal {
                ControlSignal::Running => {
                    log::info!(
                        "[{}] Signal is 'Running'. Proceeding with analysis.",
                        self.id
                    );
                    app_handle.emit("llm_analysis_event", "start")?;

                    let context_reader = context.read().await;
                    let (sample, response) =
                        if let Some(data) = context_reader.get(&self.dependency_id) {
                            if let Some(asr_result) = data.downcast_ref::<AsrTaskOutput>() {
                                (asr_result.example.clone(), asr_result.response.clone())
                            } else {
                                return Err("Could not downcast data to AsrTaskOutput.".into());
                            }
                        } else {
                            return Err(format!(
                                "Could not get dependency task data for '{}'",
                                self.dependency_id
                            )
                            .into());
                        };
                    drop(context_reader);

                    // --- MODIFIED SECTION ---
                    // Directly call the new function instead of the old one.
                    match self
                        .call_llm_analysis(&self.http_client, &sample, &response)
                        .await
                    {
                        Ok(analysis_result_base) => {
                            log::info!("[{}] Model analysis successful.", self.id);

                            // We construct the final AnalysisResult here, combining the LLM output
                            // with other data. The original models need to be adjusted for this.
                            // For now, let's assume AnalysisResult can be built from EvaluationResult.
                            // This part requires you to adapt your `AnalysisResult` struct.

                            // Let's create a full `AnalysisResult` for the event
                            let final_result = AnalysisResult {
                                assessment: analysis_result_base.assessment,
                                // Fill other fields as needed
                                llm_analysis: Some(LlmAnalysis {
                                    title: "LLM分析".to_string(),
                                    content: "分析已由大模型直接在后端完成。".to_string(),
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
                                reference_text: Some(sample),
                                recognized_text: Some(response),
                                result_status: None,
                                recognition_time: None,
                                response_time: None,
                            };

                            app_handle.emit("llm_analysis_result", final_result.clone())?;
                            context
                                .write()
                                .await
                                .insert(self.id.clone(), Box::new(final_result.clone()));
                            return Ok(()); // Task is done, exit successfully.
                        }
                        Err(e) => {
                            log::error!(
                                "[{}] Model processing failed: {}. Creating fallback result.",
                                self.id,
                                e
                            );
                            // Here you can decide whether to return an error or use a fallback.
                            // Returning an error is often cleaner.
                            return Err(e.into());
                        }
                    }
                }
                ControlSignal::Stopped => {
                    log::info!(
                        "[{}] Received 'Stopped' signal. Exiting gracefully.",
                        self.id
                    );
                    return Ok(());
                }
                ControlSignal::Paused => {
                    log::info!(
                        "[{}] Received 'Paused' signal. Waiting for changes.",
                        self.id
                    );
                    // The wait happens below.
                }
            }

            // If the signal was not Running or Stopped, wait for it to change.
            if control_rx.changed().await.is_err() {
                log::warn!(
                    "[{}] Control channel closed while waiting. Exiting.",
                    self.id
                );
                return Ok(());
            }
        }
    }
}
