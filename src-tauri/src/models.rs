use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;

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
pub struct TeatCase {
    
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
    pub current: u32,
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
