"use client"

import { CheckCircle, XCircle, AlertTriangle } from "lucide-react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { AnalysisResult } from "@/types/api"
import { ScoreDisplay } from "./score-display"

interface AnalysisResultsProps {
  result: AnalysisResult | null
  loading: boolean
  error: string | null
}

export function AnalysisResults({ result, loading, error }: AnalysisResultsProps) {
  // 将评估项目名称转换为可读标签
  const getAssessmentLabel = (key: string): string => {
    const labels: Record<string, string> = {
      semantic_correctness: "语义正确性",
      state_change_confirmation: "状态变更确认",
      unambiguous_expression: "表达无歧义性",
      overall_score: "总体评分",
    }
    return labels[key] || key
  }

  return (
    <Card className="flex flex-col h-full shadow-sm rounded-lg overflow-auto">
      <CardHeader className="bg-background p-3 space-y-0 border-b">
        <h3 className="font-semibold text-foreground">结果判定和解析</h3>
      </CardHeader>
      <CardContent className="flex-1 p-5">
          {/* 结果判定部分 - 始终显示标题 */}
          <div className="mb-6">
            <span className="font-bold text-primary flex items-center text-lg">
              <div className="w-1.5 h-5 bg-primary mr-2 rounded-sm"></div>
              结果判定
            </span>

            {loading ? (
              <div className="flex justify-center items-center my-6">
                <Skeleton className="h-20 w-40" />
              </div>
            ) : error || !result ? (
              <div className="flex justify-center items-center my-6">
                <div className="bg-card px-8 py-3 rounded-lg border border-muted shadow-sm">
                  <span className="text-muted-foreground text-xl">等待分析</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-center items-center my-6">
                <div
                  className={`bg-card px-8 py-3 rounded-lg border shadow-sm ${
                    result.assessment.valid
                      ? "border-green-500 border-opacity-30"
                      : "border-destructive border-opacity-30"
                  }`}
                >
                  <div className="flex items-center">
                    {result.assessment.valid ? (
                      <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
                    ) : (
                      <XCircle className="h-8 w-8 text-destructive mr-3" />
                    )}
                    <span
                      className={`text-4xl font-bold ${
                        result.assessment.valid ? "text-green-600" : "text-destructive"
                      }`}
                    >
                      {result.assessment.valid ? "通过" : "不通过"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 评估详情部分 - 始终显示标题 */}
          <div className="mb-6">
            <span className="font-bold text-primary flex items-center text-lg mb-4">
              <div className="w-1.5 h-5 bg-primary mr-2 rounded-sm"></div>
              大模型评估详情
            </span>

            {loading ? (
              <div className="space-y-4 bg-muted/30 p-4 rounded-lg shadow-sm border">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : error || !result ? (
              <div className="bg-muted/30 p-4 rounded-lg shadow-sm border">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-muted-foreground">请选择测试语料并提交车机响应进行分析</p>
                  {error && <p className="text-destructive mt-2">{error}</p>}
                </div>
              </div>
            ) : (
              <div className="bg-muted/30 p-4 rounded-lg shadow-sm border">
                {/* 语义正确性 */}
                <ScoreDisplay
                  score={result.assessment.semantic_correctness.score}
                  label={getAssessmentLabel("semantic_correctness")}
                  comment={result.assessment.semantic_correctness.comment}
                />

                {/* 状态变更确认 */}
                <ScoreDisplay
                  score={result.assessment.state_change_confirmation.score}
                  label={getAssessmentLabel("state_change_confirmation")}
                  comment={result.assessment.state_change_confirmation.comment}
                />

                {/* 表达无歧义性 */}
                <ScoreDisplay
                  score={result.assessment.unambiguous_expression.score}
                  label={getAssessmentLabel("unambiguous_expression")}
                  comment={result.assessment.unambiguous_expression.comment}
                />

                {/* 总体评分 */}
                <ScoreDisplay score={result.assessment.overall_score} label={getAssessmentLabel("overall_score")} />

                {/* 改进建议 */}
                {result.assessment.suggestions && result.assessment.suggestions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center text-amber-600 mb-2">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      <span className="font-medium">改进建议</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                      {result.assessment.suggestions.map((suggestion, index) => (
                        <li key={index} className="text-sm text-muted-foreground">
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LLM分析部分 - 仅在有结果时显示
          {result && result.llmAnalysis && (
            <div className="mb-4">
              <span className="font-bold text-primary flex items-center text-lg">
                <div className="w-1.5 h-5 bg-primary mr-2 rounded-sm"></div>
                {result.llmAnalysis.title || "大模型分析"}
              </span>
              <div className="mt-4 bg-muted/30 p-4 rounded-lg shadow-sm border">
                <p className="mb-2 text-primary font-medium">情感表达：</p>
                <p className="text-sm leading-relaxed">{result.llmAnalysis.content}</p>
                <div className="mt-6 space-y-2 border-t pt-4">
                  <p className="text-muted-foreground">——上下文理解{result.llmAnalysis.context ? "有" : "无"}。</p>
                  <p className="text-muted-foreground">——多轮交互{result.llmAnalysis.multiRound ? "有" : "无"}。</p>
                </div>
              </div>
            </div>
          )}

          {/* 加载中时显示LLM分析的骨架屏 */}
          {/*loading && (
            <div className="mb-4">
              <span className="font-bold text-primary flex items-center text-lg">
                <div className="w-1.5 h-5 bg-primary mr-2 rounded-sm"></div>
                大模型分析
              </span>
              <div className="mt-4 bg-muted/30 p-4 rounded-lg shadow-sm border space-y-4">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          )} */}
      </CardContent>
    </Card>
  )
}

