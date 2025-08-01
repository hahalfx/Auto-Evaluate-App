use async_trait::async_trait;
use std::error::Error;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::watch;

use crate::db::database::DatabaseService; // 假设您的数据库服务类型路径是这个
use crate::models::{AnalysisResult, MachineResponseData, TimingData};
use crate::services::asr_task::AsrTaskOutput;
use crate::services::ocr_session::OcrSessionResult;
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};

pub struct finish_task {
    pub id: String,
    pub task_id: i64,
    pub sample_id: u32,
    pub asr_dependency_id: String,
    pub analysis_dependency_id: String,
    pub audio_ocr_dependency_id: String, // 新增：audio_ocr_task的ID
    pub ocr_dependency_id: Option<String>,       // 新增：ocr_task的ID
    pub audio_task_id: String,           // 新增：audio_task的ID
    // 唤醒检测相关字段
    pub active_task_id: Option<String>, // 用于唤醒检测的active_task_id
    pub wake_word_id: Option<u32>,      // 唤醒词ID
    // 任务持有所需的数据库服务
    pub db: Arc<DatabaseService>,
}

impl finish_task {
    /// 主要构造函数，在创建时注入数据库依赖
    pub fn new(
        id: String,
        task_id: i64,
        sample_id: u32,
        asr_dependency_id: String,
        analysis_dependency_id: String,
        audio_ocr_dependency_id: String,
        audio_task_id: String,
        db: Arc<DatabaseService>,
    ) -> Self {
        Self {
            id, // 为每个任务提供唯一ID以便追踪
            task_id,
            sample_id,
            asr_dependency_id,
            analysis_dependency_id,
            audio_ocr_dependency_id,
            ocr_dependency_id: None,
            audio_task_id,
            active_task_id: None, // 初始化为None
            wake_word_id: None,   // 初始化为None
            db,                   // 存储传入的数据库服务
        }
    }

    /// 另一个构造函数，同样注入数据库依赖
    pub fn new_with_dependencies(
        id: String,
        task_id: i64,
        sample_id: u32,
        asr_dependency_id: String,
        analysis_dependency_id: String,
        audio_ocr_dependency_id: String,
        ocr_dependency_id: Option<String>,
        audio_task_id: String,
        db: Arc<DatabaseService>,
    ) -> Self {
        Self {
            id,
            task_id,
            sample_id,
            asr_dependency_id,
            analysis_dependency_id,
            audio_ocr_dependency_id,
            ocr_dependency_id,
            audio_task_id,
            active_task_id: None, // 初始化为None
            wake_word_id: None,   // 初始化为None
            db,
        }
    }

    /// 专门用于唤醒检测的构造函数
    pub fn new_for_wake_detection(
        id: String,
        task_id: i64,
        active_task_id: String,
        wake_word_id: u32,
        db: Arc<DatabaseService>,
    ) -> Self {
        Self {
            id,
            task_id,
            sample_id: 0, // 唤醒检测不使用sample_id
            asr_dependency_id: String::new(),
            analysis_dependency_id: String::new(),
            audio_ocr_dependency_id: String::new(),
            ocr_dependency_id: Some(String::new()),
            audio_task_id: String::new(),
            active_task_id: Some(active_task_id),
            wake_word_id: Some(wake_word_id),
            db,
        }
    }

    /// 用于包含active_task的混合工作流（唤醒+识别+交互）
    pub fn new_with_active_task(
        id: String,
        task_id: i64,
        sample_id: u32,
        asr_dependency_id: String,
        analysis_dependency_id: String,
        active_task_id: String, // 使用active_task而不是audio_ocr_task
        ocr_dependency_id: Option<String>,
        audio_task_id: String,
        db: Arc<DatabaseService>,
    ) -> Self {
        Self {
            id,
            task_id,
            sample_id,
            asr_dependency_id,
            analysis_dependency_id,
            audio_ocr_dependency_id: active_task_id.clone(), // 重用这个字段存储active_task_id
            ocr_dependency_id,
            audio_task_id,
            active_task_id: Some(active_task_id), // 同时设置这个字段以便后续检查
            wake_word_id: None,                   // 混合工作流不使用wake_word_id
            db,
        }
    }

    /// 核心数据处理逻辑
    /// 此函数现在使用 self.db，不再需要从 app_handle 获取 state
    async fn process_and_save_data(
        &self,
        context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        log::info!(
            "[{}] 开始处理和保存数据 - 样本ID: {}",
            self.id,
            self.sample_id
        );

        // 检查是否为唤醒失败的情况
        let context_reader = context.read().await;
        let wake_detection_failed = if let Some(success_flag) = context_reader.get("wake_detection_success") {
            if let Some(success) = success_flag.downcast_ref::<bool>() {
                !success
            } else {
                false
            }
        } else {
            false
        };
        drop(context_reader);

        // 如果唤醒失败且不是唤醒检测专用任务，则保存唤醒失败的结果
        if wake_detection_failed && self.wake_word_id.is_none() && self.sample_id > 0 {
            log::info!("[{}] 唤醒检测失败，保存唤醒失败结果", self.id);
            
            // 创建唤醒失败的分析结果
            let failed_analysis_result = AnalysisResult {
                assessment: crate::models::Assessment {
                    semantic_correctness: crate::models::AssessmentItem {
                        score: 0.0,
                        comment: "唤醒检测失败，无法进行语义正确性评估".to_string(),
                    },
                    state_change_confirmation: crate::models::AssessmentItem {
                        score: 0.0,
                        comment: "唤醒检测失败，无法进行状态变化确认评估".to_string(),
                    },
                    unambiguous_expression: crate::models::AssessmentItem {
                        score: 0.0,
                        comment: "唤醒检测失败，无法进行表达明确性评估".to_string(),
                    },
                    overall_score: 0.0,
                    valid: false,
                    suggestions: vec![
                        "检查唤醒词配置".to_string(),
                        "检查视觉检测配置".to_string(),
                        "确保车机系统处于可唤醒状态".to_string(),
                    ],
                },
                llm_analysis: Some(crate::models::LlmAnalysis {
                    title: "唤醒失败".to_string(),
                    content: "语音唤醒检测失败，车机系统未能成功响应唤醒词".to_string(),
                    context: false,
                    multi_round: false,
                }),
                test_time: Some(chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()),
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
                result_status: Some("wake_failed".to_string()),
                recognition_time: None,
                response_time: None,
            };

            // 创建唤醒失败的机器响应数据
            let failed_response_data = MachineResponseData {
                text: "唤醒检测失败".to_string(),
                connected: false,
            };

            // 创建空的时间数据
            let empty_timing_data = TimingData::new();

            // 保存到数据库
            self.db
                .save_machine_response(self.task_id, self.sample_id as i64, &failed_response_data)
                .await
                .map_err(|e| format!("[{}] 保存唤醒失败机器响应失败: {}", self.id, e))?;

            self.db
                .save_analysis_result(self.task_id, self.sample_id as i64, &failed_analysis_result)
                .await
                .map_err(|e| format!("[{}] 保存唤醒失败分析结果失败: {}", self.id, e))?;

            self.db
                .save_timing_data(self.task_id, self.sample_id as i64, &empty_timing_data)
                .await
                .map_err(|e| format!("[{}] 保存唤醒失败时间数据失败: {}", self.id, e))?;

            // 发送唤醒失败事件到前端
            let event_data = serde_json::json!({
                "task_id": self.task_id,
                "sample_id": self.sample_id,
                "response": "唤醒检测失败",
                "analysis_score": 0.0,
                "status": "wake_failed"
            });

            app_handle.emit("finish_task_complete", event_data)?;

            log::info!("[{}] 唤醒失败结果保存完成", self.id);
            return Ok(());
        }

        // 如果是唤醒检测任务，从上下文中获取active_task和asr_task结果
        if let Some(active_task_id) = &self.active_task_id {
            if let Some(wake_word_id) = &self.wake_word_id {
                log::info!("[{}] 从上下文中获取唤醒检测结果...", self.id);

                let context_reader = context.read().await;

                // 从active_task结果中获取数据
                let active_task_result = if let Some(data) = context_reader.get(active_task_id) {
                    if let Some(result) = data.downcast_ref::<serde_json::Value>() {
                        log::info!("[{}] 获取到active_task结果: {:?}", self.id, result);
                        result.clone()
                    } else {
                        return Err(format!("[{}] 无法将active_task数据转换为JSON", self.id).into());
                    }
                } else {
                    return Err(format!(
                        "[{}] 在context中找不到active_task '{}'",
                        self.id, active_task_id
                    )
                    .into());
                };

                // 从asr_task结果中获取数据
                let mut asr_result: Option<String> = None;
                if let Some(asr_task_id) = context_reader.keys().find(|k| k.contains("asr_task")) {
                    if let Some(asr_data) = context_reader.get(asr_task_id) {
                        // 首先尝试获取 AsrTaskOutput 类型的结果
                        if let Some(asr_task_output) = asr_data.downcast_ref::<AsrTaskOutput>() {
                            // 检查ASR结果是否为空字符串或只包含空白字符
                            let response = asr_task_output.response.trim();
                            if !response.is_empty() {
                                asr_result = Some(asr_task_output.response.clone());
                                log::info!("[{}] 获取到ASR结果: {}", self.id, asr_task_output.response);
                            } else {
                                log::info!("[{}] ASR任务完成但结果为空", self.id);
                            }
                        } else {
                            // 如果不是 AsrTaskOutput，尝试获取 JSON 格式的结果
                            if let Some(asr_json) = asr_data.downcast_ref::<serde_json::Value>() {
                                if let Some(response) = asr_json.get("response").and_then(|r| r.as_str()) {
                                    let trimmed_response = response.trim();
                                    if !trimmed_response.is_empty() {
                                        asr_result = Some(response.to_string());
                                        log::info!("[{}] 获取到ASR JSON结果: {}", self.id, response);
                                    } else {
                                        log::info!("[{}] ASR任务完成但结果为空", self.id);
                                    }
                                }
                            }
                        }
                    }
                }

                // 解析active_task结果
                let active_success = active_task_result
                    .get("status")
                    .and_then(|s| s.as_str())
                    .map(|s| s == "completed")
                    .unwrap_or(false);

                let confidence = active_task_result
                    .get("confidence")
                    .and_then(|c| c.as_f64());

                let timestamp = active_task_result
                    .get("timestamp")
                    .and_then(|t| t.as_i64())
                    .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

                let duration_ms = active_task_result
                    .get("duration_ms")
                    .and_then(|d| d.as_u64())
                    .unwrap_or(0);

                // 检查是否为超时状态
                let is_timeout = active_task_result
                    .get("status")
                    .and_then(|s| s.as_str())
                    .map(|s| s == "timeout")
                    .unwrap_or(false);

                // 只要有一个任务成功就认为测试成功
                let asr_success = asr_result.is_some();
                let final_success = (active_success && !is_timeout) || asr_success;

                log::info!("[{}] 解析结果: active_success={}, asr_success={}, is_timeout={}, final_success={}, confidence={:?}, duration_ms={}, asr_result={:?}", 
                    self.id, active_success, asr_success, is_timeout, final_success, confidence, duration_ms, asr_result);

                // 保存到数据库
                let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
                self.db
                    .save_wake_detection_result_direct(
                        self.task_id,
                        *wake_word_id as i64,
                        final_success,
                        confidence,
                        timestamp,
                        duration_ms as i64,
                        asr_result,
                        now,
                    )
                    .await
                    .map_err(|e| format!("[{}] 保存唤醒检测结果失败: {}", self.id, e))?;

                log::info!("[{}] 唤醒检测结果保存完成", self.id);

                // 发送完成事件到前端
                let event_data = serde_json::json!({
                    "task_id": self.task_id,
                    "wake_word_id": wake_word_id,
                    "success": final_success,
                    "confidence": confidence,
                    "duration_ms": duration_ms
                });

                app_handle.emit("wake_detection_result_saved", event_data)?;
                return Ok(());
            }
        }

        // 检查混合工作流中的active_task状态
        let context_reader = context.read().await;
        let active_task_failed = if let Some(active_task_id) = &self.active_task_id {
            if let Some(data) = context_reader.get(active_task_id) {
                if let Some(result) = data.downcast_ref::<serde_json::Value>() {
                    let status = result
                        .get("status")
                        .and_then(|s| s.as_str())
                        .unwrap_or("unknown");
                    log::info!("[{}] 检查active_task状态: {}", self.id, status);
                    status == "timeout" || status == "failed"
                } else {
                    false
                }
            } else {
                log::warn!("[{}] 未找到active_task结果: {}", self.id, active_task_id);
                false
            }
        } else {
            false
        };

        // 1. 从 asr_task 结果中提取数据
        let response_data = if let Some(data) = context_reader.get(&self.asr_dependency_id) {
            if let Some(asr_result) = data.downcast_ref::<AsrTaskOutput>() {
                MachineResponseData {
                    text: asr_result.response.clone(),
                    connected: true, // 假设连接正常
                }
            } else {
                return Err(format!("[{}] 无法将context数据转换为 AsrTaskOutput", self.id).into());
            }
        } else {
            return Err(format!(
                "[{}] 在context中找不到依赖项 '{}'",
                self.id, self.asr_dependency_id
            )
            .into());
        };

        // 2. 从 analysis_task 结果中提取数据
        let mut analysis_result = if let Some(data) =
            context_reader.get(&self.analysis_dependency_id)
        {
            if let Some(result) = data.downcast_ref::<AnalysisResult>() {
                result.clone()
            } else {
                return Err(format!("[{}] 无法将context数据转换为 AnalysisResult", self.id).into());
            }
        } else {
            return Err(format!(
                "[{}] 在context中找不到依赖项 '{}'",
                self.id, self.analysis_dependency_id
            )
            .into());
        };

        // 3. 从audio_task获取语音指令时间
        let audio_timing =
            if let Some(data) = context_reader.get(&format!("{}_timing", self.audio_task_id)) {
                data.downcast_ref::<TimingData>().cloned()
            } else {
                None
            };

        // // 4. 从audio_ocr_task获取首字上屏时间和文本稳定时间
        // let audio_ocr_result = if let Some(data) = context_reader.get(&self.audio_ocr_dependency_id)
        // {
        //     data.downcast_ref::<OcrSessionResult>().cloned()
        // } else {
        //     None
        // };

        // // 5. 从ocr_task获取动作开始时间
        // let ocr_result = if let Some(data) = context_reader.get(&self.ocr_dependency_id) {
        //     data.downcast_ref::<OcrSessionResult>().cloned()
        // } else {
        //     None
        // };

        // 6. 构建完整的TimingData
        let mut timing_data = TimingData::new();

        // 从audio_task获取语音指令开始和结束时间
        if let Some(audio_timing) = audio_timing {
            timing_data.voice_command_start_time = audio_timing.voice_command_start_time;
            timing_data.voice_command_end_time = audio_timing.voice_command_end_time;
        }

        // // 从audio_ocr_task获取首字上屏时间和文本稳定时间
        // if let Some(audio_ocr) = &audio_ocr_result {
        //     if let Some(first_time) = audio_ocr.first_text_detected_time {
        //         timing_data.first_char_appear_time =
        //             chrono::DateTime::from_timestamp_millis(first_time as i64);
        //     }
        //     if let Some(stable_time) = audio_ocr.text_stabilized_time {
        //         timing_data.full_text_appear_time =
        //             chrono::DateTime::from_timestamp_millis(stable_time as i64);
        //     }
        // }

        // // 从ocr_task获取动作开始时间（暂时使用first_text_detected_time）
        // if let Some(ocr) = &ocr_result {
        //     if let Some(action_time) = ocr.first_text_detected_time {
        //         timing_data.action_start_time =
        //             chrono::DateTime::from_timestamp_millis(action_time as i64);
        //     }
        // }

        // tts_first_frame_time暂时留空
        timing_data.tts_first_frame_time = None;

        // 计算时间差值
        timing_data.calculate_durations();

        // 7. 提取时间数据用于日志记录
        log::info!("[{}] 时间参数采集完成:", self.id);
        if let Some(recognition_time) = timing_data.voice_recognition_time_ms {
            log::info!("[{}]   语音识别时间: {}ms", self.id, recognition_time);
        }
        if let Some(interaction_time) = timing_data.interaction_response_time_ms {
            log::info!("[{}]   交互响应时间: {}ms", self.id, interaction_time);
        }
        if let Some(tts_time) = timing_data.tts_response_time_ms {
            log::info!("[{}]   TTS响应时间: {}ms", self.id, tts_time);
        }

        // 尽早释放读锁
        drop(context_reader);

        // 3. 直接使用 self.db 进行数据库操作
        log::info!("[{}] 保存车机响应到数据库...", self.id);
        self.db
            .save_machine_response(self.task_id, self.sample_id as i64, &response_data)
            .await
            .map_err(|e| format!("[{}] 保存车机响应失败: {}", self.id, e))?;

        // 如果active_task失败，修改分析结果以反映唤醒失败
        if active_task_failed {
            log::info!("[{}] active_task失败，将分析结果标记为唤醒失败", self.id);
            analysis_result.assessment.overall_score = 0.0;
            analysis_result.assessment.valid = false; // 使用valid字段标记失败
            analysis_result.assessment.semantic_correctness.score = 0.0;
            analysis_result.assessment.state_change_confirmation.score = 0.0;
            analysis_result.assessment.unambiguous_expression.score = 0.0;

            // 添加失败原因说明
            if analysis_result.assessment.suggestions.is_empty() {
                analysis_result
                    .assessment
                    .suggestions
                    .push("语音唤醒检测超时或失败，未能成功唤醒车机系统".to_string());
            } else {
                analysis_result.assessment.suggestions.insert(
                    0,
                    "语音唤醒检测超时或失败，未能成功唤醒车机系统".to_string(),
                );
            }
        }

        log::info!("[{}] 保存分析结果到数据库...", self.id);
        self.db
            .save_analysis_result(self.task_id, self.sample_id as i64, &analysis_result)
            .await
            .map_err(|e| format!("[{}] 保存分析结果失败: {}", self.id, e))?;

        // 保存时间数据
        log::info!("[{}] 保存时间数据到数据库...", self.id);
        println!("时间数据：{:?}", timing_data.clone());
        self.db
            .save_timing_data(self.task_id, self.sample_id as i64, &timing_data)
            .await
            .map_err(|e| format!("[{}] 保存时间数据失败: {}", self.id, e))?;

        // 记录时间参数
        if let Some(recognition_time) = timing_data.voice_recognition_time_ms {
            log::info!("[{}]   语音识别时间: {}ms", self.id, recognition_time);
        }
        if let Some(interaction_time) = timing_data.interaction_response_time_ms {
            log::info!("[{}]   交互响应时间: {}ms", self.id, interaction_time);
        }
        if let Some(tts_time) = timing_data.tts_response_time_ms {
            log::info!("[{}]   TTS响应时间: {}ms", self.id, tts_time);
        }

        log::info!("[{}] 更新任务状态为完成...", self.id);
        self.db
            .update_task_status(self.task_id, "completed")
            .await
            .map_err(|e| format!("[{}] 更新任务状态失败: {}", self.id, e))?;

        // 可选：更新任务进度为100%
        self.db
            .update_task_progress(self.task_id, 1.0)
            .await
            .map_err(|e| format!("[{}] 更新任务进度失败: {}", self.id, e))?;

        log::info!("[{}] 数据保存完成 - 样本ID: {}", self.id, self.sample_id);

        // 4. 发送完成事件到前端
        let mut event_data = serde_json::json!({
            "task_id": self.task_id,
            "sample_id": self.sample_id,
            "response": response_data.text,
            "analysis_score": analysis_result.assessment.overall_score
        });

        // 添加时间参数到事件数据
        if let Some(recognition_time) = timing_data.voice_recognition_time_ms {
            event_data["voice_recognition_time_ms"] = serde_json::Value::from(recognition_time);
        }
        if let Some(interaction_time) = timing_data.interaction_response_time_ms {
            event_data["interaction_response_time_ms"] = serde_json::Value::from(interaction_time);
        }
        if let Some(tts_time) = timing_data.tts_response_time_ms {
            event_data["tts_response_time_ms"] = serde_json::Value::from(tts_time);
        }

        app_handle.emit("finish_task_complete", event_data)?;

        Ok(())
    }

    /// 保存超时错误数据
    async fn save_timeout_error_data(
        &self,
        context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        log::info!(
            "[{}] 保存超时错误数据 - 样本ID: {}",
            self.id,
            self.sample_id
        );

        // 检查是否为唤醒检测任务
        let is_wake_detection_task = self.wake_word_id.is_some();
        
        if is_wake_detection_task {
            log::info!(
                "[{}] 唤醒检测任务超时，跳过保存错误数据 - 样本ID: {}",
                self.id,
                self.sample_id
            );
            
            // 对于唤醒检测任务，只更新任务状态
            self.db
                .update_task_status(self.task_id, "completed")
                .await
                .map_err(|e| format!("[{}] 更新任务状态失败: {}", self.id, e))?;

            self.db
                .update_task_progress(self.task_id, 1.0)
                .await
                .map_err(|e| format!("[{}] 更新任务进度失败: {}", self.id, e))?;

            // 发送完成事件到前端
            let event_data = serde_json::json!({
                "task_id": self.task_id,
                "sample_id": self.sample_id,
                "response": "唤醒检测超时",
                "analysis_score": 0.0,
                "status": "timeout"
            });

            app_handle.emit("finish_task_complete", event_data)?;

            log::info!(
                "[{}] 唤醒检测任务超时处理完成 - 样本ID: {}",
                self.id,
                self.sample_id
            );
            return Ok(());
        }

        // 对于非唤醒检测任务，保存完整的超时错误数据
        // 创建超时错误的分析结果
        let timeout_analysis_result = AnalysisResult {
            assessment: crate::models::Assessment {
                semantic_correctness: crate::models::AssessmentItem {
                    score: 0.0,
                    comment: "视觉检测超时，无法进行语义正确性评估".to_string(),
                },
                state_change_confirmation: crate::models::AssessmentItem {
                    score: 0.0,
                    comment: "视觉检测超时，无法进行状态变化确认评估".to_string(),
                },
                unambiguous_expression: crate::models::AssessmentItem {
                    score: 0.0,
                    comment: "视觉检测超时，无法进行表达明确性评估".to_string(),
                },
                overall_score: 0.0,
                valid: false,
                suggestions: vec![
                    "检查视觉检测配置".to_string(),
                    "增加检测超时时间".to_string(),
                ],
            },
            llm_analysis: Some(crate::models::LlmAnalysis {
                title: "超时错误".to_string(),
                content: "视觉检测任务超时，系统未能及时响应".to_string(),
                context: false,
                multi_round: false,
            }),
            test_time: Some(chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()),
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
            result_status: Some("timeout".to_string()),
            recognition_time: None,
            response_time: None,
        };

        // 创建超时错误的机器响应数据
        let timeout_response_data = MachineResponseData {
            text: "视觉检测超时".to_string(),
            connected: false,
        };

        // 创建超时错误的时间数据
        let timeout_timing_data = TimingData {
            voice_command_start_time: None,
            first_char_appear_time: None,
            voice_command_end_time: None,
            full_text_appear_time: None,
            action_start_time: None,
            tts_first_frame_time: None,
            voice_recognition_time_ms: None,
            interaction_response_time_ms: None,
            tts_response_time_ms: None,
        };

        // 保存到数据库
        self.db
            .save_analysis_result(
                self.task_id,
                self.sample_id as i64,
                &timeout_analysis_result,
            )
            .await
            .map_err(|e| format!("[{}] 保存超时错误分析结果失败: {}", self.id, e))?;

        self.db
            .save_machine_response(self.task_id, self.sample_id as i64, &timeout_response_data)
            .await
            .map_err(|e| format!("[{}] 保存超时错误机器响应失败: {}", self.id, e))?;

        self.db
            .save_timing_data(self.task_id, self.sample_id as i64, &timeout_timing_data)
            .await
            .map_err(|e| format!("[{}] 保存超时错误时间数据失败: {}", self.id, e))?;

        // 更新任务状态
        self.db
            .update_task_status(self.task_id, "completed")
            .await
            .map_err(|e| format!("[{}] 更新任务状态失败: {}", self.id, e))?;

        self.db
            .update_task_progress(self.task_id, 1.0)
            .await
            .map_err(|e| format!("[{}] 更新任务进度失败: {}", self.id, e))?;

        // 发送超时完成事件到前端
        let event_data = serde_json::json!({
            "task_id": self.task_id,
            "sample_id": self.sample_id,
            "response": "视觉检测超时",
            "analysis_score": 0.0,
            "status": "timeout"
        });

        app_handle.emit("finish_task_complete", event_data)?;

        log::info!(
            "[{}] 超时错误数据保存完成 - 样本ID: {}",
            self.id,
            self.sample_id
        );
        Ok(())
    }
}

#[async_trait]
impl Task for finish_task {
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
            "[{}] 开始执行 - 保存样本 {} 的结果",
            self.id,
            self.sample_id
        );

        // 检查active_task的结果，如果超时则保存超时错误数据
        // 注意：对于唤醒检测任务，超时是正常情况，不需要保存错误数据
        let context_reader = context.read().await;
        let mut is_timeout = false;
        let is_wake_detection_task = self.wake_word_id.is_some(); // 判断是否为唤醒检测任务
        
        for (task_id, result) in context_reader.iter() {
            if let Some(active_task_id) = &self.active_task_id {
                if task_id == active_task_id {
                    if let Some(result_any) = result.downcast_ref::<serde_json::Value>() {
                        if let Some(status) = result_any.get("status").and_then(|s| s.as_str()) {
                            if status == "timeout" {
                                println!(
                                    "[{}] Active task timed out",
                                    self.id
                                );
                                is_timeout = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
        drop(context_reader);

        // 如果是超时且不是唤醒检测任务，则保存超时错误数据
        if is_timeout && !is_wake_detection_task {
            println!(
                "[{}] Active task timed out in non-wake-detection task, saving timeout error data",
                self.id
            );
            return self.save_timeout_error_data(context, app_handle).await;
        }

        loop {
            let signal = control_rx.borrow().clone();
            match signal {
                ControlSignal::Running => {
                    log::info!("[{}] 收到 'Running' 信号, 开始数据保存操作", self.id);

                    match self
                        .process_and_save_data(context.clone(), app_handle.clone())
                        .await
                    {
                        Ok(_) => {
                            log::info!("[{}] 样本 {} 的数据已成功保存", self.id, self.sample_id);
                            return Ok(()); // 任务成功完成
                        }
                        Err(e) => {
                            log::error!(
                                "[{}] 保存样本 {} 数据时发生错误: {}",
                                self.id,
                                self.sample_id,
                                e
                            );
                            return Err(e); // 任务失败
                        }
                    }
                }
                ControlSignal::Paused => {
                    log::info!("[{}] 收到 'Paused' 信号, 等待中...", self.id);
                }
                ControlSignal::Stopped => {
                    log::info!("[{}] 收到 'Stopped' 信号, 优雅退出", self.id);
                    return Ok(());
                }
            }

            // 如果未执行，则等待信号变化
            if control_rx.changed().await.is_err() {
                log::warn!("[{}] 控制通道已关闭，任务退出", self.id);
                return Ok(());
            }
        }
    }
}
