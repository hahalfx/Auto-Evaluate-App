"use client";

import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Download,
  FileUp,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalysisResult } from "@/types/api";
import { ScoreDisplay } from "./score-display";
import { Button } from "./ui/button";
import { use, useEffect, useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentTask } from "@/store/taskSlice";
import { Badge } from "./ui/badge";
import { selectAllSamples } from "@/store/samplesSlice";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { generateASRTestReport, example } from "../utils/generateASRTestReport";
import { useExportCurrentTask } from "@/hooks/useExportCurrentTask";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

interface AnalysisResultsProps {
  error: string | null;
}

export function AnalysisResults({
  error,
}: AnalysisResultsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const currentTask = useAppSelector(selectCurrentTask);
  const samples = useAppSelector(selectAllSamples);
  const playMatchedAudio = useAudioPlayer();
  const  {exportCurrentTask}  = useExportCurrentTask();
  const [loading, setLoading] = useState(false);

  //设置tauri后端监听
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let unlistenevent: UnlistenFn | undefined;
    const setupListeners = async () => {
      try {
        unlisten = await listen<AnalysisResult>("llm_analysis_result", (event) => {
          console.log("React Component 收到 llm_analysis_result:", event.payload);
          setResult(
            event.payload
          );
          setLoading(false);
        });;
      } catch (error) {
        console.error("监听 llm_analysis_result 失败:", error);
      }

      try {
        unlistenevent = await listen("llm_analysis_event", (event) => {
          console.log("React Component 收到 llm_analysis_event:", event.payload);
          event.payload === "start" && setLoading(true);
        });;
      } catch (error) {
        console.error("监听 llm_analysis_event 失败:", error);
      }

      return () => {
        if (unlisten) {
          try {
            unlisten();
            console.log("已取消监听");
          } catch (error) {
            console.error("取消监听失败:", error);
          }
        }
        if (unlistenevent) {
          try {
            unlistenevent();
            console.log("已取消监听");
          } catch (error) {
            console.error("取消监听失败:", error);
          }
        }
      };
    };
    
    setupListeners();
  }, []);

  const handleExportReport = () => {
    if (currentTask) {
      exportCurrentTask();
    }
  };

  // 将评估项目名称转换为可读标签
  const getAssessmentLabel = (key: string): string => {
    const labels: Record<string, string> = {
      semantic_correctness: "语义正确性",
      state_change_confirmation: "状态变更确认",
      unambiguous_expression: "表达无歧义性",
      overall_score: "总体评分",
    };
    return labels[key] || key;
  };

  return (
    <Card className="flex flex-1 h-full flex-col shadow-sm rounded-lg overflow-auto">
      <CardHeader className="bg-white p-3 space-y-0 border-b flex flex-row justify-between items-center">
        <h3 className="font-semibold text-foreground text-center">
          结果判定和解析
        </h3>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" className="flex-none">
              <FileUp className="mr-2 h-4 w-4" />
              导出结果
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[800px] h-auto max-h-[700px] flex flex-col">
            <DialogHeader className="grid grid-cols-9">
              <DialogTitle>导出结果</DialogTitle>
              <div className="col-start-8 space-x-2 !mt-0">
                <Button
                  onClick={handleExportReport}
                  disabled={!currentTask}
                  className="bg-blue-700 hover:bg-blue-600"
                >
                  <FileUp className="mr-2 h-4 w-4" />
                  导出结果报告
                </Button>
              </div>
            </DialogHeader>
            <div className="w-full overflow-auto">
              {!currentTask && (
                <div className="flex flex-col items-center justify-center h-full">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground text-sm">
                    请先选择一个任务
                  </p>
                </div>
              )}
              {currentTask && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">任务名</p>
                      <p className="text-lg">{currentTask.name}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">任务ID</p>
                      <p className="text-lg">{currentTask.id}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">状态</p>
                      <div
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                          currentTask.task_status === "completed"
                            ? "bg-green-100 text-green-800"
                            : currentTask.task_status === "in_progress"
                            ? "bg-blue-100 text-blue-800"
                            : currentTask.task_status === "failed"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {currentTask.task_status === "completed"
                          ? "已完成"
                          : currentTask.task_status === "in_progress"
                          ? "进行中"
                          : currentTask.task_status === "failed"
                          ? "失败"
                          : "待处理"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">唤醒词ID</p>
                    <Badge variant="outline">#{currentTask.wake_word_id}</Badge>
                  </div>

                  {/* 测试语料 */}
                  {samples.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">测试语料</p>
                      <div className="border rounded-lg p-4 space-y-3">
                        {currentTask.test_samples_ids.map((sampleId) => {
                          const sample = samples.find((s) => s.id === sampleId);
                          return sample ? (
                            <div
                              key={sampleId}
                              className="flex justify-between items-center border-b pb-2 last:border-0 last:pb-0"
                            >
                              <div>
                                <p className="font-medium">{sample.text}</p>
                                <p className="text-sm text-muted-foreground">
                                  语料 #{sampleId}
                                </p>
                              </div>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {currentTask.machine_response &&
                    Object.keys(currentTask.machine_response).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">车机响应</p>
                        <div className="border rounded-lg p-4 space-y-3">
                          {Object.entries(currentTask.machine_response).map(
                            ([sampleId, response]) => (
                              <div
                                key={sampleId}
                                className="flex justify-between items-start border-b pb-2 last:border-0 last:pb-0"
                              >
                                <div>
                                  <p className="font-medium">{response.text}</p>
                                  <p className="text-sm text-muted-foreground">
                                    语料 #{sampleId}
                                  </p>
                                </div>
                                <div
                                  className={`px-2 py-1 rounded-full text-xs ${
                                    response.connected
                                      ? "bg-green-100 text-green-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {response.connected ? "已连接" : "未连接"}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                  {currentTask.test_result &&
                    Object.keys(currentTask.test_result).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">测试结果</p>
                        <div className="border rounded-lg p-4 space-y-3">
                          {Object.entries(currentTask.test_result).map(
                            ([sampleId, result]) => (
                              <div
                                key={sampleId}
                                className="border-b pb-2 last:border-0 last:pb-0"
                              >
                                <div className="flex justify-between items-center mb-2">
                                  <p className="font-medium">
                                    语料 #{sampleId}
                                  </p>
                                  <div
                                    className={`px-2 py-1 rounded-full text-xs ${
                                      result.assessment.valid
                                        ? "bg-green-100 text-green-800"
                                        : "bg-red-100 text-red-800"
                                    }`}
                                  >
                                    {result.assessment.valid
                                      ? "通过"
                                      : "未通过"}
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                  <div className="text-center p-2 bg-gray-50 rounded-xl">
                                    <p className="text-sm text-muted-foreground">
                                      语义正确性
                                    </p>
                                    <p className="font-mono font-bold">
                                      {result.assessment.semantic_correctness.score.toFixed(
                                        1
                                      )}
                                    </p>
                                  </div>
                                  <div className="text-center p-2 bg-gray-50 rounded-xl">
                                    <p className="text-sm text-muted-foreground">
                                      状态变更确认
                                    </p>
                                    <p className="font-mono font-bold">
                                      {result.assessment.state_change_confirmation.score.toFixed(
                                        1
                                      )}
                                    </p>
                                  </div>
                                  <div className="text-center p-2 bg-gray-50 rounded-xl">
                                    <p className="text-sm text-muted-foreground">
                                      表达无歧义
                                    </p>
                                    <p className="font-mono font-bold">
                                      {result.assessment.unambiguous_expression.score.toFixed(
                                        1
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-center p-2 bg-gray-100 rounded-xl mb-2">
                                  <p className="text-sm text-muted-foreground">
                                    总分
                                  </p>
                                  <p className="font-mono font-bold text-lg">
                                    {result.assessment.overall_score.toFixed(1)}
                                  </p>
                                </div>
                                {result.assessment.suggestions.length > 0 && (
                                  <div>
                                    <p className="text-sm text-muted-foreground mb-1">
                                      改进建议:
                                    </p>
                                    <ul className="text-sm list-disc list-inside">
                                      {result.assessment.suggestions.map(
                                        (suggestion, idx) => (
                                          <li key={idx}>{suggestion}</li>
                                        )
                                      )}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-5 overflow-auto h-full">
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
          ) : error ? (
            <div className="flex justify-center items-center my-6">
              <div className="bg-gray-50 px-8 py-3 rounded-lg ">
                <span className="text-muted-foreground text-xl">错误: {error}</span>
              </div>
            </div>
          ) : !result?.assessment ? (
            <div className="flex justify-center items-center my-6">
              <div className="bg-gray-50 px-8 py-3 rounded-lg ">
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
                      result.assessment.valid
                        ? "text-green-600"
                        : "text-destructive"
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
        <div className="">
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
            <div className="bg-muted/30 p-4 rounded-lg shadow-sm ">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-muted-foreground">
                  请选择测试语料并提交车机响应进行分析
                </p>
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
              <ScoreDisplay
                score={result.assessment.overall_score}
                label={getAssessmentLabel("overall_score")}
              />

              {/* 改进建议 */}
              {result.assessment.suggestions &&
                result.assessment.suggestions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center text-amber-600 mb-2">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      <span className="font-medium">改进建议</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                      {result.assessment.suggestions.map(
                        (suggestion, index) => (
                          <li
                            key={index}
                            className="text-sm text-muted-foreground"
                          >
                            {suggestion}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
