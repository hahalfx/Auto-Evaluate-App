import { useAppSelector } from "@/store/hooks";
import { selectCurrentTask } from "@/store/taskSlice";
import { selectWakeWords, selectAllSamples } from "@/store/samplesSlice";
import { use, useEffect, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  tauriPauseWorkflow,
  tauriResumeWorkflow,
  tauriStopWorkflow,
} from "@/services/tauri-analysis-api";
import { TaskProgress, AnalysisResult } from "@/types/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Loader2, Play, Pause, ChevronLeft, ChevronRight, AlertTriangle, FileUp, BarChart3, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import type { WakeWord } from "@/types/api";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreDisplay } from "./score-display";
import { VisualWakeConfig } from "./ocr";

interface WakeDetectionResult {
  success: boolean;
  duration_ms: number;
  task_id: string;
  test_index?: number; // 添加测试索引
  wake_word_text?: string; // 添加唤醒词文本
  wake_word_id?: number; // 添加唤醒词ID
}

interface WorkflowStats {
  total_tests: number;
  success_count: number;
  success_rate: number;
  total_duration_ms: number;
  avg_duration_ms: number;
}

interface ProgressBarProps {
  progressname: string;
  samplelength: number;
  onStartAutomatedTest: (
    wakeWordId?: number,
    templateData?: Array<[string, string]>,
    frameRate?: number,
    threshold?: number,
    maxDetectionTimeSecs?: number
  ) => void;
  visualWakeConfig: VisualWakeConfig;
  isPlaying: boolean;
  isRecording: boolean;
  isAnalyzing: boolean;
  disabled: boolean;
  goToPreviousResult: () => void;
  hasPreviousResult: () => boolean;
  goToNextResult: () => void;
  hasNextResult: () => boolean;
  // 添加MachineResponse相关的props
  machineResponseValue: string;
  onMachineResponseChange: (value: string) => void;
  onMachineResponseSubmit: (overrideResponse?: string) => void;
  currentSampleText?: string;
  error?: string | null;
}

export function ProgressBar({
  progressname,
  samplelength,
  onStartAutomatedTest,
  visualWakeConfig,
  isPlaying,
  isRecording,
  isAnalyzing,
  disabled,
  goToPreviousResult,
  hasPreviousResult,
  goToNextResult,
  hasNextResult,
  // MachineResponse相关参数
  machineResponseValue,
  onMachineResponseChange,
  onMachineResponseSubmit,
  currentSampleText,
  error,
}: ProgressBarProps) {
  const currentTask = useAppSelector(selectCurrentTask);
  const wakeWords = useAppSelector(selectWakeWords);
  const samples = useAppSelector(selectAllSamples);
  const [testStatus, setTestStatus] = useState<
    "idle" | "running" | "paused" | "finished"
  >("idle");

  // 本地唤醒词状态 - 直接从Tauri获取
  const [localWakeWords, setLocalWakeWords] = useState<WakeWord[]>([]);
  const [isLoadingWakeWords, setIsLoadingWakeWords] = useState(false);

  // 唤醒词选择状态
  const [selectedWakeWordId, setSelectedWakeWordId] = useState<number | undefined>(undefined);

  // Analysis Results 相关状态
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  // 唤醒检测结果状态
  const [testResults, setTestResults] = useState<WakeDetectionResult[]>([]);
  const [workflowStats, setWorkflowStats] = useState<WorkflowStats | null>(null);
  
  // 计算工作流统计信息
  useEffect(() => {
    if (testResults.length > 0) {
      const total_tests = testResults.length;
      const success_count = testResults.filter(r => r.success).length;
      const success_rate = total_tests > 0 ? success_count / total_tests : 0.0;
      const total_duration_ms = testResults.reduce((sum, r) => sum + r.duration_ms, 0);
      const avg_duration_ms = total_tests > 0 ? total_duration_ms / total_tests : 0;
      
      setWorkflowStats({
        total_tests,
        success_count,
        success_rate,
        total_duration_ms,
        avg_duration_ms
      });
    } else {
      setWorkflowStats(null);
    }
  }, [testResults]);

  const { toast } = useToast();

  // 加载唤醒词 - 直接从Tauri获取
  useEffect(() => {
    const loadWakeWords = async () => {
      try {
        setIsLoadingWakeWords(true);
        const fetchedWakeWords = await invoke<WakeWord[]>('get_all_wake_words');
        setLocalWakeWords(fetchedWakeWords);
        console.log('从Tauri获取的唤醒词:', fetchedWakeWords);
      } catch (err) {
        console.error("Failed to fetch wake words:", err);
        toast({
          variant: "destructive",
          title: "获取唤醒词失败",
          description: "无法从后端加载唤醒词列表。",
        });
      } finally {
        setIsLoadingWakeWords(false);
      }
    };
    loadWakeWords();
  }, [toast]);

  // 获取当前任务的唤醒词
  const taskWakeWords = localWakeWords.filter(ww => 
    currentTask?.wake_word_ids?.includes(ww.id)
  );

  // 调试信息
  console.log('当前任务:', currentTask);
  console.log('从Tauri获取的唤醒词:', localWakeWords);
  console.log('当前任务的唤醒词ID列表:', currentTask?.wake_word_ids);
  console.log('过滤后的任务唤醒词:', taskWakeWords);

  // 当任务变化时，自动选择第一个唤醒词
  useEffect(() => {
    if (taskWakeWords.length > 0 && !selectedWakeWordId) {
      setSelectedWakeWordId(taskWakeWords[0].id);
    }
  }, [taskWakeWords, selectedWakeWordId]);

  // ===== MachineResponse 相关状态和逻辑 =====
  const [backendMessage, setBackendMessage] = useState("");
  const [asrEvent, setAsrEvent] = useState("");
  
  // 进度相关状态
  const [detailedProgress, setDetailedProgress] = useState<TaskProgress>({
    value: 0,
    current_sample: 0,
    total: 0,
  });

  // ASR事件监听
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let unlistenevent: UnlistenFn | undefined;
    let isMounted = true;
    
    const setupASRListeners = async () => {
      if (!isMounted) return;
      
      try {
        unlisten = await listen("asr_intermediate_result", (event) => {
          if (!isMounted) return;
          console.log("React Component 收到 asr_intermediate_result", event.payload);
          const text = event.payload as string;
          setBackendMessage(text);
          onMachineResponseChange(text); // 同步到外部状态
        });
        
        unlistenevent = await listen("asr_event", (event) => {
          if (!isMounted) return;
          console.log("React Component 收到 asr_event:", event.payload);
          setAsrEvent(
            typeof event.payload === "string"
              ? event.payload
              : JSON.stringify(event.payload)
          );
        });
      } catch (error) {
        console.error("监听ASR事件失败:", error);
      }
    };

    setupASRListeners();

    return () => {
      isMounted = false;
      if (unlisten) {
        try {
          unlisten();
          console.log("已取消监听 asr_intermediate_result");
        } catch (error) {
          console.error("取消监听失败:", error);
        }
      }
      if (unlistenevent) {
        try {
          unlistenevent();
          console.log("已取消监听 asr_event");
        } catch (error) {
          console.error("取消监听失败:", error);
        }
      }
    };
  }, [onMachineResponseChange]);

  // 原来的进度和工作流事件监听
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let unlistenprogress: UnlistenFn | undefined;
    let isMounted = true;
    
    const setupListeners = async () => {
      if (!isMounted) return;
      
      try {
        unlisten = await listen("workflow_event", (event) => {
          if (!isMounted) return;
          console.log("React Component 收到 workflow_event:", event.payload);
          // setBackendMessage 已经移到ASR事件中处理
        });
      } catch (error) {
        console.error("监听 workflow_event 失败:", error);
      }
      try {
        unlistenprogress = await listen("progress_update", (event) => {
          if (!isMounted) return;
          console.log("React Component 收到 progress_update:", event.payload);
          if (
            typeof event.payload === "object" &&
            event.payload !== null &&
            "value" in event.payload &&
            "current_sample" in event.payload &&
            "total" in event.payload
          ) {
            setDetailedProgress(event.payload as TaskProgress);
          }
        });
      } catch (error) {
        console.error("监听 progress_update 失败:", error);
      }
    };

    setupListeners();

    return () => {
      isMounted = false;
      if (unlisten) {
        try {
          unlisten();
        } catch (error) {
          console.error("取消监听失败:", error);
        }
      }
      if (unlistenprogress) {
        try {
          unlistenprogress();
        } catch (error) {
          console.error("取消监听失败:", error);
        }
      }
    };
  }, []);

  // Analysis Results 事件监听
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let unlistenevent: UnlistenFn | undefined;
    let isMounted = true;
    
    const setupListeners = async () => {
      if (!isMounted) return;
      
      try {
        unlisten = await listen<AnalysisResult>("llm_analysis_result", (event) => {
          if (!isMounted) return;
          console.log("React Component 收到 llm_analysis_result:", event.payload);
          setResult(event.payload);
          setLoading(false);
        });
      } catch (error) {
        console.error("监听 llm_analysis_result 失败:", error);
      }

      try {
        unlistenevent = await listen("llm_analysis_event", (event) => {
          if (!isMounted) return;
          console.log("React Component 收到 llm_analysis_event:", event.payload);
          event.payload === "start" && setLoading(true);
        });
      } catch (error) {
        console.error("监听 llm_analysis_event 失败:", error);
      }
    };
    
    setupListeners();

    return () => {
      isMounted = false;
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
  }, []);

  // 唤醒检测结果事件监听
  useEffect(() => {
    let unlistenTestResult: UnlistenFn | undefined;
    let isMounted = true;
    
    const setupWakeDetectionListeners = async () => {
      if (!isMounted) return;
      
      try {
        // 监听测试结果（使用 wake_detection_result 事件）
        unlistenTestResult = await listen<WakeDetectionResult>('wake_detection_result', (event) => {
          if (!isMounted) return;
          console.log('收到唤醒检测结果:', event.payload);
          
          // 检查是否已存在相同的结果
          const existingResult = testResults.find(r => 
            r.task_id === event.payload.task_id && 
            r.test_index === event.payload.test_index
          );
          
          if (!existingResult) {
            setTestResults(prev => [event.payload, ...prev]);
          } else {
            console.log('结果已存在，跳过重复添加');
          }
        });
      } catch (error) {
        console.error("监听唤醒检测事件失败:", error);
      }
    };

    setupWakeDetectionListeners();

    return () => {
      isMounted = false;
      if (unlistenTestResult) {
        try {
          unlistenTestResult();
        } catch (error) {
          console.error("取消监听失败:", error);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (backendMessage == "workflow finished") {
      setTestStatus("finished");
    }
  }, [backendMessage]);

  function handleStop() {
    // 停止任务
    tauriStopWorkflow();
    setTestStatus("finished");
  }

  function handlePause() {
    // 暂停任务
    tauriPauseWorkflow();
    setTestStatus("paused");
  }

  function handleResume() {
    // 恢复任务
    tauriResumeWorkflow();
    setTestStatus("running");
  }

  // 包装的启动测试函数
  const handleStartTestWithConfig = () => {
    // 获取OCR组件中的视觉检测模板数据
    // 这里我们需要从OCR组件获取模板数据
    // 由于OCR组件在同一个页面，我们可以通过window或某种状态管理获取
    onStartAutomatedTest(selectedWakeWordId, visualWakeConfig.templateData, visualWakeConfig.frameRate, visualWakeConfig.threshold, visualWakeConfig.maxDetectionTime);
  };

  // 清空唤醒检测结果
  const clearWakeDetectionResults = () => {
    setTestResults([]);
    setWorkflowStats(null);
    toast({
      title: "已清空唤醒检测结果",
      description: "所有唤醒检测测试结果已清除",
      variant: "default",
    });
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
    <Card className="shadow-sm rounded-lg h-full flex flex-col max-h-full overflow-hidden">
      <CardHeader className="bg-white p-4 rounded-t-lg flex justify-between space-y-0 border-b flex-shrink-0">
        <CardTitle className="text-2xl font-semibold text-gray-800 dark:text-gray-100">
          {currentTask?.name
            ? currentTask?.name
            : "请在任务列表中选择一个测试任务"}
        </CardTitle>
        <CardDescription className="text-gray-500 dark:text-gray-400 pt-1">
          {currentTask?.name ? currentTask?.name : "当前没有被选中的测试任务"}
        </CardDescription>
        </CardHeader>
      <CardContent className="p-4 flex-1 flex flex-col min-h-0 overflow-y-auto space-y-4">
        {/* 控制按钮 */}
        <div className="flex flex-row gap-2">
          <Button
            onClick={() => {
              if (testStatus === "running") {
                handlePause();
                setTestStatus("paused");
              } else if (testStatus === "paused") {
                handleResume();
                setTestStatus("running");
              } else {
                handleStartTestWithConfig();
                setTestStatus("running");
              }
            }}
            disabled={currentTask === null}
            className="col-span-2 col-start-4 gap-2 bg-blue-700 hover:bg-blue-500 w-full"
            variant="default"
          >
            {testStatus === "running" ? (
              <>
                <Pause className="h-4 w-4" />
                暂停任务
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                {testStatus === "paused" ? "恢复任务" : "开始任务"}
              </>
            )}
          </Button>
          <Button
            onClick={handleStop}
            disabled={testStatus === "finished"}
            className="col-span-2 col-start-4 gap-2 w-full"
            variant="destructive"
          >
            停止任务
          </Button>
        </div>
        {/* 唤醒词选择 */}
        <div className="space-y-2">
          <Label>选择唤醒词</Label>
          {isLoadingWakeWords ? (
            <div className="p-3 bg-gray-50 rounded-md border border-dashed">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                <p className="text-sm text-gray-500">加载唤醒词中...</p>
              </div>
            </div>
          ) : taskWakeWords.length > 0 ? (
            <Select value={selectedWakeWordId?.toString()} onValueChange={(value) => setSelectedWakeWordId(Number(value))}>
              <SelectTrigger>
                <SelectValue placeholder="请选择唤醒词" />
              </SelectTrigger>
              <SelectContent>
                {taskWakeWords.map((wakeWord) => (
                  <SelectItem key={wakeWord.id} value={wakeWord.id.toString()}>
                    {wakeWord.text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="p-3 bg-gray-50 rounded-md border border-dashed">
              <p className="text-sm text-gray-500 text-center">
                {currentTask ? "当前任务没有配置唤醒词" : "请先选择一个任务"}
              </p>
            </div>
          )}
          {taskWakeWords.length === 0 && currentTask && !isLoadingWakeWords && (
            <p className="text-xs text-red-500">
              请在任务管理中为任务添加唤醒词
            </p>
          )}
        </div>

        {/* 进度显示 */}
        <div className="space-y-2">
          <Progress value={detailedProgress.value} className="h-3" />
          <div className="flex justify-between">
            <p className="text-sm text-muted-foreground py-1">
              {detailedProgress.value}%
            </p>
            <p className="text-sm text-muted-foreground py-1">
              {detailedProgress.total > 0
                ? `正在测试第${detailedProgress?.current_sample}个，共${samplelength}个样本`
                : `任务包含${samplelength}个样本，将自动依次处理`}
            </p>
          </div>
        </div>

        {/* 唤醒检测结果 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="font-medium flex items-center gap-2">
              唤醒检测结果
            </Label>
            {(testResults.length > 0 || workflowStats) && (
              <Button
                onClick={clearWakeDetectionResults}
                variant="outline"
                size="sm"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                清空结果
              </Button>
            )}
          </div>
          
          {/* 统计信息 */}
          {workflowStats && (
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-green-50 rounded-md text-center">
                <div className="text-lg font-bold text-green-600">
                  {workflowStats.success_count}
                </div>
                <div className="text-xs text-green-600">成功次数</div>
              </div>
              <div className="p-2 bg-blue-50 rounded-md text-center">
                <div className="text-lg font-bold text-blue-600">
                  {(workflowStats.success_rate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-blue-600">成功率</div>
              </div>
            </div>
          )}
          
          {/* 测试结果列表 */}
          {testResults.length > 0 ? (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {testResults.map((result, index) => (
                <div
                  key={`${result.task_id}-${result.test_index || 0}`} // 使用 task_id 和 test_index 作为唯一标识符
                  className={`flex items-center justify-between p-2 rounded text-sm ${result.success
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span>
                      {result.wake_word_text ? `${result.wake_word_text} (样本${result.test_index})` : `唤醒检测 ${result.test_index || '1'}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span>{result.duration_ms}ms</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">暂无唤醒检测结果</p>
              <p className="text-xs text-gray-400">
                开始任务后查看唤醒检测结果
              </p>
            </div>
          )}
        </div>

        {/* 车机响应显示区域 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">车机响应</Label>
              {/* 小的录音状态图标 */}
              {asrEvent === "started" && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-muted-foreground">录音中</span>
                </div>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              {currentSampleText || "等待测试指令..."}
            </Badge>
          </div>
          
          {/* 显示识别结果 */}
          <div className="w-full">
            {backendMessage ? (
              <div className="p-3 bg-gray-50 rounded-md border">
                <p className="text-xs text-gray-600 mb-1">识别结果：</p>
                <p className="text-sm font-medium">{backendMessage}</p>
              </div>
            ) : asrEvent === "started" ? (
              <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                  <p className="text-xs text-blue-600">正在识别语音...</p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-gray-50 rounded-md border border-dashed">
                <p className="text-xs text-gray-500 text-center">
                  等待车机响应识别结果...
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 结果判定部分 */}
        <div className="space-y-2">
          <Label className="font-bold text-primary flex items-center text-sm">
            大模型评估结果
          </Label>

          {loading ? (
            <div className="flex justify-center items-center py-3">
              <Skeleton className="h-12 w-24" />
            </div>
          ) : error ? (
            <div className="flex justify-center items-center py-3">
              <div className="bg-gray-50 px-4 py-2 rounded-lg">
                <span className="text-muted-foreground text-sm">错误: {error}</span>
              </div>
            </div>
          ) : !result?.assessment ? (
            <div className="flex justify-center items-center py-3">
              <div className="bg-gray-50 px-4 py-2 rounded-lg">
                <span className="text-muted-foreground text-sm">等待分析</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center py-3">
              <div
                className={`bg-card px-4 py-2 rounded-lg border shadow-sm ${
                  result.assessment.valid
                    ? "border-green-500 border-opacity-30"
                    : "border-destructive border-opacity-30"
                }`}
              >
                <div className="flex items-center">
                  {result.assessment.valid ? (
                    <CheckCircle className="h-6 w-6 text-green-600 mr-2" />
                  ) : (
                    <XCircle className="h-6 w-6 text-destructive mr-2" />
                  )}
                  <span
                    className={`text-2xl font-bold ${
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

        {/* 评估详情部分 */}
        <div className="space-y-2">
          <Label className="font-bold text-primary flex items-center text-sm">
            大模型评估详情
          </Label>

          {loading ? (
            <div className="space-y-2 bg-muted/30 p-3 rounded-lg shadow-sm border">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : error || !result ? (
            <div className="bg-muted/30 p-3 rounded-lg shadow-sm">
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <p className="text-muted-foreground text-sm">
                  请选择测试语料并提交车机响应进行分析
                </p>
                {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
              </div>
            </div>
          ) : (
            <div className="bg-muted/30 p-3 rounded-lg shadow-sm border space-y-2">
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
                  <div className="mt-2 pt-2 border-t border-border">
                    <div className="flex items-center text-amber-600 mb-1">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      <span className="font-medium text-xs">改进建议</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-1">
                      {result.assessment.suggestions.map(
                        (suggestion, index) => (
                          <li
                            key={index}
                            className="text-xs text-muted-foreground"
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
