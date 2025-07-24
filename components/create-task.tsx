"use client";
import { AlertCircle, CheckCircle, Loader2, Play, Plus, Upload, FolderOpen } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { open } from '@tauri-apps/plugin-dialog';

// import { create } from "domain"; // Removed unused import

export default function CreateTask() {
  const [selectedWakeWordIds, setSelectedWakeWordIds] = useState<number[]>([]);
  // const [isCreating, setIsCreating] = useState(false); // Replaced by isCreatingTask from hook
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [wakewords, setWakewords] = useState<WakeWord[]>([]); // Local state for wake words
  const [isLoadingWakewords, setIsLoadingWakewords] = useState(false);
  const [isImportingPackage, setIsImportingPackage] = useState(false);
  const [importMode, setImportMode] = useState<'manual' | 'package'>('manual');
  const [importResult, setImportResult] = useState<{
    taskId: number;
    wakeWords: { created: number; ignored: number };
    samples: { created: number; ignored: number };
  } | null>(null);


  const dispatch = useAppDispatch(); // Still needed for setSelectedSamples
  const router = useRouter();
  const { createTask: createTaskWithTauri, isLoading: isCreatingTask, fetchAllTasks } = useTauriTasks(); // Get createTask from hook
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
    if (selectedWakeWordIds.length === 0) {
      setError("请选择至少一个唤醒词");
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
        selectedWakeWordIds
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
        setSelectedWakeWordIds([]); // Clear selected wake words
        
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

  const handleWakeWordToggle = (wakeWordId: number) => {
    setSelectedWakeWordIds(prev => {
      if (prev.includes(wakeWordId)) {
        return prev.filter(id => id !== wakeWordId);
      } else {
        return [...prev, wakeWordId];
      }
    });
  };



  const handleImportPackage = async () => {
    if (!taskName.trim()) {
      setError("请输入任务名称");
      return;
    }

    setIsImportingPackage(true);
    setError(null);
    setSuccess(false);

    try {
      console.log("开始选择文件夹...");
      
      // 使用Tauri的dialog API选择文件夹
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择任务包文件夹'
      });

      console.log("选择的文件夹:", selected);
      console.log("选择的文件夹类型:", typeof selected);

      if (selected === null) {
        console.log("用户取消了选择");
        setIsImportingPackage(false);
        return;
      }

      // 检查selected的类型和内容
      console.log("selected的详细信息:", JSON.stringify(selected, null, 2));
      
      let folderPath: string;
      if (Array.isArray(selected)) {
        // 如果multiple为true，返回的是数组
        if (selected.length === 0) {
          console.log("没有选择文件夹");
          setIsImportingPackage(false);
          return;
        }
        folderPath = selected[0];
      } else if (typeof selected === 'string') {
        // 如果multiple为false，返回的是字符串
        folderPath = selected;
      } else {
        console.error("意外的selected类型:", typeof selected);
        throw new Error(`意外的selected类型: ${typeof selected}`);
      }
      console.log("文件夹路径:", folderPath);
      console.log("文件夹路径类型:", typeof folderPath);
      console.log("文件夹路径长度:", folderPath ? folderPath.length : 0);
      
      // 确保路径是字符串类型
      if (typeof folderPath !== 'string') {
        throw new Error(`无效的路径类型: ${typeof folderPath}, 路径: ${folderPath}`);
      }
      
      // 尝试规范化路径
      let normalizedPath = folderPath;
      
      // 如果是相对路径，尝试转换为绝对路径
      if (!folderPath.startsWith('/') && !folderPath.startsWith('\\')) {
        // 在浏览器环境中，我们无法直接获取绝对路径
        // 但我们可以尝试使用当前工作目录
        console.log("检测到相对路径，尝试处理...");
      }
      
      // 移除末尾的斜杠（如果有）
      normalizedPath = normalizedPath.replace(/\/$/, '').replace(/\\$/, '');
      
      console.log("规范化后的路径:", normalizedPath);
      
      // 调用导入任务包API
      const result = await TauriApiService.importTaskPackage(normalizedPath, taskName);
      
      // 保存导入结果用于显示
      setImportResult({
        taskId: result.task_id,
        wakeWords: {
          created: result.wake_words_created,
          ignored: result.wake_words_ignored
        },
        samples: {
          created: result.samples_created,
          ignored: result.samples_ignored
        }
      });
      
      setSuccess(true);
      toast({
        title: "任务包导入成功",
        description: `成功创建任务 #${result.task_id}，包含 ${result.wake_words_created + result.wake_words_ignored} 个唤醒词（新增 ${result.wake_words_created} 个，重复 ${result.wake_words_ignored} 个），${result.samples_created + result.samples_ignored} 个测试语料（新增 ${result.samples_created} 个，重复 ${result.samples_ignored} 个）`,
      });

      // 刷新任务列表
      await fetchAllTasks();
      
      // 清空表单
      setTaskName("");
      
      // 延迟跳转
      setTimeout(() => {
        router.push("/taskmanage");
      }, 3000); // 增加延迟时间，让用户看到导入结果

    } catch (err: any) {
      console.error("导入任务包错误:", err);
      setError(err.message || "导入任务包时发生未知错误。");
      toast({
        variant: "destructive",
        title: "导入任务包失败",
        description: err.message || "导入任务包时发生错误。",
      });
    } finally {
      setIsImportingPackage(false);
    }
  };

  return (
    <div className="flex flex-1 bg-white">
      <div className="flex-1 bg-background min-h-screen">
        <Tabs value={importMode} onValueChange={(value) => setImportMode(value as 'manual' | 'package')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              手动创建
            </TabsTrigger>
            <TabsTrigger value="package" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              导入任务包
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 !mt-0">
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
                <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                  {wakewords.map((wakeword: WakeWord) => (
                    <div
                      key={wakeword.id}
                      className={`flex items-center space-x-2 p-2 rounded cursor-pointer transition-colors ${
                        selectedWakeWordIds.includes(wakeword.id)
                          ? 'bg-blue-100 border-blue-300'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                      onClick={() => handleWakeWordToggle(wakeword.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedWakeWordIds.includes(wakeword.id)}
                        onChange={() => handleWakeWordToggle(wakeword.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{wakeword.text}</span>
                    </div>
                  ))}
                  {wakewords.length === 0 && (
                    <div className="text-sm text-gray-500 text-center py-2">
                      {isLoadingWakewords ? "加载中..." : "暂无唤醒词"}
                    </div>
                  )}
                </div>
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
                    selectedWakeWordIds.length === 0 ||
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
          </TabsContent>

          <TabsContent value="package" className="space-y-4 !mt-0">
            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-1">1. 输入任务名称</div>
              <Input
                placeholder="请输入任务名称"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
              />
            </div>
            
            <div className="mb-6">
              <div className="text-sm text-gray-500 mb-2">2. 任务包结构说明</div>
              <div className="bg-gray-50 p-4 rounded-lg text-sm">
                <p className="font-medium mb-2">任务包文件夹应包含以下内容：</p>
                <ul className="space-y-1 text-gray-600">
                  <li>• <code className="bg-gray-200 px-1 rounded">唤醒词语料列表.xlsx</code> - 唤醒词Excel文件（第一列：文件名，第二列：语料名）（注意第一行为标题行：文件名，语料名不会被识别）</li>
                  <li>• <code className="bg-gray-200 px-1 rounded">测试语料列表.xlsx</code> - 测试语料Excel文件（第一列：文件名，第二列：语料名）（注意第一行为标题行：文件名，语料名不会被识别）</li>
                  <li>• <code className="bg-gray-200 px-1 rounded">audio/</code> 文件夹，包含：</li>
                  <li className="ml-4">  - <code className="bg-gray-200 px-1 rounded">wakeword/</code> - 唤醒词音频文件</li>
                  <li className="ml-4">  - <code className="bg-gray-200 px-1 rounded">samples/</code> - 测试语料音频文件</li>
                </ul>
                <p className="text-blue-600 mt-2 text-xs">💡 系统会自动验证文件夹结构，并在导入时进行智能重复检查。相同文本但不同音频文件路径的数据会被视为新数据。</p>
              </div>
            </div>

            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-1">3. 选择任务包文件夹</div>
              <Button
                onClick={handleImportPackage}
                disabled={
                  !taskName.trim() ||
                  isImportingPackage ||
                  success
                }
                className="gap-2 !bg-green-600 hover:!bg-green-700 !text-white w-full"
                style={{ backgroundColor: '#16a34a', color: 'white' }}
                variant="default"
              >
                {isImportingPackage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="h-4 w-4" />
                )}
                {isImportingPackage ? "导入中..." : "导入任务包"} 
              </Button>
            </div>

            {/* 导入结果显示 */}
            {importResult && (
              <div className="mb-4">
                <div className="text-sm text-gray-500 mb-2">4. 导入结果</div>
                <div className="bg-green-50 p-4 rounded-lg text-sm space-y-3">
                  <div className="text-center">
                    <h4 className="font-medium text-green-800 mb-2">✅ 任务包导入成功</h4>
                    <p className="text-green-700">任务 #{importResult.taskId} 已创建</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-green-800 mb-2">唤醒词</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-100 p-3 rounded">
                        <p className="text-green-800 font-medium">新增: {importResult.wakeWords.created} 个</p>
                      </div>
                      <div className="bg-amber-100 p-3 rounded">
                        <p className="text-amber-800 font-medium">重复: {importResult.wakeWords.ignored} 个</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-green-800 mb-2">测试语料</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-100 p-3 rounded">
                        <p className="text-green-800 font-medium">新增: {importResult.samples.created} 个</p>
                      </div>
                      <div className="bg-amber-100 p-3 rounded">
                        <p className="text-amber-800 font-medium">重复: {importResult.samples.ignored} 个</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-xs text-green-600 bg-green-100 p-2 rounded">
                    💡 系统已自动进行重复检查。重复的数据使用现有记录，相同文本但不同音频文件路径的数据作为新数据创建。
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* 错误提示 - Hook handles toast, this can be a fallback or removed */}
        {error && !isCreatingTask && !isImportingPackage && ( // Show only if not loading and error exists
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>创建错误</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* 成功提示 - Hook handles toast, this can be a fallback or removed */}
        {success && !isCreatingTask && !isImportingPackage && ( // Show only if not loading and success
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
