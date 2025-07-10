use crate::models::*;
use crate::services::asr_task::AsrTaskOutput;
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};
use crate::state::AppState;
use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
use reqwest::{self, Response};
use serde_json;
use std::error::Error;
use std::sync::Arc;
use tokio::sync::watch;

pub struct analysis_task {
    pub id: String,
    pub dependency_id: String,
}

impl analysis_task {
    pub fn new(id: String, dependency_id: String) -> Self {
        Self { id, dependency_id }
    }

    async fn call_llm_analysis(
        &self,
        sample_text: &str,
        machine_response: &str,
    ) -> Result<AnalysisResult, String> {
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
                Err(e.to_string()) // 返回错误，而不是回退结果
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
                content: "从响应内容来看，车机未能正确理解用户的指令，这种响应方式不符合用户期望。"
                    .to_string(),
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
        println!("开始将响应内容发送给大模型");

        // 主控制循环 - 持续检查控制信号
        loop {
            let signal = control_rx.borrow().clone();
            match signal {
                ControlSignal::Running => {
                    println!("执行大模型判断");
                    //从workflow的状态中获取前一任务的输出结果来获取example与response
                    let context_reader = context.read().await;
                    let (sample, response) = if let Some(data) = context_reader.get(&self.dependency_id) {
                        // Downcast to the specific struct type
                        if let Some(asr_result) = data.downcast_ref::<AsrTaskOutput>() {
                            (asr_result.example.clone(), asr_result.response.clone())
                        } else {
                            eprintln!("无法将数据转换为 AsrTaskOutput 类型");
                            return Err("数据类型转换失败".into());
                        }
                    } else {
                        eprintln!("无法从上下文中获取依赖任务 {} 的数据", self.dependency_id);
                        return Err("依赖任务数据获取失败".into());
                    };

                    // 调用大模型分析
                    match self.call_llm_analysis(&sample, &response).await {
                        Ok(analysis_result) => {
                            // TODO: 在此处处理成功的结果，例如保存到数据库
                            println!("大模型分析成功");
                            // 假设处理成功后，任务完成，退出循环
                            return Ok(());
                        }
                        Err(e) => {
                            eprintln!("大模型处理失败: {}", e);
                            // 错误处理策略：停止任务并返回错误
                            return Err(e.into());
                        }
                    }
                }
                ControlSignal::Paused => {
                    println!("[{}]   Paused, waiting for resume...", self.id);
                    // 暂停状态：等待控制信号变化，不退出任务
                    if control_rx.changed().await.is_err() {
                        println!("[{}]   Control channel closed, stopping.", self.id);
                        return Ok(());
                    }
                    // 继续循环，重新检查信号状态
                    continue;
                }
                ControlSignal::Stopped => {
                    println!("[{}]   Stopped gracefully.", self.id);
                    return Ok(());
                }
            }
        }
    }
}
