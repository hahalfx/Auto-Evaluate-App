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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useEffect, useCallback } from "react"; // Added useCallback
import { useTauriTasks } from "@/hooks/useTauriTasks"; // New hook
import { useAppDispatch, useAppSelector } from "@/store/hooks"; // Keep for samplesSlice if still needed
// Remove taskSlice imports for tasks, currentTask, status, update, delete
// Keep for samplesSlice if still needed
import {
  selectAllSamples,
  fetchSamples,
  selectSamplesStatus,
  setSelectedSamples,
  selectWakeWords,
  fetchWakeWords,
} from "@/store/samplesSlice";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExportCurrentTask } from "@/hooks/useExportCurrentTask";
import { useToast } from "./ui/use-toast";
import { useActiveTasks } from "@/lib/contexts/active-tasks-context";
import CreateTask from "@/components/create-task";

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
  const dispatch = useAppDispatch(); // Keep for samplesSlice
  const samples = useAppSelector(selectAllSamples);
  const samplesStatus = useAppSelector(selectSamplesStatus);
  const { playMatchedAudio } = useAudioPlayer();
  const router = useRouter();
  const { exportCurrentTask: exportTaskHook } = useExportCurrentTask(); // Renamed to avoid conflict
  const { toast } = useToast();
  const { addActiveTask, isTaskActive } = useActiveTasks();
  const wakeWords = useAppSelector(selectWakeWords); // Assuming this comes from samplesSlice or another slice

  const handleExportReport = () => {
    currentTask
      ? exportTaskHook() // Use renamed hook
      : toast({
          variant: "destructive",
          title: "无当前任务",
          description: "请先选择一个任务再导出报告。",
        });
  };

  // 处理开始任务 (now uses updateTaskStatus from useTauriTasks)
  const handleStartTask = async (taskId: number) => {
    setIsDetailDialogOpen(false);
    // setSelectedSamples might still be relevant if it's for UI state not directly tied to task data
    if (currentTask) {
      dispatch(setSelectedSamples(currentTask.test_samples_ids || []));
      await updateTaskStatus(taskId, "in_progress");
    }
    router.push("/llm-analysis/" + taskId);
  };

  useEffect(() => {
    if (isDetailDialogOpen === false) {
      setCurrentTask(null); // Use setCurrentTask from useTauriTasks
    }
  }, [isDetailDialogOpen, setCurrentTask]);

  // 获取任务数据 - Handled by useTauriTasks's own useEffect
  // useEffect(() => {
  // fetchAllTasks(); // Called initially by the hook
  // }, [fetchAllTasks]);

  // 获取测试语料数据 (Keep this if samples/wakeWords are separate)
  useEffect(() => {
    if (
      samplesStatus === "idle" &&
      samples.length === 0 &&
      wakeWords.length === 0
    ) {
      dispatch(fetchSamples());
      dispatch(fetchWakeWords());
    }
  }, [dispatch, samplesStatus, samples.length, wakeWords.length]);

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
    const mappedTasks = filteredTasks.map((task) => ({
      id: task.id,
      name: task.name,
      similarity: Math.round(Math.random() * 30 + 70), // 示例数据，实际应该从task中计算
      status: task.task_status,
      timestamp: task.created_at, // 示例时间戳，实际应该从task中获取
    }));

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
                  <Link href="/taskmanage/create-task">
                    <Button>创建第一个任务</Button>
                  </Link>
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
                          className="flex h-24 bg-white items-center justify-between p-5 border rounded-xl hover:bg-accent cursor-pointer transition-all duration-300 ease-in-out"
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
                  <p className="text-sm font-medium">唤醒词</p>
                  {/* Ensure wakeWords and currentTask.wake_word_id are valid before accessing */}
                  <Badge variant="outline">
                    {wakeWords && wakeWords[currentTask.wake_word_id - 1]
                      ? wakeWords[currentTask.wake_word_id - 1].text
                      : "N/A"}
                  </Badge>
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-8 h-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                playMatchedAudio(sample.text);
                              }}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
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
                              <div className="flex justify-between items-center mb-1">
                                <p className="font-medium">
                                  {
                                    samples.find(
                                      (TestSample) =>
                                        TestSample.id === Number(sampleId)
                                    )?.text
                                  }
                                </p>
                                <div
                                  className={`px-2 py-1 rounded-full text-xs ${
                                    result.assessment.valid
                                      ? "bg-green-100 text-green-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {result.assessment.valid ? "通过" : "未通过"}
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground mb-1">
                                <p>测试时间：{result.test_time}</p>
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

                  <Button variant="secondary" onClick={handleExportReport}>
                    导出报告
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
              <CreateTask />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
