import { NextResponse } from "next/server"
import type { AnalysisResult } from "@/types/api"

export async function POST(request: Request) {
  const body = await request.json()
  const { sampleId, machineResponse } = body

  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // 模拟分析结果
  const result: AnalysisResult = {
    assessment: {
      semantic_correctness: {
        score: Math.random(),
        comment: "响应内容与用户指令的语义匹配程度评估。",
      },
      state_change_confirmation: {
        score: Math.random(),
        comment: "系统是否明确确认了状态变更。",
      },
      unambiguous_expression: {
        score: Math.random(),
        comment: "响应表达是否清晰无歧义。",
      },
      overall_score: Math.random(),
      valid: Math.random() > 0.5,
      suggestions: [
        "提高语义理解准确性，确保正确识别用户意图",
        "明确反馈系统状态变更，增强用户体验",
        "使用更简洁明了的表达方式",
      ],
    },
    llmAnalysis: {
      title: "deepseek&星火大模型分析",
      content: `分析了用户的"${machineResponse}"响应。从响应内容来看，车机对用户的指令做出了回应，但存在一定的理解偏差。建议进一步优化语义理解模型，提高响应准确性。`,
      context: Math.random() > 0.7,
      multiRound: Math.random() > 0.8,
    },
  }

  return NextResponse.json(result)
}

