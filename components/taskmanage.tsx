"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { SidebarTrigger } from "./ui/sidebar";
import { ChartComponent } from "./chartsample";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ellipsis, Loader2, Play, ArrowUpDown, Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchTasks,
  selectAllTasks,
  selectCurrentTask,
  setCurrentTask,
  selectTasksStatus,
  updateTaskAsync,
  deleteTaskAsync,
  setAutoStart,
} from "@/store/taskSlice";
import {
  selectAllSamples,
  fetchSamples,
  selectSamplesStatus,
  setSelectedSamples,
} from "@/store/samplesSlice";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generateASRTestReport } from "@/utils/generateASRTestReport";

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
  const [sortType, setSortType] = useState<SortType>("id-desc");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(selectAllTasks);
  const currentTask = useAppSelector(selectCurrentTask);
  const tasksStatus = useAppSelector(selectTasksStatus);
  const samples = useAppSelector(selectAllSamples);
  const samplesStatus = useAppSelector(selectSamplesStatus);
  const { playMatchedAudio } = useAudioPlayer();
  const router = useRouter();

  const handleExportReport = () => {
    if (!currentTask) {
      console.warn("No current task to export");
      return;
    }

    const now = new Date();
    const reportData: any = {
      taskName: currentTask.name || `任务#${currentTask.id}`,
      date: now.toLocaleString(),
      audioType: "",
      audioFile: "",
      audioDuration: "",
      audioCategory: "",
      testCollection: "",
      testDuration: "",
      sentenceAccuracy: 0,
      wordAccuracy: 0,
      characterErrorRate: 0,
      recognitionSuccessRate: 0,
      totalWords: 0,
      insertionErrors: 0,
      deletionErrors: 0,
      substitutionErrors: 0,
      fastestRecognitionTime: 0,
      slowestRecognitionTime: 0,
      averageRecognitionTime: 0,
      completedSamples: 0,
      items: [],
    };

    if (currentTask.test_result) {
      const items: any[] = [];
      let totalWords = 0;
      let insertionErrors = 0;
      let deletionErrors = 0;
      let substitutionErrors = 0;
      let recognitionTimes = [];
      let passedCount = 0;

      for (const [sampleId, result] of Object.entries(
        currentTask.test_result
      )) {
        const assessment = result.assessment;
        const item = {
          audioFile: "",
          recognitionFile: "",
          device: "",
          recognitionResult: "",
          insertionErrors: 0,
          deletionErrors: 0,
          substitutionErrors: 0,
          totalWords: 0,
          referenceText: "",
          recognizedText: "",
          resultStatus: assessment.valid ? "Success" : "Fail",
          recognitionTime: 0,
          testTime: "",
        };

        totalWords += item.totalWords;
        insertionErrors += item.insertionErrors;
        deletionErrors += item.deletionErrors;
        substitutionErrors += item.substitutionErrors;
        recognitionTimes.push(item.recognitionTime);
        if (assessment.valid) passedCount++;

        items.push(item);
      }

      reportData.items = items;
      reportData.totalWords = totalWords;
      reportData.insertionErrors = insertionErrors;
      reportData.deletionErrors = deletionErrors;
      reportData.substitutionErrors = substitutionErrors;
      reportData.completedSamples = items.length;
      reportData.recognitionSuccessRate =
        items.length > 0 ? passedCount / items.length : 0;
      reportData.fastestRecognitionTime =
        recognitionTimes.length > 0 ? Math.min(...recognitionTimes) : 0;
      reportData.slowestRecognitionTime =
        recognitionTimes.length > 0 ? Math.max(...recognitionTimes) : 0;
      reportData.averageRecognitionTime =
        recognitionTimes.length > 0
          ? recognitionTimes.reduce((a, b) => a + b, 0) /
            recognitionTimes.length
          : 0;
    }

    generateASRTestReport(reportData, `ASR测试报告_任务${currentTask.id}.xlsx`);
  };

  // 处理开始任务
  const handleStartTask = (taskId: number) => {
    setIsDetailDialogOpen(false);

    dispatch(setSelectedSamples(currentTask?.test_samples_ids || []));

    // dispatch(
    //   updateTaskAsync({
    //     id: taskId,
    //     task_status: "in_progress",
    //   })
    // );

    dispatch(setAutoStart(taskId)); // 添加一个新的Redux action用于开始自动化测试流程
    router.push("/llm-analysis");
  };

  useEffect(() => {
    if (isDetailDialogOpen === false) {
      dispatch(setCurrentTask(null));
    }
  }, [isDetailDialogOpen]);

  // 获取任务数据
  useEffect(() => {
    if (tasksStatus === "idle") {
      dispatch(fetchTasks());
    }
  }, [dispatch, tasksStatus]);

  // 获取测试语料数据
  useEffect(() => {
    if (samplesStatus === "idle" && samples.length === 0) {
      dispatch(fetchSamples());
    }
  }, [dispatch, samplesStatus, samples.length]);

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
      timestamp: new Date().toLocaleString(), // 示例时间戳，实际应该从task中获取
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

  return (
    <div>
      <div className="flex items-center fixed top-0 w-full bg-white">
        <SidebarTrigger className="mx-6 my-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">主页</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/taskmanage">测试任务管理</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="min-h-screen bg-white p-6">
        <div className="pt-8 w-full mx-auto">
          <h1 className="text-3xl font-bold mb-6">测试任务管理</h1>

          {/* 核心指标卡片组 */}
          <div className="w-full mb-6">
            <ChartComponent />
          </div>

          {/* 最近验证任务 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-6 py-4">
              <CardTitle>最近验证任务</CardTitle>
              <div className="flex space-x-2">
                {/* 筛选下拉菜单 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center"
                    >
                      <Filter className="h-4 w-4 mr-1" />
                      筛选
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
                      variant="outline"
                      size="sm"
                      className="flex items-center"
                    >
                      <ArrowUpDown className="h-4 w-4 mr-1" />
                      排序
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

                <Link href="/taskmanage/create-task">
                  <Button size="sm">创建新任务</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {tasksStatus === "loading" ? (
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
                          className="flex h-24 items-center justify-between p-5 border rounded-xl hover:bg-accent cursor-pointer"
                          onClick={() => {
                            const task = tasks.find((t) => t.id === result.id);
                            if (task) {
                              dispatch(setCurrentTask(task));
                              setIsDetailDialogOpen(true);
                            }
                          }}
                        >
                          <div className="flex items-center space-x-4">
                            <div
                              className={`h-3 w-3 rounded-full ${
                                result.status === "completed"
                                  ? "bg-green-500"
                                  : result.status === "failed"
                                  ? "bg-red-500"
                                  : result.status === "in_progress"
                                  ? "bg-blue-500"
                                  : "bg-yellow-500"
                              }`}
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
                                    onClick={() => {
                                      dispatch(deleteTaskAsync(result.id));
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
                              <div className="flex justify-between items-center mb-2">
                                <p className="font-medium">语料 #{sampleId}</p>
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
                    variant="destructive"
                    onClick={() => {
                      if (isDetailDialogOpen === true) {
                        setIsDetailDialogOpen(false);
                      }
                      dispatch(deleteTaskAsync(currentTask.id));
                    }}
                  >
                    删除任务
                  </Button>

                  {currentTask.task_status === "pending" && (
                    <Button
                      variant="default"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => handleStartTask(currentTask.id)}
                    >
                      开始任务
                    </Button>
                  )}

                  <Button onClick={handleExportReport}>导出报告</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
