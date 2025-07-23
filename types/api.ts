// 测试语料类型
export interface TestSample {
  id: number
  text: string
  audio_file?: string | null; // Added audio_file
  status?: string
  repeats?: number
  result?: Record<number, AnalysisResult>
}

export interface WakeWord {
  id: number
  text: string
  audio_file?: string | null; // Added audio_file
}
  
export interface Task {
  name: string
  id: number
  test_samples_ids: number[]
  wake_word_ids: number[] // 修改为支持多个唤醒词
  machine_response?: Record<number,MachineResponseData>
  test_result?: Record<number, AnalysisResult>
  task_status: string
  task_progress?: number
  created_at: string
  audioType?: string;
  audioFile?: string;
  audioDuration?: string;
  audioCategory?: string;
  testCollection?: string;
  testDuration?: string;
  sentenceAccuracy?: number | null;
  wordAccuracy?: number | null;
  characterErrorRate?: number | null;
  recognitionSuccessRate?: number | null;
  totalWords?: number | null;
  insertionErrors?: number | null;
  deletionErrors?: number | null;
  substitutionErrors?: number | null;
  fastestRecognitionTime?: number | null;
  slowestRecognitionTime?: number | null;
  averageRecognitionTime?: number | null;
  completedSamples?: number | null;
}

// 评估项目类型
export interface AssessmentItem {
  score: number
  comment: string
}

// 评估结果类型
export interface Assessment {
  semantic_correctness: AssessmentItem
  state_change_confirmation: AssessmentItem
  unambiguous_expression: AssessmentItem
  overall_score: number
  valid: boolean
  suggestions: string[]
}

// 分析结果类型
export interface AnalysisResult {
  assessment: Assessment
  llmAnalysis?: {
    title: string
    content: string
    context: boolean
    multiRound: boolean
  }
  test_time?: string | null;
  audioFile?: string | null;
  recognitionFile?: string | null;
  device?: string | null;
  recognitionResult?: string | null;
  insertionErrors?: number | null;
  deletionErrors?: number | null;
  substitutionErrors?: number | null;
  totalWords?: number | null;
  referenceText?: string | null;
  recognizedText?: string | null;
  resultStatus?: string | null;
  recognitionTime?: number | null;
  responseTime?: number | null;
}

// 车机响应类型
export interface MachineResponseData {
  text: string
  connected: boolean
}

// 任务进度类型
export interface TaskProgress {
  value: number
  current_sample: number
  current_stage?: string
  total: number
}

// 时间参数类型 - 车机语音测试时间数据
export interface TimingData {
  voiceCommandStartTime?: string | null;
  firstCharAppearTime?: string | null;
  voiceCommandEndTime?: string | null;
  fullTextAppearTime?: string | null;
  actionStartTime?: string | null;
  ttsFirstFrameTime?: string | null;
  voiceRecognitionTimeMs?: number | null;
  interactionResponseTimeMs?: number | null;
  ttsResponseTimeMs?: number | null;
}
