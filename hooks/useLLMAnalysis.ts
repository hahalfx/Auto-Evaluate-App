import { useState, useEffect, useRef, use } from "react";
import { submitForAnalysis, fetchTestSamples } from "@/services/api"; // 导入API调用函数
import type { AnalysisResult, TestSample } from "@/types/api"; // 导入类型定义
import { useToast } from "@/components/ui/use-toast"; // 导入UI提示组件
import { MachineResponseHandle } from "@/components/machine-response"; // 导入车机响应组件句柄类型
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectAllSamples,
  selectSelectedSampleIds,
  setSelectedSamples,
  updateSampleResult,
  deleteSample,
  fetchSamples,
  fetchWakeWords,
  selectWakeWords,
} from "@/store/samplesSlice";
import {
  setAutoStart,
  setCurrentTask,
  updateMachineResponse,
  updateTaskAsync,
  updateTaskStatus,
  updateTestResult, // 更新测试结果
} from "@/store/taskSlice"; // 导入任务相关的Redux actions
import { store } from "@/store"; // 导入Redux store实例
import { useAudioPlayer } from "./useAudioPlayer";

/**
 * 自定义hook，封装LLM分析界面的状态和业务逻辑
 *
 * 主要功能：
 * 1. 管理测试样本、选中样本、机器响应和分析结果等状态
 * 2. 处理自动化测试流程
 * 3. 处理分析提交和结果导航
 * 4. 管理播放和录音状态
 *
 * @returns 返回状态和方法供组件使用
 */
export function useLLMAnalysis() {
  // --- Redux State ---
  // 从Redux store获取所有样本数据
  const samples = useAppSelector(selectAllSamples);
  // 从Redux store获取所有唤醒词信息
  const wakeWords = useAppSelector(selectWakeWords);

  const autoStart = useAppSelector((state) => state.tasks.autoStart);
  // 从Redux store获取当前任务信息
  const Task = useAppSelector((state) => state.tasks.currentTask);
  // 从当前任务获取选中的样本ID列表，如果任务不存在则为空数组
  const selectedSample = Task?.test_samples_ids || [];
  // 获取Redux dispatch函数，用于派发actions
  const dispatch = useAppDispatch();

  // --- Local State ---
  // 车机响应文本状态
  const [machineResponse, setMachineResponse] = useState<string>("");
  // 车机响应组件的引用，用于调用其内部方法 (如播放音频)
  const machineResponseRef = useRef<MachineResponseHandle>(null);

  // 分析结果状态，使用Map存储，键为样本ID，值为分析结果
  const [analysisResults, setAnalysisResults] = useState<
    Map<number, AnalysisResult>
  >(new Map());
  // 当前显示的分析结果在已选样本列表中的索引
  const [currentResultIndex, setCurrentResultIndex] = useState<number>(0);

  // 加载状态和错误状态
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // UI提示hook
  const { toast } = useToast();

  // 任务进度状态
  const [taskProgress, setTaskProgress] = useState<{
    value: number;
    current: number; // 当前完成数
    total: number; // 总数
  }>({
    value: 0,
    current: 0,
    total: 0,
  });
  // 当前进度对应的操作名称 (如 "播放语料", "分析提交")
  const [progressName, setProgressName] = useState<string>("");

  // --- Effects ---
  // 组件挂载时，从后端获取测试样本数据并存入Redux store
  useEffect(() => {
    dispatch(fetchSamples());
    dispatch(fetchWakeWords());
  }, [dispatch]); // 依赖dispatch，但通常dispatch是稳定的

  // 在组件中添加效果验证
  useEffect(() => {
    console.log("CurrentTask changed:", Task);
  }, [Task]);

  // 当当前任务ID变化时，重置进度条和错误状态
  useEffect(() => {
    setTaskProgress({
      value: 0,
      current: 0,
      total: 0,
    });
    setProgressName("");
    setError(null);
    setAnalysisResults(new Map()); // 清空之前的分析结果
    setCurrentResultIndex(0); // 重置结果索引
    isPlayingNextRef.current = false;
  }, [Task?.id]);

  // 处理从任务管理界面跳转过来开始的任务
  useEffect(() => {
    if (autoStart) {
      // 从Redux获取任务
      const selectedTask = store
        .getState()
        .tasks.items.find((task) => task.id === autoStart);
      if (!selectedTask) {
        console.error("未找到对应任务");
        return;
      }

      // 设置当前任务
      dispatch(setCurrentTask(selectedTask));

      // 添加延迟，给音频文件加载和状态更新留出时间
      const timer = setTimeout(() => {
        // 检查任务是否处于待处理状态
        if (selectedTask.task_status === "pending") {
          handleStartAutomatedTest();
        }
        dispatch(setAutoStart(null));
      }, 1000); // 延迟1秒

      return () => clearTimeout(timer);
    }
  }, [autoStart, dispatch]);

  // --- Playback & Recording State ---
  const [isPlaying, setIsPlaying] = useState(false);
  // 是否正在录音
  const [isRecording, setIsRecording] = useState(false);
  // 用于防止短时间内重复触发播放下一条的标记
  const isPlayingNextRef = useRef<boolean>(false);

  // --- Redux Actions Wrappers ---
  // 设置选中的样本ID列表 (更新Redux store)
  const setSelectedSampleIds = (ids: number[]) => {
    // 注意：这里是直接设置，而不是更新Task中的test_samples_ids
    // 这可能与selectedSample的来源 (Task?.test_samples_ids) 有潜在冲突或不一致
    // 应该更新Task对象然后dispatch更新Task的action
    dispatch(setSelectedSamples(ids));
  };

  // 删除指定ID的样本 (更新Redux store)
  const handleDeleteSample = (id: number) => {
    dispatch(deleteSample(id));
  };

  // --- Component Interaction Effect ---
  // 监听MachineResponse组件内部的播放和录音状态变化，并更新本地状态
  useEffect(() => {
    const currentRef = machineResponseRef.current;
    if (currentRef) {
      setIsRecording(currentRef.isRecording || false);
    }
    // 依赖项应包含明确的状态属性，而不是整个ref.current
  }, [machineResponseRef.current?.isRecording]);

  // --- Core Logic Functions ---

  // 使用自定义播放音频hook
  const { playWakeAudio } = useAudioPlayer({
    onPlayEnd: () => {
      console.log("音频播放结束，开始语音识别");
      setIsPlaying(false);
      machineResponseRef.current?.startRecording();
    },
    onPlayError: (errorMsg) => {
      toast({
        title: "播放失败",
        description: errorMsg,
        variant: "destructive",
      });
    },
  });

  /**
   * 自动播放下一条测试样本的音频
   * @param sortedSampleIds 排序后的选中样本ID数组
   * @param completedCount 已完成分析的样本数量
   */
  const playNextSample = (
    sortedSampleIds: number[],
    completedCount: number
  ) => {
    // 如果已完成所有样本，则返回
    if (completedCount >= sortedSampleIds.length) return;

    // 获取下一个要播放的样本ID和样本对象
    const nextSampleId = sortedSampleIds[completedCount];
    const nextSample = samples.find((s: TestSample) => s.id === nextSampleId);

    //debug用
    console.log("尝试播放下一个样本:", {
      completedCount,
      nextSampleId,
      nextSample,
      nextSampleText: nextSample?.text,
      currentResultIndex,
      currentSampleText: getCurrentSampleText(),
      isPlaying,
    });

    // 检查样本是否存在、是否需要自动播放、MachineResponse组件引用是否存在且未在播放中
    if (
      nextSample &&
      !isPlaying // 使用Ref防止重复触发
    ) {
      // 延迟1秒后尝试播放
      setTimeout(() => {
        try {
          // 播放唤醒词
          Task?.wake_word_id &&
            playWakeAudio(
              wakeWords[Task?.wake_word_id - 1].text,
              nextSample.text
            );
        } catch (error) {
          console.error("播放唤醒词失败:", error);
          return;
        }
      }, 1000);

      // 播放后延迟2秒重置标记 (允许下一次播放)
      setTimeout(() => {
        isPlayingNextRef.current = false;
      }, 2000);

      // 显示提示信息
      toast({
        title: "自动播放下一条",
        description: `正在处理指令: "${nextSample.text}"`,
        variant: "default",
      });
    } else if (nextSample) {
      // 如果不满足自动播放条件 (例如组件未准备好)，提示用户手动输入
      toast({
        title: "请输入下一条响应",
        description: `请为指令"${nextSample.text}"输入车机响应`,
        variant: "default",
      });
    }
  };

  /**
   * 处理“开始自动化测试”按钮点击事件
   * 触发当前待测样本的音频播放 (如果存在)
   */
  const handleStartAutomatedTest = () => {

    if (!isPlayingNextRef.current) {
      isPlayingNextRef.current = true; // 设置播放标记

      // 延迟1秒后播放
      setTimeout(() => {
        try {
          console.log(Task);
          // 从Redux store获取最新的Task状态
          const currentTask = store.getState().tasks.currentTask;
          const sampleText = store.getState().samples.items.find((s: TestSample) => s.id === currentTask?.test_samples_ids[currentResultIndex])?.text;
          console.log("开始播放", currentTask, currentTask?.wake_word_id);
          
          if (currentTask?.wake_word_id && sampleText) {
            console.log("wakeword",store.getState().samples.wakeWords[currentTask.wake_word_id - 1].text)
            playWakeAudio(
              store.getState().samples.wakeWords[currentTask.wake_word_id - 1].text,
              sampleText
            );
          } else {
            console.warn("无法播放：任务或唤醒词ID不存在");
          }
        } catch (error) {
          console.error("播放唤醒词失败:", error);
          return;
        }
      }, 1000);

      // 播放后延迟2秒重置标记
      setTimeout(() => {
        isPlayingNextRef.current = false;
      }, 2000);
    }
  };

  /**
   * 运行自动化测试流程的主函数
   * 可以由“开始测试”按钮触发，或在提交分析后自动调用以处理下一条
   * @param initialResponse 可选的初始响应文本 (通常在手动输入响应后调用 handleAnalysis 时传入)
   */
  const runAutomatedTest = async (initialResponse?: string) => {
    // --- 情况1: 提供了初始响应 (通常是用户手动输入后点击“提交分析”) ---
    if (initialResponse) {
      // 直接调用分析处理函数
      await handleAnalysis(initialResponse);
      // 更新进度名称
      setProgressName("分析提交");
      return; // 结束本次调用
    }

    // --- 情况2: 未提供初始响应 (通常是点击“开始自动化测试”按钮) ---
    // 检查是否选择了样本
    if (selectedSample.length === 0) {
      toast({
        title: "请选择测试样本",
        description: "请先选择一个测试样本进行分析",
        variant: "destructive",
      });
      return;
    }

    // 获取排序后的选中样本ID
    const sortedSampleIds = [...selectedSample].sort((a, b) => a - b);
    // 获取已完成分析的样本数量
    const completedCount = analysisResults.size;

    // 检查是否所有选中的样本都已完成分析
    if (completedCount >= sortedSampleIds.length) {
      toast({
        title: "测试已完成",
        description: "所有选中的样本都已测试完成",
        variant: "default",
      });
      return;
    }

    // 如果还有未测试的样本，调用播放函数开始播放当前待测样本的音频
    handleStartAutomatedTest();
    // 更新进度名称
    setProgressName("播放语料");
  };

  /**
   * 处理分析提交的核心函数
   * @param overrideResponse 可选的覆盖响应文本。如果提供，则使用此文本；否则使用本地状态 `machineResponse`。
   */
  const handleAnalysis = async (overrideResponse?: string) => {
    // 确定要提交的响应文本
    const responseToSubmit = overrideResponse || machineResponse;

    // 校验：响应文本不能为空
    if (!responseToSubmit.trim()) {
      toast({
        title: "请输入车机响应",
        description: "车机响应不能为空",
        variant: "destructive",
      });
      return;
    }

    // 校验：必须选择了测试样本
    if (selectedSample.length === 0) {
      toast({
        title: "请选择测试样本",
        description: "请先选择一个测试样本进行分析",
        variant: "destructive",
      });
      return;
    }

    try {
      // 设置加载状态，清除错误
      setLoading(true);
      setError(null);

      // 获取排序后的选中样本ID和已完成数量
      const sortedSampleIds = [...selectedSample].sort((a, b) => a - b);
      const completedCount = analysisResults.size;
      const totalCount = sortedSampleIds.length;

      // 检查是否所有样本都已测试完成
      if (completedCount >= totalCount) {
        toast({
          title: "测试已完成",
          description: "所有选中的样本都已测试完成",
          variant: "default",
        });
        setLoading(false);
        return;
      }

      // 获取当前要分析的样本ID
      const currentSampleId = sortedSampleIds[completedCount];

      // 检查当前样本是否已经分析过 (避免重复提交)
      if (analysisResults.has(currentSampleId)) {
        toast({
          title: "样本已测试",
          description: "当前样本已经测试过，请选择其他样本",
          variant: "default",
        });
        setLoading(false);
        return;
      }

      // 更新任务进度 (提交前)
      setTaskProgress({
        value: Math.round((completedCount / totalCount) * 100),
        current: completedCount + 1, // 当前处理的是第 completedCount + 1 个
        total: totalCount,
      });

      // 从Redux store中查找当前样本对象
      const sample = samples.find((s: TestSample) => s.id === currentSampleId);
      if (!sample) throw new Error("未找到选中的测试样本"); // 如果找不到则抛出错误

      // 准备要更新到Redux store的车机响应数据
      const newResponse = {
        connected: true, // 假设车机总是连接状态
        text: responseToSubmit,
      };

      // --- Redux Action: 更新当前任务中对应样本的车机响应 ---
      dispatch(
        updateMachineResponse({
          taskId: Task?.id, // 当前任务ID
          sampleId: currentSampleId, // 当前样本ID
          response: newResponse, // 新的响应数据
        })
      );

      // --- API Call: 向后端提交分析请求 ---
      const result = await submitForAnalysis(sample.text, responseToSubmit);

      // --- Redux Action: 更新当前任务中对应样本的测试结果 ---
      dispatch(
        updateTestResult({
          taskId: Task?.id,
          sampleId: currentSampleId,
          result: { ...result, test_time: new Date().toLocaleString() }, // 添加测试时间
        })
      );

      // --- Local State Update: 更新本地分析结果Map ---
      const newResults = new Map(analysisResults);
      newResults.set(currentSampleId, result);
      setAnalysisResults(newResults); // 更新本地状态

      // --- Redux Action: 更新全局样本列表中该样本的结果 (冗余操作？Task中已更新) ---
      // 这个操作似乎是为了在全局样本列表（可能用于其他地方展示）也同步结果
      dispatch(
        updateSampleResult({
          sampleId: currentSampleId,
          taskId: Task?.id, // 需要任务ID来关联
          result: { ...result, test_time: new Date().toLocaleString() },
        })
      );

      // --- Navigation State Update: 更新当前结果显示索引 ---
      // 找到当前完成的样本在排序列表中的索引
      const newIndex = sortedSampleIds.findIndex(
        (id) => id === currentSampleId
      );
      // 更新当前结果索引，用于结果导航
      setCurrentResultIndex(newIndex >= 0 ? newIndex : 0);

      // --- Progress Update: 更新任务进度 (提交后) ---
      const newCompletedCount = newResults.size; // 获取最新的已完成数量
      setTaskProgress({
        value: Math.round((newCompletedCount / totalCount) * 100),
        current: newCompletedCount, // 更新当前完成数
        total: totalCount,
      });

      // --- UI Feedback: 显示分析结果Toast ---
      toast({
        title: "分析完成",
        description: `测评结果: ${
          result.assessment.valid ? "通过" : "不通过" // 根据结果显示不同状态
        } (${Math.round(result.assessment.overall_score * 100)}%)`, // 显示分数
        variant: result.assessment.valid ? "default" : "destructive", // 根据结果显示不同样式
      });

      // 清空输入框中的车机响应文本
      setMachineResponse("");

      // --- Next Step Logic ---
      // 如果还有未完成的样本
      if (newCompletedCount < totalCount) {
        // 调用播放下一条样本的函数
        playNextSample(sortedSampleIds, newCompletedCount);
      } else {
        // 如果所有样本都已完成
        // --- Redux Action: 更新任务状态为 "completed" ---
        dispatch(updateTaskStatus({ taskId: Task?.id, status: "completed" }));
        // 获取更新状态后的最新任务数据 (从Redux store)
        const newTask = store.getState().tasks.currentTask;
        // 如果任务存在，则异步将整个任务数据更新到后端 (或触发其他需要完整任务数据的逻辑)
        if (newTask) {
          dispatch(updateTaskAsync(newTask));
        }
        // 显示测试完成的提示
        toast({
          title: "测试完成",
          description: `所有${totalCount}条测试样本已完成分析`,
          variant: "default",
        });
      }
    } catch (err) {
      // --- Error Handling ---
      setError("分析失败，请重试"); // 设置错误状态
      // 显示错误提示
      toast({
        title: "分析失败",
        description: "无法获取分析结果，请重试",
        variant: "destructive",
      });
      console.error(err); // 在控制台打印错误详情
    } finally {
      // --- Cleanup ---
      setLoading(false); // 无论成功或失败，都结束加载状态
    }
  };

  // --- Result Navigation Functions ---

  /**
   * 获取当前应该显示的分析结果对象
   * @returns 当前结果对象或null
   */
  const getCurrentResult = (): AnalysisResult | null => {
    // 如果没有选中样本或没有分析结果，返回null
    if (selectedSample.length === 0 || analysisResults.size === 0) return null;
    // 获取排序后的选中样本ID
    const sortedIds = [...selectedSample].sort((a, b) => a - b);
    // 检查当前索引是否有效
    if (currentResultIndex >= sortedIds.length) return null;
    // 获取当前索引对应的样本ID
    const currentId = sortedIds[currentResultIndex];
    // 从本地分析结果Map中获取结果，如果不存在则返回null
    return analysisResults.get(currentId) || null;
  };

  /**
   * 检查是否存在上一个有效的分析结果 (用于禁用“上一个”按钮)
   * @returns boolean
   */
  const hasPreviousResult = (): boolean => {
    // 如果当前是第一个结果，肯定没有上一个
    if (currentResultIndex <= 0) return false;
    let newIndex = currentResultIndex - 1; // 从前一个索引开始检查
    const sortedIds = [...selectedSample].sort((a, b) => a - b);
    // 向前遍历，直到找到一个存在于 analysisResults 中的样本ID
    while (newIndex >= 0) {
      const sampleId = sortedIds[newIndex];
      if (analysisResults.has(sampleId)) return true; // 找到了，返回true
      newIndex--;
    }
    return false; // 遍历完都没找到，返回false
  };

  /**
   * 检查是否存在下一个有效的分析结果 (用于禁用“下一个”按钮)
   * @returns boolean
   */
  const hasNextResult = (): boolean => {
    // 如果当前是最后一个选中的样本，肯定没有下一个
    if (currentResultIndex >= selectedSample.length - 1) return false;
    let newIndex = currentResultIndex + 1; // 从后一个索引开始检查
    const sortedIds = [...selectedSample].sort((a, b) => a - b);
    // 向后遍历，直到找到一个存在于 analysisResults 中的样本ID
    while (newIndex < sortedIds.length) {
      const sampleId = sortedIds[newIndex];
      if (analysisResults.has(sampleId)) return true; // 找到了，返回true
      newIndex++;
    }
    return false; // 遍历完都没找到，返回false
  };

  /**
   * 切换到上一个有效的分析结果
   */
  const goToPreviousResult = () => {
    // 只有在当前索引大于0时才可能切换
    if (currentResultIndex > 0) {
      let newIndex = currentResultIndex - 1; // 从前一个索引开始
      const sortedIds = [...selectedSample].sort((a, b) => a - b);
      // 向前查找第一个有结果的样本索引
      while (newIndex >= 0) {
        const sampleId = sortedIds[newIndex];
        if (analysisResults.has(sampleId)) break; // 找到了就跳出循环
        newIndex--;
      }
      // 如果找到了有效的索引 (newIndex >= 0)，则更新当前结果索引
      if (newIndex >= 0) setCurrentResultIndex(newIndex);
    }
  };

  /**
   * 切换到下一个有效的分析结果
   */
  const goToNextResult = () => {
    // 只有在当前索引小于选中样本数减1时才可能切换
    if (currentResultIndex < selectedSample.length - 1) {
      let newIndex = currentResultIndex + 1; // 从后一个索引开始
      const sortedIds = [...selectedSample].sort((a, b) => a - b);
      // 向后查找第一个有结果的样本索引
      while (newIndex < sortedIds.length) {
        const sampleId = sortedIds[newIndex];
        if (analysisResults.has(sampleId)) break; // 找到了就跳出循环
        newIndex++;
      }
      // 如果找到了有效的索引 (newIndex < sortedIds.length)，则更新当前结果索引
      if (newIndex < sortedIds.length) setCurrentResultIndex(newIndex);
    }
  };

  // --- Helper Functions for UI Display ---

  /**
   * 获取当前结果导航器所指向的样本的原始文本
   * @returns 样本文本或空字符串
   */
  const getCurrentSampleText = (): string => {
    // 如果没有选中样本，返回空
    if (selectedSample.length === 0) return "";
    const sortedIds = [...selectedSample].sort((a, b) => a - b);
    // 检查索引有效性
    if (currentResultIndex >= sortedIds.length) return "";
    // 获取当前索引对应的样本ID
    const currentId = sortedIds[currentResultIndex];
    // 在Redux的样本列表中查找该样本
    const sample = samples.find((s: TestSample) => s.id === currentId);
    // 返回样本的文本，如果找不到则返回空字符串
    console.log("getCurrentSampleText called", sample);
    return sample ? sample.text : "";
  };

  /**
   * 获取当前 *待测试* 的样本的文本 (即下一个要播放或等待输入的样本)
   * @returns 样本文本或空字符串
   */
  const getCurrentTestSampleText = (): string => {
    // 如果没有选中样本，返回空
    if (selectedSample.length === 0) return "";
    const sortedSampleIds = [...selectedSample].sort((a, b) => a - b);
    // 获取已完成分析的数量
    const completedCount = analysisResults.size;
    // 如果所有样本都已完成，返回空
    if (completedCount >= sortedSampleIds.length) return "";
    // 获取下一个待测试的样本ID
    const nextSampleId = sortedSampleIds[completedCount];
    // 在Redux的样本列表中查找该样本
    const nextSample = samples.find((s: TestSample) => s.id === nextSampleId);
    // 返回样本的文本，如果找不到则返回空字符串
    return nextSample ? nextSample.text : "";
  };

  // --- Return Value ---
  // 返回包含所有状态和方法的对象，供UI组件使用
  return {
    selectedSample, // 当前任务选中的样本ID列表 (来自Redux)
    setSelectedSample: setSelectedSampleIds, // 设置选中样本的函数 (调用Redux action)
    handleDeleteSample, // 删除样本的函数 (调用Redux action)
    machineResponse, // 车机响应输入框的当前值 (本地状态)
    setMachineResponse, // 更新车机响应输入框值的函数 (更新本地状态)
    loading, // 是否正在加载 (分析中) (本地状态)
    error, // 错误信息 (本地状态)
    taskProgress, // 任务进度对象 (本地状态)
    progressName, // 当前进度名称 (本地状态)
    isPlaying, // 是否正在播放音频 (本地状态，同步自MachineResponse组件)
    isRecording, // 是否正在录音 (本地状态，同步自MachineResponse组件)
    machineResponseRef, // MachineResponse组件的引用
    handleStartAutomatedTest, // 开始自动化测试（播放音频）的函数
    handleAnalysis, // 处理分析提交的函数
    runAutomatedTest, // 运行自动化测试流程的主函数
    getCurrentResult, // 获取当前显示的结果对象的函数
    hasPreviousResult, // 是否有上一个结果的函数
    hasNextResult, // 是否有下一个结果的函数
    goToPreviousResult, // 切换到上一个结果的函数
    goToNextResult, // 切换到下一个结果的函数
    getCurrentSampleText, // 获取当前结果导航器对应样本的文本
    getCurrentTestSampleText, // 获取当前待测试样本的文本
  };
}
