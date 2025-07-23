// Corresponds to Rust struct `AssessmentItem`
export interface AssessmentItem {
  score: number; // f64 in Rust
  comment: string;
}

// Corresponds to Rust struct `Assessment`
export interface Assessment {
  semantic_correctness: AssessmentItem;
  state_change_confirmation: AssessmentItem;
  unambiguous_expression: AssessmentItem;
  overall_score: number; // f64 in Rust
  valid: boolean;
  suggestions: string[];
}

// Corresponds to Rust struct `LlmAnalysis`
export interface LlmAnalysis {
  title: string;
  content: string;
  context: boolean;
  multi_round: boolean;
}

// Corresponds to Rust struct `AnalysisResult`
export interface AnalysisResult {
  assessment: Assessment;
  llm_analysis: LlmAnalysis | null; // Option<LlmAnalysis>
  test_time?: string | null; // Option<String> - making it optional string or null to match undefined possibility
  audio_file: string | null;
  recognition_file: string | null;
  device: string | null;
  recognition_result: string | null;
  insertion_errors: number | null; // Option<u32>
  deletion_errors: number | null; // Option<u32>
  substitution_errors: number | null; // Option<u32>
  total_words: number | null; // Option<u32>
  reference_text: string | null;
  recognized_text: string | null;
  result_status: string | null;
  recognition_time: number | null; // Option<f32>
  response_time: number | null; // Option<f32>
}

// Corresponds to Rust struct `TaskProgress`
export interface TaskProgress {
  value: number; // f32 in Rust
  current: number; // u32 in Rust
  total: number; // u32 in Rust
}

// Corresponds to Rust struct `PlayAudioEvent`
export interface PlayAudioEvent {
  wake_word_id: number; // u32 in Rust
  sample_text: string;
  sample_id: number; // u32 in Rust
}

// Corresponds to Rust struct `MachineResponseData`
export interface MachineResponseData {
  text: string;
  connected: boolean;
}

// Corresponds to Rust struct `TestSample`
export interface TestSample {
  id: number; // u32 in Rust
  text: string;
  status?: string | null; // Option<String>
  repeats?: number | null; // Option<u32>
  // The 'result' field in Rust's TestSample (HashMap<u32, AnalysisResult>)
  // might be complex to represent directly if it's keyed by task ID within a generic sample.
  // For simplicity, if the frontend's `samples` array holds generic samples,
  // this specific task-related result might be handled differently or not included here.
  // If it's crucial, it would be:
  // result?: Record<number, AnalysisResult> | null;
}

// Corresponds to Rust struct `WakeWord`
export interface WakeWord {
  id: number; // u32 in Rust
  text: string;
}

// Corresponds to Rust struct `Task`
export interface Task {
  id: number; // u32
  name: string;
  test_samples_ids: number[]; // Vec<u32>
  wake_word_ids: number[]; // Vec<u32> - 修改为支持多个唤醒词
  machine_response?: Record<string, MachineResponseData> | null; // Option<HashMap<u32, MachineResponseData>> (JS object keys are strings)
  test_result?: Record<string, AnalysisResult> | null;    // Option<HashMap<u32, AnalysisResult>>
  task_status: string;
  task_progress?: number | null; // Option<f32>
  created_at: string;
  audio_type?: string | null;
  audio_file?: string | null;
  audio_duration?: string | null;
  audio_category?: string | null;
  test_collection?: string | null;
  test_duration?: string | null;
  sentence_accuracy?: number | null;
  word_accuracy?: number | null;
  character_error_rate?: number | null;
  recognition_success_rate?: number | null;
  total_words?: number | null; // Option<u32>
  insertion_errors?: number | null; // Option<u32>
  deletion_errors?: number | null; // Option<u32>
  substitution_errors?: number | null; // Option<u32>
  fastest_recognition_time?: number | null; // Option<f32>
  slowest_recognition_time?: number | null; // Option<f32>
  average_recognition_time?: number | null; // Option<f32>
  completed_samples?: number | null; // Option<u32>
}

// You might want to add other types from models.rs if they are needed for other Tauri interactions
