use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;

// 导入时间数据模块
use chrono::{DateTime, Utc, Duration};

// 前端兼容的数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSample {
    pub id: u32,
    pub text: String,
    pub audio_file: Option<String>, // Added audio_file
    pub status: Option<String>,
    pub repeats: Option<u32>,
    pub result: Option<HashMap<u32, AnalysisResult>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WakeWord {
    pub id: u32,
    pub text: String,
    pub audio_file: Option<String>, // Added audio_file
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: u32,
    pub name: String,
    pub test_samples_ids: Vec<u32>,
    pub wake_word_id: u32,
    pub machine_response: Option<HashMap<u32, MachineResponseData>>,
    pub test_result: Option<HashMap<u32, AnalysisResult>>,
    pub task_status: String,
    pub task_progress: Option<f32>,
    pub created_at: String,
    pub audio_type: Option<String>,
    pub audio_file: Option<String>,
    pub audio_duration: Option<String>,
    pub audio_category: Option<String>,
    pub test_collection: Option<String>,
    pub test_duration: Option<String>,
    pub sentence_accuracy: Option<f32>,
    pub word_accuracy: Option<f32>,
    pub character_error_rate: Option<f32>,
    pub recognition_success_rate: Option<f32>,
    pub total_words: Option<u32>,
    pub insertion_errors: Option<u32>,
    pub deletion_errors: Option<u32>,
    pub substitution_errors: Option<u32>,
    pub fastest_recognition_time: Option<f32>,
    pub slowest_recognition_time: Option<f32>,
    pub average_recognition_time: Option<f32>,
    pub completed_samples: Option<u32>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssessmentItem {
    pub score: f64,
    pub comment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assessment {
    pub semantic_correctness: AssessmentItem,
    pub state_change_confirmation: AssessmentItem,
    pub unambiguous_expression: AssessmentItem,
    pub overall_score: f64,
    pub valid: bool,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmAnalysis {
    pub title: String,
    pub content: String,
    pub context: bool,
    pub multi_round: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub assessment: Assessment,
    pub llm_analysis: Option<LlmAnalysis>,
    pub test_time: Option<String>,
    pub audio_file: Option<String>,
    pub recognition_file: Option<String>,
    pub device: Option<String>,
    pub recognition_result: Option<String>,
    pub insertion_errors: Option<u32>,
    pub deletion_errors: Option<u32>,
    pub substitution_errors: Option<u32>,
    pub total_words: Option<u32>,
    pub reference_text: Option<String>,
    pub recognized_text: Option<String>,
    pub result_status: Option<String>,
    pub recognition_time: Option<f32>,
    pub response_time: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MachineResponseData {
    pub text: String,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskProgress {
    pub value: f32,
    pub current_sample: u32,
    pub current_stage: Option<String>,
    pub total: u32,
}

// 数据库行结构
#[derive(Debug, Clone, FromRow)]
pub struct TaskRow {
    pub id: i64,
    pub name: String,
    pub wake_word_id: i64,
    pub task_status: String,
    pub task_progress: Option<f64>,
    pub created_at: String,
    pub audio_type: Option<String>,
    pub audio_file: Option<String>,
    pub audio_duration: Option<String>,
    pub audio_category: Option<String>,
    pub test_collection: Option<String>,
    pub test_duration: Option<String>,
    pub sentence_accuracy: Option<f64>,
    pub word_accuracy: Option<f64>,
    pub character_error_rate: Option<f64>,
    pub recognition_success_rate: Option<f64>,
    pub total_words: Option<i64>,
    pub insertion_errors: Option<i64>,
    pub deletion_errors: Option<i64>,
    pub substitution_errors: Option<i64>,
    pub fastest_recognition_time: Option<f64>,
    pub slowest_recognition_time: Option<f64>,
    pub average_recognition_time: Option<f64>,
    pub completed_samples: Option<i64>,
}

#[derive(Debug, Clone, FromRow)]
pub struct TestSampleRow {
    pub id: i64,
    pub text: String,
    pub audio_file: Option<String>, // Added audio_file
    pub status: Option<String>,
    pub repeats: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, FromRow)]
pub struct WakeWordRow {
    pub id: i64,
    pub text: String,
    pub audio_file: Option<String>, // Added audio_file
    pub created_at: String,
}

#[derive(Debug, Clone, FromRow)]
pub struct TaskSampleRow {
    pub task_id: i64,
    pub sample_id: i64,
}

#[derive(Debug, Clone, FromRow)]
pub struct AnalysisResultRow {
    pub id: i64,
    pub task_id: i64,
    pub sample_id: i64,
    pub semantic_correctness_score: f64,
    pub semantic_correctness_comment: Option<String>,
    pub state_change_score: f64,
    pub state_change_comment: Option<String>,
    pub unambiguous_score: f64,
    pub unambiguous_comment: Option<String>,
    pub overall_score: f64,
    pub is_valid: bool,
    pub suggestions: Option<String>, // JSON string
    pub llm_title: Option<String>,
    pub llm_content: Option<String>,
    pub llm_context: Option<bool>,
    pub llm_multi_round: Option<bool>,
    pub test_time: Option<String>,
    pub audio_file: Option<String>,
    pub recognition_file: Option<String>,
    pub device: Option<String>,
    pub recognition_result: Option<String>,
    pub insertion_errors: Option<i64>,
    pub deletion_errors: Option<i64>,
    pub substitution_errors: Option<i64>,
    pub total_words: Option<i64>,
    pub reference_text: Option<String>,
    pub recognized_text: Option<String>,
    pub result_status: Option<String>,
    pub recognition_time: Option<f64>,
    pub response_time: Option<f64>,
    pub created_at: String,
}

#[derive(Debug, Clone, FromRow)]
pub struct MachineResponseRow {
    pub id: i64,
    pub task_id: i64,
    pub sample_id: i64,
    pub text: String,
    pub connected: bool,
    pub created_at: String,
}

// 事件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayAudioEvent {
    pub wake_word_id: u32,
    pub sample_text: String,
    pub sample_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisCompletedEvent {
    pub sample_id: u32,
    pub result: AnalysisResult,
}

/// 车机语音测试时间参数数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingData {
    /// 语音指令开始时间（audio_task开始播放时）
    pub voice_command_start_time: Option<DateTime<Utc>>,
    
    /// 车机首字上屏时间（OCR检测到第一个字符）
    pub first_char_appear_time: Option<DateTime<Utc>>,
    
    /// 语音指令结束时间（audio_task播放完成时）
    pub voice_command_end_time: Option<DateTime<Utc>>,
    
    /// 语音全部上屏时间（OCR检测到完整文本）
    pub full_text_appear_time: Option<DateTime<Utc>>,
    
    /// 动作开始执行时间（检测到车机动作开始）
    pub action_start_time: Option<DateTime<Utc>>,
    
    /// TTS回复第一帧时间（检测到TTS音频开始）
    pub tts_first_frame_time: Option<DateTime<Utc>>,
    
    /// 语音识别时间 = 首字上屏时间 - 语音指令开始时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voice_recognition_time_ms: Option<i64>,
    
    /// 交互响应时间 = 动作开始时间 - 语音指令结束时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interaction_response_time_ms: Option<i64>,
    
    /// TTS响应时间 = TTS第一帧时间 - 语音指令结束时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tts_response_time_ms: Option<i64>,
}

impl TimingData {
    /// 创建新的时间数据实例
    pub fn new() -> Self {
        Self {
            voice_command_start_time: None,
            first_char_appear_time: None,
            voice_command_end_time: None,
            full_text_appear_time: None,
            action_start_time: None,
            tts_first_frame_time: None,
            voice_recognition_time_ms: None,
            interaction_response_time_ms: None,
            tts_response_time_ms: None,
        }
    }

    /// 计算所有时间差值
    pub fn calculate_durations(&mut self) {
        if let (Some(start), Some(first_char)) = (self.voice_command_start_time, self.first_char_appear_time) {
            self.voice_recognition_time_ms = Some(first_char.signed_duration_since(start).num_milliseconds());
        }

        if let (Some(end), Some(action_start)) = (self.voice_command_end_time, self.action_start_time) {
            self.interaction_response_time_ms = Some(action_start.signed_duration_since(end).num_milliseconds());
        }

        if let (Some(end), Some(tts_start)) = (self.voice_command_end_time, self.tts_first_frame_time) {
            self.tts_response_time_ms = Some(tts_start.signed_duration_since(end).num_milliseconds());
        }
    }

    /// 检查是否所有必需时间都已采集
    pub fn is_complete(&self) -> bool {
        self.voice_command_start_time.is_some() &&
        self.voice_command_end_time.is_some() &&
        self.first_char_appear_time.is_some() &&
        self.full_text_appear_time.is_some()
    }
}
// OCR视频帧数据结构，用于实时视频OCR处理
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrame {
    pub data: Vec<u8>,      // 图像数据 (JPEG/PNG格式)
    pub timestamp: u64,     // 时间戳 (毫秒)
    pub width: u32,         // 图像宽度
    pub height: u32,        // 图像高度
}

/// OCR任务状态监控
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrTaskStatus {
    pub is_running: bool,
    pub processed_frames: usize,
    pub queue_size: usize,
    pub current_fps: f32,
}
