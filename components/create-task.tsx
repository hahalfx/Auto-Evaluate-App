"use client";
import { AlertCircle, CheckCircle, Loader2, Play, Plus } from "lucide-react";
import { TestSamples } from "./test-samples";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { SidebarTrigger } from "./ui/sidebar";
import { useEffect, useState } from "react";
import { WakeWord, Task } from "@/types/api";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { createTaskAsync } from "@/store/taskSlice";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/components/ui/use-toast";
import { Input } from "./ui/input";
import {
  fetchWakeWords,
  selectWakeWords,
  setSelectedSamples,
} from "@/store/samplesSlice";
import { create } from "domain";

export default function CreateTask() {
  const [selectedWakeWordId, setSelectedWakeWordId] = useState<number | null>(
    null
  );
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [taskName, setTaskName] = useState("");

  const dispatch = useAppDispatch();
  const router = useRouter();
  const selectedIds = useAppSelector((state) => state.samples.selectedIds);
  const wakewords = useAppSelector(selectWakeWords);

  useEffect(() => {
    if (wakewords.length === 0) {
      dispatch(fetchWakeWords());
    }
  }, []);

  const handleCreateTask = async () => {
    // 验证必要数据
    if (!selectedWakeWordId) {
      setError("请选择唤醒词");
      return;
    }

    if (selectedIds.length === 0) {
      setError("请选择至少一条测试语料");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // 创建新任务
      const newTask = {
        name: taskName,
        test_samples_ids: selectedIds,
        wake_word_id: selectedWakeWordId,
        task_status: "pending",
        created_at: new Date().toLocaleString(),
      };

      const resultAction = await dispatch(createTaskAsync(newTask));

      if (
        createTaskAsync.fulfilled.match(resultAction) &&
        resultAction.payload
      ) {
        setSuccess(true);
        toast({
          title: "任务创建成功",
          description: `已成功创建任务 #${resultAction.payload.id}`,
        });

        // 延迟后跳转到任务管理页面

        dispatch(setSelectedSamples([]));
        router.push("/taskmanage");
      } else {
        setError("创建任务失败，请重试");
      }
    } catch (err) {
      setError("创建任务时发生错误");
      console.error("Error creating task:", err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div>
      <div className="min-h-screen bg-background p-6">
        <div className="w-full mx-auto">
          <h1 className="text-3xl font-bold mb-3">新建测试任务</h1>
        </div>
        <div className="flex gap-x-3">
          <div className="flex-1 mb-3">
            <div className="text-sm text-gray-500 mb-1">1. 输入任务名称</div>
            <Input
              placeholder="请输入任务名称"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
            />
          </div>
          <div className="flex-col flex-1">
            <div className="text-sm text-gray-500 mb-1">2. 选择唤醒词</div>
            <Select
              onValueChange={(value) => setSelectedWakeWordId(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择唤醒词" />
              </SelectTrigger>
              <SelectContent>
                {wakewords.map((wakeword: WakeWord) => (
                  <SelectItem value={wakeword.id.toString()} key={wakeword.id}>
                    {wakeword.text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">3. 选择测试语料</div>
          <TestSamples initialPageSize={6} />
        </div>
        <div className="flex gap-2 mt-3">
          <div className="flex-col w-full">
            <div className="text-sm text-gray-500 mb-1">4. 新建测试任务</div>
            <Button
              onClick={handleCreateTask}
              disabled={
                selectedIds.length === 0 ||
                !selectedWakeWordId ||
                isCreating ||
                success
              }
              className="gap-2 bg-blue-700 hover:bg-blue-500 w-full"
              variant="default"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isCreating ? "创建中..." : "新建测试任务"}
            </Button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>错误</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* 成功提示 */}
        {success && (
          <Alert
            variant="default"
            className="mt-4 bg-green-50 border-green-200"
          >
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-600">成功</AlertTitle>
            <AlertDescription>
              任务创建成功，即将跳转到任务管理页面...
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
