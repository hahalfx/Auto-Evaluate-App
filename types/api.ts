// 测试语料类型
export interface TestSample {
  id: number
  text: string
  status?: string
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
}

// 车机响应类型
export interface MachineResponseData {
  text: string
  connected: boolean
}

