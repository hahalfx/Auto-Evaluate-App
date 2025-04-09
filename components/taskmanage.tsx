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
import { Ellipsis, Loader2, Play } from "lucide-react";
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
import { useLLMAnalysis } from "@/hooks/useLLMAnalysis";

export default function TaskManage() {
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(selectAllTasks);
  const currentTask = useAppSelector(selectCurrentTask);
  const tasksStatus = useAppSelector(selectTasksStatus);
  const samples = useAppSelector(selectAllSamples);
  const samplesStatus = useAppSelector(selectSamplesStatus);
  const { playMatchedAudio } = useAudioPlayer();
  const router = useRouter();

  const { handleStartAutomatedTest } = useLLMAnalysis();

  // 处理开始任务
  const handleStartTask = (taskId: number) => {
    setIsDetailDialogOpen(false);

    dispatch(setSelectedSamples(currentTask?.test_samples_ids || []));

    // dispatch(updateTaskAsync({
    //   id: taskId,
    //   task_status: "in_progress"
    // }));

    dispatch(setAutoStart(true)); // 添加一个新的Redux action
    router.push("/llm-analysis");
  };

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
    recentResults:
      Array.isArray(tasks) && tasks.length > 0
        ? tasks.slice(0, 4).map((task) => ({
            id: task.id,
            similarity: Math.round(Math.random() * 30 + 70), // 示例数据，实际应该从task中计算
            status: task.task_status,
            timestamp: new Date().toLocaleString(), // 示例时间戳，实际应该从task中获取
          }))
        : [],
  };

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
              <Link href="/taskmanage/create-task">
                <Button size="sm">创建新任务</Button>
              </Link>
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
                <div className="space-y-2">
                  {stats.recentResults.map((result) => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
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
                          <p className="font-medium">任务 #{result.id}</p>
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
                              <DropdownMenuItem className="text-destructive">
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
            </CardContent>
          </Card>
        </div>
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[800px] overflow-auto">
            <DialogHeader>
              <DialogTitle>任务详情</DialogTitle>
            </DialogHeader>
            {currentTask && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                  <p className="text-sm font-medium">测试语料IDs</p>
                  <div className="flex flex-wrap gap-2">
                    {currentTask.test_samples_ids.map((id) => (
                      <Badge key={id} variant="outline">
                        #{id}
                      </Badge>
                    ))}
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
                    <div className="border rounded-md p-4 space-y-3">
                      {currentTask.test_samples_ids.map((sampleId) => {
                        const sample = samples.find((s) => s.id === sampleId);
                        return sample ? (
                          <div
                            key={sampleId}
                            className="flex justify-between items-center border-b pb-2 last:border-0 last:pb-0"
                          >
                            <div>
                              <p className="font-medium">语料 #{sampleId}</p>
                              <p className="text-sm text-muted-foreground">
                                {sample.text}
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
                      <div className="border rounded-md p-4 space-y-3">
                        {Object.entries(currentTask.machine_response).map(
                          ([sampleId, response]) => (
                            <div
                              key={sampleId}
                              className="flex justify-between items-start border-b pb-2 last:border-0 last:pb-0"
                            >
                              <div>
                                <p className="font-medium">语料 #{sampleId}</p>
                                <p className="text-sm text-muted-foreground">
                                  {response.text}
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
                      <div className="border rounded-md p-4 space-y-3">
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
                                <div className="text-center p-2 bg-gray-50 rounded">
                                  <p className="text-xs text-muted-foreground">
                                    语义正确性
                                  </p>
                                  <p className="font-mono font-bold">
                                    {result.assessment.semantic_correctness.score.toFixed(
                                      1
                                    )}
                                  </p>
                                </div>
                                <div className="text-center p-2 bg-gray-50 rounded">
                                  <p className="text-xs text-muted-foreground">
                                    状态变更确认
                                  </p>
                                  <p className="font-mono font-bold">
                                    {result.assessment.state_change_confirmation.score.toFixed(
                                      1
                                    )}
                                  </p>
                                </div>
                                <div className="text-center p-2 bg-gray-50 rounded">
                                  <p className="text-xs text-muted-foreground">
                                    表达无歧义
                                  </p>
                                  <p className="font-mono font-bold">
                                    {result.assessment.unambiguous_expression.score.toFixed(
                                      1
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="text-center p-2 bg-gray-100 rounded mb-2">
                                <p className="text-xs text-muted-foreground">
                                  总分
                                </p>
                                <p className="font-mono font-bold text-lg">
                                  {result.assessment.overall_score.toFixed(1)}
                                </p>
                              </div>
                              {result.assessment.suggestions.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">
                                    改进建议:
                                  </p>
                                  <ul className="text-xs list-disc list-inside">
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
                    variant="outline"
                    onClick={() => setIsDetailDialogOpen(false)}
                  >
                    关闭
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

                  <Button>导出报告</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
