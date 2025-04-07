import { useState, useEffect, useRef } from "react";
import { submitForAnalysis, fetchTestSamples } from "@/services/api";
import type { AnalysisResult, TestSample } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";
import { MachineResponseHandle } from "@/components/machine-response";

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
  // 测试样本相关状态
  const [samples, setSamples] = useState<TestSample[]>([]); // 所有测试样本
  const [selectedSample, setSelectedSample] = useState<number[]>([]); // 选中的样本ID数组
  
  // 机器响应相关状态
  const [machineResponse, setMachineResponse] = useState(""); // 当前输入的机器响应文本
  const machineResponseRef = useRef<MachineResponseHandle>(null); // 机器响应组件引用
  
  // 分析结果相关状态
  const [analysisResults, setAnalysisResults] = useState<Map<number, AnalysisResult>>(new Map()); // 分析结果映射表
  const [currentResultIndex, setCurrentResultIndex] = useState(0); // 当前查看的结果索引
  
  // 进度和状态相关
  const [loading, setLoading] = useState(false); // 是否正在加载
  const [error, setError] = useState<string | null>(null); // 错误信息
  const { toast } = useToast(); // toast通知
  
  // 任务进度
  const [taskProgress, setTaskProgress] = useState({
    value: 0, // 进度百分比
    current: 0, // 当前测试的样本序号
    total: 0, // 总样本数
  });
  
  // 播放控制相关状态
  const [autoPlayNext, setAutoPlayNext] = useState(true); // 是否自动播放下一条
  const [isPlaying, setIsPlaying] = useState(false); // 是否正在播放音频
  const [isRecording, setIsRecording] = useState(false); // 是否正在录音
  const isPlayingNextRef = useRef<boolean>(false); // 防止重复播放的标记

  // 监听机器响应组件的播放和录音状态变化
  useEffect(() => {
    if (machineResponseRef.current) {
      setIsPlaying(machineResponseRef.current.isPlaying || false);
      setIsRecording(machineResponseRef.current.isRecording || false);
    }
  }, [
    machineResponseRef.current?.isPlaying,
    machineResponseRef.current?.isRecording,
  ]);

  // 初始化加载测试样本
  useEffect(() => {
    const loadSamples = async () => {
      const data = await fetchTestSamples();
      setSamples(data);
    };
    loadSamples();
  }, []);

  /**
   * 自动播放下一条测试样本
   * @param sortedSampleIds 排序后的样本ID数组
   * @param completedCount 已完成的测试数量
   */
  const playNextSample = (sortedSampleIds: number[], completedCount: number) => {
    if (completedCount >= sortedSampleIds.length) return;
    
    const nextSampleId = sortedSampleIds[completedCount];
    const nextSample = samples.find((s) => s.id === nextSampleId);
    
    if (nextSample && autoPlayNext && machineResponseRef.current && !isPlayingNextRef.current) {
      isPlayingNextRef.current = true;
      setTimeout(() => {
        if (machineResponseRef.current?.playCurrentSampleAudio) {
          machineResponseRef.current.playCurrentSampleAudio();
          setTimeout(() => {
            isPlayingNextRef.current = false;
          }, 2000);
        } else {
          isPlayingNextRef.current = false;
        }
      }, 2000);
      
      toast({
        title: "自动播放下一条",
        description: `正在处理指令: "${nextSample.text}"`,
        variant: "default",
      });
    } else if (nextSample) {
      toast({
        title: "请输入下一条响应",
        description: `请为指令"${nextSample.text}"输入车机响应`,
        variant: "default",
      });
    }
  };

  /**
   * 处理开始自动化测试按钮点击
   * 触发当前选中样本的音频播放
   */
  const handleStartAutomatedTest = () => {
    if (
      machineResponseRef.current &&
      machineResponseRef.current.playCurrentSampleAudio &&
      !isPlayingNextRef.current
    ) {
      isPlayingNextRef.current = true;
      machineResponseRef.current.playCurrentSampleAudio();
      setTimeout(() => {
        isPlayingNextRef.current = false;
      }, 2000);
    }
  };

  /**
   * 运行自动化测试流程
   * 整合了开始测试、分析提交和自动播放下一条的逻辑
   * @param initialResponse 可选的初始响应文本
   */
  const runAutomatedTest = async (initialResponse?: string) => {
    // 如果提供了初始响应，直接进行分析
    if (initialResponse) {
      await handleAnalysis(initialResponse);
      return;
    }
    
    // 否则，开始播放当前样本音频
    if (selectedSample.length === 0) {
      toast({
        title: "请选择测试样本",
        description: "请先选择一个测试样本进行分析",
        variant: "destructive",
      });
      return;
    }
    
    // 检查是否已完成所有测试
    const sortedSampleIds = [...selectedSample].sort((a, b) => a - b);
    const completedCount = analysisResults.size;
    
    if (completedCount >= sortedSampleIds.length) {
      toast({
        title: "测试已完成",
        description: "所有选中的样本都已测试完成",
        variant: "default",
      });
      return;
    }
    
    // 开始播放音频
    handleStartAutomatedTest();
  };

  /**
   * 处理分析提交
   * @param overrideResponse 可选的覆盖响应文本，如果提供则使用此文本而非当前状态中的响应
   */
  const handleAnalysis = async (overrideResponse?: string) => {
    const responseToSubmit = overrideResponse || machineResponse;

    if (!responseToSubmit.trim()) {
      toast({
        title: "请输入车机响应",
        description: "车机响应不能为空",
        variant: "destructive",
      });
      return;
    }

    if (selectedSample.length === 0) {
      toast({
        title: "请选择测试样本",
        description: "请先选择一个测试样本进行分析",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const sortedSampleIds = [...selectedSample].sort((a, b) => a - b);
      const completedCount = analysisResults.size;

      if (completedCount >= sortedSampleIds.length) {
        toast({
          title: "测试已完成",
          description: "所有选中的样本都已测试完成",
          variant: "default",
        });
        setLoading(false);
        return;
      }

      const currentSampleId = sortedSampleIds[completedCount];
      const totalCount = sortedSampleIds.length;

      if (analysisResults.has(currentSampleId)) {
        toast({
          title: "样本已测试",
          description: "当前样本已经测试过，请选择其他样本",
          variant: "default",
        });
        setLoading(false);
        return;
      }

      setTaskProgress({
        value: Math.round((completedCount / totalCount) * 100),
        current: completedCount + 1,
        total: totalCount,
      });

      const sample = samples.find((s) => s.id === currentSampleId);
      if (!sample) throw new Error("未找到选中的测试样本");

      const result = await submitForAnalysis(sample.text, responseToSubmit);

      const newResults = new Map(analysisResults);
      newResults.set(currentSampleId, result);
      setAnalysisResults(newResults);

      //更新samples中result字段
      const newSamples = samples.map(sample => 
        sample.id === currentSampleId 
          ? { ...sample, result: result.assessment.valid ? 'pass' : 'fail' }
          : sample
      );
      setSamples(newSamples);

      const newIndex = sortedSampleIds.findIndex((id) => id === currentSampleId);
      setCurrentResultIndex(newIndex >= 0 ? newIndex : 0);

      const newCompletedCount = newResults.size;
      setTaskProgress({
        value: Math.round((newCompletedCount / totalCount) * 100),
        current: newCompletedCount,
        total: totalCount,
      });

      toast({
        title: "分析完成",
        description: `测评结果: ${result.assessment.valid ? "通过" : "不通过"} (${Math.round(result.assessment.overall_score * 100)}%)`,
        variant: result.assessment.valid ? "default" : "destructive",
      });

      setMachineResponse("");

      if (newCompletedCount < totalCount) {
        playNextSample(sortedSampleIds, newCompletedCount);
      } else {
        toast({
          title: "测试完成",
          description: `所有${totalCount}条测试样本已完成分析`,
          variant: "default",
        });
      }
    } catch (err) {
      setError("分析失败，请重试");
      toast({
        title: "分析失败",
        description: "无法获取分析结果，请重试",
        variant: "destructive",
      });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 当选择新的测试样本时，重置错误状态
  useEffect(() => {
    setError(null);
  }, [selectedSample]);

  /**
   * 获取当前显示的分析结果
   * @returns 当前结果对象或null
   */
  const getCurrentResult = (): AnalysisResult | null => {
    if (selectedSample.length === 0 || analysisResults.size === 0) return null;
    const sortedIds = [...selectedSample].sort((a, b) => a - b);
    if (currentResultIndex >= sortedIds.length) return null;
    const currentId = sortedIds[currentResultIndex];
    return analysisResults.get(currentId) || null;
  };

  /**
   * 检查是否有前一个结果可查看
   * @returns 是否有前一个结果
   */
  const hasPreviousResult = (): boolean => {
    if (currentResultIndex <= 0) return false;
    let newIndex = currentResultIndex - 1;
    const sortedIds = [...selectedSample].sort((a, b) => a - b);
    while (newIndex >= 0) {
      const sampleId = sortedIds[newIndex];
      if (analysisResults.has(sampleId)) return true;
      newIndex--;
    }
    return false;
  };

  /**
   * 检查是否有下一个结果可查看
   * @returns 是否有下一个结果
   */
  const hasNextResult = (): boolean => {
    if (currentResultIndex >= selectedSample.length - 1) return false;
    let newIndex = currentResultIndex + 1;
    const sortedIds = [...selectedSample].sort((a, b) => a - b);
    while (newIndex < sortedIds.length) {
      const sampleId = sortedIds[newIndex];
      if (analysisResults.has(sampleId)) return true;
      newIndex++;
    }
    return false;
  };

  /**
   * 切换到上一个结果
   */
  const goToPreviousResult = () => {
    if (currentResultIndex > 0) {
      let newIndex = currentResultIndex - 1;
      const sortedIds = [...selectedSample].sort((a, b) => a - b);
      while (newIndex >= 0) {
        const sampleId = sortedIds[newIndex];
        if (analysisResults.has(sampleId)) break;
        newIndex--;
      }
      if (newIndex >= 0) setCurrentResultIndex(newIndex);
    }
  };

  /**
   * 切换到下一个结果
   */
  const goToNextResult = () => {
    if (currentResultIndex < selectedSample.length - 1) {
      let newIndex = currentResultIndex + 1;
      const sortedIds = [...selectedSample].sort((a, b) => a - b);
      while (newIndex < sortedIds.length) {
        const sampleId = sortedIds[newIndex];
        if (analysisResults.has(sampleId)) break;
        newIndex++;
      }
      if (newIndex < sortedIds.length) setCurrentResultIndex(newIndex);
    }
  };

  /**
   * 获取当前显示结果对应的样本文本
   * @returns 样本文本或空字符串
   */
  const getCurrentSampleText = (): string => {
    if (selectedSample.length === 0) return "";
    const sortedIds = [...selectedSample].sort((a, b) => a - b);
    if (currentResultIndex >= sortedIds.length) return "";
    const currentId = sortedIds[currentResultIndex];
    const sample = samples.find((s) => s.id === currentId);
    return sample ? sample.text : "";
  };

  /**
   * 获取当前要测试的样本文本（用于输入响应）
   * @returns 样本文本或空字符串
   */
  const getCurrentTestSampleText = (): string => {
    if (selectedSample.length === 0) return "";
    const sortedSampleIds = [...selectedSample].sort((a, b) => a - b);
    const completedCount = analysisResults.size;
    if (completedCount >= sortedSampleIds.length) return "";
    const nextSampleId = sortedSampleIds[completedCount];
    const nextSample = samples.find((s) => s.id === nextSampleId);
    return nextSample ? nextSample.text : "";
  };

  return {
    samples,
    setSamples,
    selectedSample,
    setSelectedSample,
    machineResponse,
    setMachineResponse,
    loading,
    error,
    taskProgress,
    isPlaying,
    isRecording,
    machineResponseRef,
    handleStartAutomatedTest,
    handleAnalysis,
    runAutomatedTest,
    getCurrentResult,
    hasPreviousResult,
    hasNextResult,
    goToPreviousResult,
    goToNextResult,
    getCurrentSampleText,
    getCurrentTestSampleText,
  };
}
