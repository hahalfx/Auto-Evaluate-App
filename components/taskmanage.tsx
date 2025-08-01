"use client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Ellipsis,
  Loader2,
  Play,
  ArrowUpDown,
  Filter,
  BarChart3,
  CheckCircle2,
  Clock,
  PlayCircle,
  Plus,
  CircleCheck,
  MessageSquare,
  Timer,
  ClipboardCheck,
  Volume2,
  FileAudio,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect, useCallback } from "react"; // Added useCallback
import { useTauriTasks } from "@/hooks/useTauriTasks"; // New hook
import { useAppSelector } from "@/store/hooks"; // Keep for samplesSlice if still needed
// Remove taskSlice imports for tasks, currentTask, status, update, delete
// Keep for samplesSlice if still needed
import {
  fetchSamples,
  selectSamplesStatus,
} from "@/store/samplesSlice";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExportTaskReport } from "@/hooks/useExportTaskReport";
import { useExportWakeDetectionResults } from "@/hooks/useExportWakeDetectionResults";
import { useSampleSelection } from "@/lib/contexts/sample-selection-context";
import { useToast } from "./ui/use-toast";
import { useActiveTasks } from "@/lib/contexts/active-tasks-context";
import CreateTask from "@/components/create-task";
import { useTauriSamples } from "@/hooks/useTauriSamples";
import { useTauriWakewords } from "@/hooks/useTauriWakewords";
import { useTimingData } from "@/hooks/useTimingData";
import { TimingDataDisplay } from "@/components/timing-data-display";
import { TauriAudioApiService } from "@/services/tauri-audio-api";
import { useWakeDetectionResults } from "@/hooks/useWakeDetectionResults";

// 定义排序类型
type SortType =
  | "id-asc"
  | "id-desc"
  | "similarity-asc"
  | "similarity-desc"
  | "time-asc"
  | "time-desc";
// 定义筛选类型
type FilterType = "all" | "completed" | "failed" | "in_progress" | "pending";

const timingKeyMap: { [key: string]: string } = {
  voiceCommandStartTime: "语音指令开始时间",
  firstCharAppearTime: "首字上屏时间",
  voiceCommandEndTime: "语音指令结束时间",
  fullTextAppearTime: "全量上屏时间",
  actionStartTime: "动作开始时间",
  ttsFirstFrameTime: "TTS首帧时间",
  voiceRecognitionTimeMs: "语音识别耗时",
  interactionResponseTimeMs: "交互响应耗时",
  ttsResponseTimeMs: "TTS响应耗时",
};

const formatDateTime = (dateString: string | null) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
};

export default function TaskManage() {
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [sortType, setSortType] = useState<SortType>("id-desc");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const {
    tasks,
    currentTask,
    isLoading: tasksLoading, // Renamed to avoid conflict if samples also have isLoading
    error: tasksError,
    fetchAllTasks,
    // fetchTaskById, // Not used directly in this component yet
    // createTask, // For create task page
    updateTaskStatus,
    deleteTask,
    setCurrentTask,
  } = useTauriTasks();
  const samplesStatus = useAppSelector(selectSamplesStatus);
  const { playMatchedAudio } = useAudioPlayer();
  const router = useRouter();
  const { exportReport, isExporting } = useExportTaskReport();
  const { exportWakeDetectionResults, isExporting: isExportingWakeDetection } = useExportWakeDetectionResults();
  const { toast } = useToast();
  const { addActiveTask, isTaskActive } = useActiveTasks();
  const { wakewords } = useTauriWakewords();
  const { samples } = useTauriSamples();
  const { setSelectedIds } = useSampleSelection();
  const { timingData } = useTimingData(currentTask?.id);
  const { results: wakeDetectionResults, stats: wakeDetectionStats, isLoading: wakeDetectionLoading } = useWakeDetectionResults(currentTask?.id);

  const handleExportReport = async () => {
    await exportReport(currentTask, samples, wakewords);
  };

  const handleExportWakeDetectionResults = async () => {
    if (currentTask) {
      await exportWakeDetectionResults(currentTask.name, wakeDetectionResults, wakewords);
    }
  };

  // 处理开始任务 (now uses updateTaskStatus from useTauriTasks)
  const handleStartTask = async (taskId: number) => {
    setIsDetailDialogOpen(false);
    // setSelectedSamples might still be relevant if it's for UI state not directly tied to task data
    if (currentTask) {
      setSelectedIds(currentTask.test_samples_ids || []);
      await updateTaskStatus(taskId, "in_progress");
    }
    router.push("/llm-analysis/" + taskId);
  };

  useEffect(() => {
    if (isDetailDialogOpen === false) {
      setCurrentTask(null); // Use setCurrentTask from useTauriTasks
    }
  }, [isDetailDialogOpen, setCurrentTask]);

  // // 获取测试语料数据 (Keep this if samples/wakeWords are separate)
  // useEffect(() => {
  //   if (
  //     samplesStatus === "idle" &&
  //     samples.length === 0 &&
  //     wakeWords.length === 0
  //   ) {
  //     dispatch(fetchSamples());
  //     dispatch(fetchWakeWords());
  //   }
  // }, [dispatch, samplesStatus, samples.length, wakeWords.length]);

  // 处理排序
  const handleSort = (type: SortType) => {
    setSortType(type);
  };

  // 处理筛选
  const handleFilter = (type: FilterType) => {
    setFilterType(type);
  };

  // 计算统计数据
  const stats = {
    totalVerifications: Array.isArray(tasks) ? tasks.length : 0,
    successRate:
      Array.isArray(tasks) && tasks.length > 0
        ? Math.round(
            (tasks.filter((task) => task.task_status === "completed").length /
              tasks.length) *
              100
          )
        : 0,
    averageSimilarity: 76, // 这个可以根据实际数据计算
  };

  // 处理筛选和排序
  const getFilteredAndSortedTasks = () => {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return [];
    }

    // 首先进行筛选
    let filteredTasks = [...tasks];
    if (filterType !== "all") {
      filteredTasks = filteredTasks.filter(
        (task) => task.task_status === filterType
      );
    }

    // 将筛选后的任务映射为显示所需的格式
    const mappedTasks = filteredTasks.map((task) => {
      const results = Object.values(task.test_result || {});
      const successful = results.filter((r: any) => r.assessment.valid).length;
      const total = results.length;
      const similarity = total > 0 ? Math.round((successful / total) * 100) : 0;

      return {
        id: task.id,
        name: task.name,
        similarity: similarity, // 使用计算出的成功率
        status: task.task_status,
        timestamp: task.created_at, // 示例时间戳，实际应该从task中获取
      };
    });

    // 然后进行排序
    return mappedTasks.sort((a, b) => {
      switch (sortType) {
        case "id-asc":
          return a.id - b.id;
        case "id-desc":
          return b.id - a.id;
        case "similarity-asc":
          return a.similarity - b.similarity;
        case "similarity-desc":
          return b.similarity - a.similarity;
        case "time-asc":
          return (
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        case "time-desc":
          return (
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        default:
          return b.id - a.id;
      }
    });
  };

  // 获取筛选和排序后的任务列表
  const filteredAndSortedTasks = getFilteredAndSortedTasks();

  // 统计数据
  const taskStats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.task_status === "pending").length,
    inProgress: tasks.filter((t) => t.task_status === "in_progress").length,
    completed: tasks.filter((t) => t.task_status === "completed").length,
  };

  // 处理执行任务
  const handleExecuteTask = (task: any) => {
    addActiveTask({
      id: task.id,
      name: task.name,
      type: task.type,
    });
  };

  // 处理任务创建完成
  const handleTaskCreated = async (taskId: number) => {
    // 关闭创建任务对话框
    setIsCreateDialogOpen(false);
    
    // 重置筛选条件为"全部"，确保新任务能够显示
    setFilterType("all");
    
    // 刷新任务列表
    await fetchAllTasks();
    
    // 添加小延迟确保数据刷新完成
    setTimeout(() => {
      // 显示成功提示
      toast({
        title: "任务创建成功",
        description: `任务 #${taskId} 已创建并添加到任务列表中`,
      });
    }, 100);
  };

  return (
    <div>
      <div className="h-full bg-background p-8">
        <div className="w-full mx-auto gap-4">
          <div className="space-y-4 pb-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">
                  测试任务管理
                </h2>
                <p className="text-muted-foreground">
                  创建、编辑和管理测试任务，查看任务执行状态和结果。
                </p>
              </div>
            </div>

            {/* 统计卡片 */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card
                className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800 cursor-pointer"
                onClick={() => handleFilter("all")}
              >
                <CardHeader className="pb-2">
                  <CardDescription>总任务数</CardDescription>
                  <CardTitle className="text-3xl">{taskStats.total}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-blue-600 dark:text-blue-400">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    <span className="text-sm font-medium">全部测试任务</span>
                  </div>
                </CardContent>
              </Card>

              <Card
                className="hover:bg-amber-50 transition-all duration-300 ease-in-out cursor-pointer"
                onClick={() => handleFilter("pending")}
              >
                <CardHeader className="pb-2">
                  <CardDescription>待执行</CardDescription>
                  <CardTitle className="text-3xl">
                    {taskStats.pending}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-amber-600 dark:text-amber-400">
                    <Clock className="mr-2 h-4 w-4" />
                    <span className="text-sm font-medium">等待开始的任务</span>
                  </div>
                </CardContent>
              </Card>

              <Card
                className="hover:bg-indigo-50 transition-all duration-300 ease-in-out cursor-pointer"
                onClick={() => handleFilter("in_progress")}
              >
                <CardHeader className="pb-2">
                  <CardDescription>进行中</CardDescription>
                  <CardTitle className="text-3xl">
                    {taskStats.inProgress}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-indigo-600 dark:text-indigo-400">
                    <PlayCircle className="mr-2 h-4 w-4" />
                    <span className="text-sm font-medium">正在执行的任务</span>
                  </div>
                </CardContent>
              </Card>

              <Card
                className="hover:bg-emerald-50 transition-all duration-300 ease-in-out cursor-pointer"
                onClick={() => handleFilter("completed")}
              >
                <CardHeader className="pb-2">
                  <CardDescription>已完成</CardDescription>
                  <CardTitle className="text-3xl">
                    {taskStats.completed}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    <span className="text-sm font-medium">已完成的任务</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 最近验证任务 */}
          <Card className="bg-background">
            <CardHeader className="flex flex-row items-center justify-between px-6 py-4">
              <CardTitle>所有任务</CardTitle>
              <div className="flex space-x-1">
                {/* 筛选下拉菜单 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center"
                    >
                      <Filter className="h-4 w-4 mr-1" />
                      {filterType !== "all" && (
                        <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5">
                          1
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>按状态筛选</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleFilter("all")}>
                      全部
                      {filterType === "all" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilter("completed")}>
                      已完成
                      {filterType === "completed" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleFilter("in_progress")}
                    >
                      进行中
                      {filterType === "in_progress" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilter("failed")}>
                      失败
                      {filterType === "failed" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilter("pending")}>
                      待处理
                      {filterType === "pending" && " ✓"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* 排序下拉菜单 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center"
                    >
                      <ArrowUpDown className="h-4 w-4 mr-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>排序方式</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleSort("id-desc")}>
                      ID (降序)
                      {sortType === "id-desc" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSort("id-asc")}>
                      ID (升序)
                      {sortType === "id-asc" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleSort("similarity-desc")}
                    >
                      成功率 (高到低)
                      {sortType === "similarity-desc" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleSort("similarity-asc")}
                    >
                      成功率 (低到高)
                      {sortType === "similarity-asc" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleSort("time-desc")}>
                      时间 (最新优先)
                      {sortType === "time-desc" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSort("time-asc")}>
                      时间 (最早优先)
                      {sortType === "time-asc" && " ✓"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
                  创建新任务
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2">加载任务中...</span>
                </div>
              ) : !Array.isArray(tasks) || !tasks || tasks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">暂无任务数据</p>
                </div>
              ) : (
                <div>
                  <div className="mb-1 flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      {filterType !== "all"
                        ? `显示 ${filteredAndSortedTasks.length} 个${
                            filterType === "completed"
                              ? "已完成"
                              : filterType === "in_progress"
                              ? "进行中"
                              : filterType === "failed"
                              ? "失败"
                              : "待处理"
                          }任务`
                        : `共 ${filteredAndSortedTasks.length} 个任务`}
                    </p>
                    {filterType !== "all" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFilterType("all")}
                        className="text-xs"
                      >
                        清除筛选
                      </Button>
                    )}
                  </div>

                  {filteredAndSortedTasks.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">
                        没有符合条件的任务
                      </p>
                      <Button onClick={() => setFilterType("all")}>
                        显示所有任务
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredAndSortedTasks.map((result) => (
                        <div
                          key={result.id}
                          className="flex h-24 bg-white items-center justify-between p-5 border rounded-xl hover:bg-accent hover:shadow-lg hover:scale-102 cursor-pointer transition-all duration-200 ease-in-out"
                          onClick={() => {
                            const task = tasks.find((t) => t.id === result.id);
                            if (task) {
                              setCurrentTask(task); // Use setCurrentTask from hook
                              setIsDetailDialogOpen(true);
                            }
                          }}
                        >
                          <div className="flex items-center space-x-4">
                            <CircleCheck
                              color={
                                result.status === "completed"
                                  ? "green"
                                  : result.status === "failed"
                                  ? "red"
                                  : result.status === "in_progress"
                                  ? "blue"
                                  : "yellow"
                              }
                            />
                            <div>
                              <p className="font-medium">
                                {result.name || "任务#" + result.id}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {result.timestamp}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <p className="font-mono">{result.similarity}%</p>
                              <p className="text-xs text-muted-foreground">
                                成功率
                              </p>
                            </div>
                            <div
                              className={`px-3 py-1 rounded-full text-sm ${
                                result.status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : result.status === "failed"
                                  ? "bg-red-100 text-red-800"
                                  : result.status === "in_progress"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {result.status === "completed"
                                ? "完成"
                                : result.status === "failed"
                                ? "失败"
                                : result.status === "in_progress"
                                ? "进行中"
                                : "暂停"}
                            </div>
                            <div>
                              <DropdownMenu>
                                <DropdownMenuTrigger className="rounded-lg justify-items-center hover:bg-gray-100">
                                  <Ellipsis className="p-1" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuLabel>操作</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem>查看详情</DropdownMenuItem>
                                  <DropdownMenuItem>编辑任务</DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={async (e) => {
                                      // Make async
                                      e.stopPropagation(); // 阻止事件冒泡
                                      setIsDetailDialogOpen(false); // 显式设置对话框为关闭状态
                                      await deleteTask(result.id); // Use deleteTask from hook
                                      // Toast is now handled by the hook
                                      // toast({
                                      //   variant: "destructive",
                                      //   title: "任务删除成功",
                                      //   description:
                                      //     "任务" + result.name + "已被删除",
                                      //   duration: 3000,
                                      // });
                                      console.log("delete task", result.id);
                                    }}
                                  >
                                    删除任务
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[800px] overflow-auto p-9">
            <DialogHeader>
              <DialogTitle>任务详情</DialogTitle>
            </DialogHeader>
            {currentTask && (
              <div className="mt-4 space-y-4">
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
                  <p className="text-sm font-medium">唤醒词列表</p>
                  {currentTask.wake_word_ids.length > 0 ? (
                    <div className="border rounded-lg p-4 bg-gray-50/50 dark:bg-gray-800/30">
                      <ScrollArea className="w-full" style={{ height: '140px' }}>
                        <div className="space-y-2 pr-4">
                          {currentTask.wake_word_ids.map((wakeWordId) => {
                            const wakeWord = wakewords.find((w) => w.id === wakeWordId);
                            return (
                              <div
                                key={wakeWordId}
                                className="flex items-center justify-between p-3 bg-white dark:bg-gray-700/50 rounded-lg border shadow-sm hover:shadow-md transition-all duration-200 min-h-[56px]"
                              >
                                <div className="flex items-center space-x-3 flex-1 min-w-0">
                                  <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex-shrink-0">
                                    <Volume2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                      {wakeWord?.text || `唤醒词 #${wakeWordId}`}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      ID: {wakeWordId}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2 flex-shrink-0">
                                  {wakeWord?.audio_file && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // 这里可以添加播放唤醒词音频的功能
                                        console.log("播放唤醒词音频:", wakeWord.audio_file);
                                        if (wakeWord.audio_file) {
                                          TauriAudioApiService.playAudio(wakeWord.audio_file);
                                        }
                                      }}
                                    >
                                      <Play className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Badge variant="secondary" className="text-xs">
                                    {wakeWord?.audio_file ? "有音频" : "无音频"}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground">
                          共 {currentTask.wake_word_ids.length} 个唤醒词
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="text-center">
                        <FileAudio className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">暂无唤醒词</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ================= Wake Detection Results ================= */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">唤醒检测结果</p>
                    {wakeDetectionResults.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportWakeDetectionResults}
                        disabled={isExportingWakeDetection}
                      >
                        {isExportingWakeDetection ? "导出中..." : "导出唤醒结果"}
                      </Button>
                    )}
                  </div>
                  {wakeDetectionLoading ? (
                    <div className="flex justify-center items-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="ml-2">加载唤醒检测结果中...</span>
                    </div>
                  ) : wakeDetectionResults.length > 0 ? (
                    <div className="space-y-4">
                      {/* 详细结果列表 */}
                      <div className="border rounded-lg p-4 bg-gray-50/50 dark:bg-gray-800/30">
                        <ScrollArea className="w-full" style={{ height: '300px' }}>
                          <div className="space-y-2 pr-4">
                            {wakeDetectionResults.map((result, index) => {
                              const wakeWord = wakewords.find((w) => w.id === result.wake_word_id);
                              return (
                                <div
                                  key={index}
                                  className={`flex items-center justify-between p-4 rounded-lg border shadow-sm transition-all duration-200 ${
                                    result.success
                                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                  }`}
                                >
                                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                                    <div className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 ${
                                      result.success
                                        ? 'bg-green-100 dark:bg-green-900/30'
                                        : 'bg-red-100 dark:bg-red-900/30'
                                    }`}>
                                      {result.success ? (
                                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                      ) : (
                                        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-gray-900 dark:text-gray-100">
                                        {wakeWord?.text || `唤醒词 #${result.wake_word_id}`}
                                      </p>
                                      <div className="flex items-center space-x-4 text-xs text-muted-foreground mt-1">
                                        <span>置信度: {result.confidence?.toFixed(3) || 'N/A'}</span>
                                        <span>耗时: {result.success ? result.duration_ms : 'N/A'}ms</span>
                                        <span>时间: {new Date(result.timestamp).toLocaleString()}</span>
                                      </div>
                                      {/* 显示识别成功的判定依据 */}
                                      {result.success && (
                                        <div className="mt-2 text-xs">
                                          <span className="text-blue-600 dark:text-blue-400 font-medium">判定依据: </span>
                                          {result.asr_result ? (
                                            <span className="text-green-600 dark:text-green-400">
                                              ASR识别成功 - "{result.asr_result}"
                                            </span>
                                          ) : (
                                            <span className="text-gray-600 dark:text-gray-400">
                                              视觉检测成功
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2 flex-shrink-0">
                                    <Badge
                                      variant={result.success ? "default" : "destructive"}
                                      className="text-xs"
                                    >
                                      {result.success ? "成功" : "失败"}
                                    </Badge>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex justify-between items-center text-xs text-muted-foreground">
                            <span>平均置信度: {wakeDetectionStats.avgConfidence.toFixed(3)}</span>
                            <span>平均耗时: {wakeDetectionStats.avgDuration.toFixed(0)}ms</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="text-center">
                        <Volume2 className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">暂无唤醒检测结果</p>
                        <p className="text-xs text-gray-400">执行唤醒检测任务后将显示结果</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ================= Test Samples Overview ================= */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">测试语料概览</p>
                  <div className="border rounded-lg p-4 bg-gray-50/50 dark:bg-gray-800/30">
                    <ScrollArea className="w-full" style={{ height: '350px' }}>
                      <div className="space-y-2 pr-4">
                        {currentTask.test_samples_ids.map((sampleId) => {
                          const sample = samples.find((s) => s.id === sampleId);
                          const result = currentTask.test_result?.[sampleId];
                          
                          if (!sample) return null;
                          
                          return (
                            <div
                              key={sampleId}
                              className="flex items-center justify-between p-3 bg-white dark:bg-gray-700/50 rounded-lg border shadow-sm hover:shadow-md transition-all duration-200 min-h-[56px]"
                            >
                              <div className="flex items-center space-x-3 flex-1 min-w-0">
                                <div className="flex items-center justify-center w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex-shrink-0">
                                  <MessageSquare className="h-4 w-4 text-green-600 dark:text-green-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {sample.text}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    ID: {sampleId}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 flex-shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (sample.audio_file) {
                                      TauriAudioApiService.playAudio(sample.audio_file);
                                    }
                                  }}
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                                {result ? (
                                  <Badge
                                    variant={result.assessment.valid ? "default" : "destructive"}
                                    className="text-xs"
                                  >
                                    {result.assessment.valid ? "通过" : "未通过"}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    未测试
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-muted-foreground">
                        共 {currentTask.test_samples_ids.length} 个测试语料
                      </p>
                    </div>
                  </div>
                </div>

                {/* ================= Detailed Test Results ================= */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">详细测试结果</p>
                  <div className="border rounded-lg p-4 bg-gray-50/50 dark:bg-gray-800/30">
                    <ScrollArea className="w-full" style={{ height: '700px' }}>
                      <div className="space-y-4 pr-4">
                        {currentTask.test_samples_ids.map((sampleId) => {
                          const sample = samples.find((s) => s.id === sampleId);
                          const response = currentTask.machine_response?.[sampleId];
                          const result = currentTask.test_result?.[sampleId];
                          const timing = timingData?.[sampleId];

                          if (!sample) return null;

                          return (
                            <div
                              key={sampleId}
                              className="border rounded-xl p-4 bg-white dark:bg-gray-800/50 shadow-sm transition-all hover:shadow-lg hover:border-primary/30"
                            >
                          {/* Header: Sample Text and Play Button */}
                          <div className="flex justify-between items-center border-b pb-3 mb-4">
                            <div className="flex items-baseline">
                              <p className="font-bold text-xl text-primary dark:text-primary-foreground">
                                {sample.text}
                              </p>
                              <p className="text-xs text-muted-foreground ml-2">
                                (ID: {sampleId})
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-9 h-9 rounded-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                playMatchedAudio(sample.text);
                              }}
                            >
                              <Play className="h-5 w-5" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                            {/* Column 1, 2, 3: Test Result */}
                            {result ? (
                              <div className="md:col-span-3 space-y-4">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-semibold text-lg flex items-center">
                                    <ClipboardCheck className="h-5 w-5 mr-2 text-blue-500" />
                                    评估结果
                                  </h4>
                                  <Badge
                                    className={`text-sm ${
                                      result.assessment.valid
                                        ? "bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-300"
                                        : "bg-red-100 text-red-800 dark:bg-red-800/30 dark:text-red-300"
                                    }`}
                                  >
                                    {result.assessment.valid
                                      ? "通过"
                                      : "未通过"}
                                  </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-center">
                                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <p className="text-sm text-muted-foreground">
                                      语义正确性
                                    </p>
                                    <p className="font-mono font-bold text-xl">
                                      {result.assessment.semantic_correctness.score.toFixed(
                                        1
                                      )}
                                    </p>
                                  </div>
                                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <p className="text-sm text-muted-foreground">
                                      状态变更确认
                                    </p>
                                    <p className="font-mono font-bold text-xl">
                                      {result.assessment.state_change_confirmation.score.toFixed(
                                        1
                                      )}
                                    </p>
                                  </div>
                                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <p className="text-sm text-muted-foreground">
                                      表达无歧义
                                    </p>
                                    <p className="font-mono font-bold text-xl">
                                      {result.assessment.unambiguous_expression.score.toFixed(
                                        1
                                      )}
                                    </p>
                                  </div>
                                  <div className="p-3 bg-blue-50 dark:bg-blue-900/50 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <p className="text-sm text-blue-600 dark:text-blue-300">
                                      总分
                                    </p>
                                    <p className="font-mono font-bold text-2xl text-blue-700 dark:text-blue-400">
                                      {result.assessment.overall_score.toFixed(
                                        1
                                      )}
                                    </p>
                                  </div>
                                </div>

                                {result.assessment.suggestions.length > 0 && (
                                  <div className="pt-2">
                                    <h5 className="text-sm font-semibold text-muted-foreground mb-2">
                                      改进建议:
                                    </h5>
                                    <ul className="text-sm list-disc list-inside space-y-1.5 bg-amber-50/50 dark:bg-amber-900/20 p-3 rounded-md">
                                      {result.assessment.suggestions.map(
                                        (suggestion, idx) => (
                                          <li key={idx}>{suggestion}</li>
                                        )
                                      )}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="md:col-span-3 flex items-center justify-center bg-gray-50 dark:bg-gray-700/50 rounded-lg min-h-[150px]">
                                <p className="text-muted-foreground">
                                  无测试结果
                                </p>
                              </div>
                            )}

                            {/* Column 4, 5: Machine Response & Timing */}
                            <div className="md:col-span-2 space-y-4 border-l md:pl-6">
                              <div>
                                <h4 className="font-semibold text-lg flex items-center mb-2">
                                  <MessageSquare className="h-5 w-5 mr-2 text-indigo-500" />
                                  车机响应
                                </h4>
                                {response ? (
                                  <div className="flex items-start justify-between text-sm bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md">
                                    <p className="text-gray-800 dark:text-gray-200">
                                      {response.text}
                                    </p>
                                    <Badge
                                      variant={
                                        response.connected
                                          ? "default"
                                          : "destructive"
                                      }
                                      className="text-xs ml-2 flex-shrink-0"
                                    >
                                      {response.connected ? "已连接" : "未连接"}
                                    </Badge>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    无响应数据
                                  </p>
                                )}
                              </div>
                              <div>
                                <h4 className="font-semibold text-lg flex items-center mb-2">
                                  <Timer className="h-5 w-5 mr-2 text-orange-500" />
                                  时间参数
                                </h4>
                                {timing ? (
                                  <div className="space-y-2 text-sm bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md">
                                    {Object.entries(timing)
                                      .filter(
                                        ([, value]) =>
                                          value !== null && value !== undefined
                                      )
                                      .map(([key, value]) => {
                                        const displayName =
                                          timingKeyMap[key] || key;
                                        const displayValue =
                                          key.endsWith("Time") &&
                                          typeof value === "string"
                                            ? formatDateTime(value)
                                            : `${value} ms`;

                                        return (
                                          <div
                                            key={key}
                                            className="flex justify-between items-center"
                                          >
                                            <span className="text-muted-foreground">
                                              {displayName}:
                                            </span>
                                            <span className="font-mono text-xs">
                                              {displayValue}
                                            </span>
                                          </div>
                                        );
                                      })}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    无时间数据
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
                {/* ================= End of Unified Card ================= */}

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      // Make async
                      if (isDetailDialogOpen === true) {
                        setIsDetailDialogOpen(false);
                      }
                      if (currentTask) {
                        // Ensure currentTask is not null
                        await deleteTask(currentTask.id); // Use deleteTask from hook
                      }
                    }}
                    className="hover:text-red-500 hover:bg-white"
                  >
                    删除任务
                  </Button>

                  <Button 
                    variant="secondary" 
                    onClick={handleExportReport}
                    disabled={isExporting || !currentTask}
                  >
                    {isExporting ? "导出中..." : "导出报告"}
                  </Button>

                  {currentTask.task_status === "pending" && (
                    <Button
                      variant="default"
                      className="bg-blue-600 hover:bg-blue-700"
                      // onClick={() => handleStartTask(currentTask.id)}
                      onClick={() => handleExecuteTask(currentTask)}
                      disabled={isTaskActive(String(currentTask.id))}
                    >
                      开始任务
                    </Button>
                  )}
                </div>

              </div>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-6xl h-[800px] overflow-auto p-9">
            <DialogTitle>
              <div className="text-3xl font-bold mb-3">新建测试任务</div>
            </DialogTitle>
            <div className="flex">
              <CreateTask onTaskCreated={handleTaskCreated} isDialogOpen={isCreateDialogOpen} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
