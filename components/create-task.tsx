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
import { WakeWord } from "@/types/api"; // Task might not be needed directly here anymore
import { useAppSelector, useAppDispatch } from "@/store/hooks";
// import { createTaskAsync } from "@/store/taskSlice"; // Will be replaced
import { useTauriTasks } from "@/hooks/useTauriTasks"; // Import the new hook
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/components/ui/use-toast";
import { Input } from "./ui/input";
// Removed Redux imports for wake words
import { setSelectedSamples } from "@/store/samplesSlice"; // Keep for selected samples if needed
import { TauriApiService } from "@/services/tauri-api"; // Import TauriApiService for wake words

// import { create } from "domain"; // Removed unused import

export default function CreateTask() {
  const [selectedWakeWordId, setSelectedWakeWordId] = useState<number | null>(
    null
  );
  // const [isCreating, setIsCreating] = useState(false); // Replaced by isCreatingTask from hook
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [wakewords, setWakewords] = useState<WakeWord[]>([]); // Local state for wake words
  const [isLoadingWakewords, setIsLoadingWakewords] = useState(false);

  const dispatch = useAppDispatch(); // Still needed for setSelectedSamples
  const router = useRouter();
  const { createTask: createTaskWithTauri, isLoading: isCreatingTask } = useTauriTasks(); // Get createTask from hook
  const selectedIds = useAppSelector((state) => state.samples.selectedIds);
  // const wakewords = useAppSelector(selectWakeWords); // Replaced with local state

  useEffect(() => {
    const loadWakeWords = async () => {
      setIsLoadingWakewords(true);
      try {
        const fetchedWakeWords = await TauriApiService.getAllWakeWords();
        setWakewords(fetchedWakeWords);
      } catch (err) {
        console.error("Failed to fetch wake words from Tauri:", err);
        toast({
          variant: "destructive",
          title: "获取唤醒词失败",
          description: "无法从后端加载唤醒词列表。",
        });
      } finally {
        setIsLoadingWakewords(false);
      }
    };
    loadWakeWords();
  }, []); // Fetch on component mount

  const handleCreateTask = async () => {
    // 验证必要数据
    if (!taskName.trim()) {
      setError("请输入任务名称");
      return;
    }
    if (!selectedWakeWordId) {
      setError("请选择唤醒词");
      return;
    }

    if (selectedIds.length === 0) {
      setError("请选择至少一条测试语料");
      return;
    }

    // setIsCreating(true); // isLoading from hook will be used
    setError(null);
    setSuccess(false); // Reset success state

    try {
      const newTaskId = await createTaskWithTauri(
        taskName,
        selectedIds,
        selectedWakeWordId
      );

      if (newTaskId) {
        setSuccess(true);
        // Toast is handled by the hook
        // toast({
        //   title: "任务创建成功",
        //   description: `已成功创建任务 #${newTaskId}`,
        // });
        
        dispatch(setSelectedSamples([])); // Clear selected samples
        setTaskName(""); // Clear task name
        setSelectedWakeWordId(null); // Clear selected wake word
        
        // Optional: Add a small delay before redirecting to allow user to see success message
        setTimeout(() => {
          router.push("/taskmanage");
        }, 1500);

      } else {
        // Error toast is handled by the hook, but we can set local error if needed
        setError("创建任务失败，请检查控制台获取更多信息。");
      }
    } catch (err: any) {
      // Error toast is handled by the hook
      setError(err.message || "创建任务时发生未知错误。");
      console.error("Error creating task:", err);
    } 
    // finally {
    //   setIsCreating(false); // isLoading from hook will be used
    // }
  };

  return (
    <div className="flex flex-1 justify-center items-center bg-white">
      <div className="flex-1 bg-background">
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
                !taskName.trim() || // Add task name validation to disabled state
                selectedIds.length === 0 ||
                !selectedWakeWordId ||
                isCreatingTask || // Use isLoading from hook
                success
              }
              className="gap-2 bg-blue-700 hover:bg-blue-500 w-full"
              variant="default"
            >
              {isCreatingTask ? ( // Use isLoading from hook
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isCreatingTask ? "创建中..." : "新建测试任务"} 
            </Button>
          </div>
        </div>

        {/* 错误提示 - Hook handles toast, this can be a fallback or removed */}
        {error && !isCreatingTask && ( // Show only if not loading and error exists
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>创建错误</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* 成功提示 - Hook handles toast, this can be a fallback or removed */}
        {success && !isCreatingTask && ( // Show only if not loading and success
          <Alert
            variant="default"
            className="mt-4 bg-green-50 border-green-200"
          >
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-600">任务已创建</AlertTitle>
            <AlertDescription>
              任务已成功创建，即将跳转到任务管理页面...
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
