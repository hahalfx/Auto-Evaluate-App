// 测试语料类型
export interface TestSample {
  id: number
  text: string
  status?: string
  repeats?: number
  result?: Record<number, AnalysisResult>
}

export interface WakeWord {
  id: number
  text: string
}
  
export interface Task {
  name: string
  id: number
  test_samples_ids: number[]
  wake_word_id: number
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
  test_time?: string
  audioFile?: string;
  recognitionFile?: string;
  device?: string;
  recognitionResult?: string;
  insertionErrors?: number | null;
  deletionErrors?: number | null;
  substitutionErrors?: number | null;
  totalWords?: number | null;
  referenceText?: string;
  recognizedText?: string;
  resultStatus?: string;
  recognitionTime?: number | null;
  responseTime?: number | null;
}

// 车机响应类型
export interface MachineResponseData {
  text: string
  connected: boolean
}
