"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";
import { NavTabs } from "./nav-tabs";
import { TestSamples } from "./test-samples";
import { AnalysisResults } from "./analysis-results";
import { MachineResponse } from "./machine-response";
import { submitForAnalysis, fetchTestSamples } from "@/services/api";
import type { AnalysisResult, TestSample } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";
import { ProgressBar } from "./progress-bar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function LLMAnalysisInterface() {
  const [samples, setSamples] = useState<TestSample[]>([]);
  const [selectedSample, setSelectedSample] = useState<number[]>([]);
  const [machineResponse, setMachineResponse] = useState("");
  const [analysisResults, setAnalysisResults] = useState<
    Map<number, AnalysisResult>
  >(new Map());
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [taskProgress, setTaskProgress] = useState({
    value: 0,
    current: 0,
    total: 0,
  });

  useEffect(() => {
    // 加载测试样本
    const loadSamples = async () => {
      const data = await fetchTestSamples();
      setSamples(data);
    };
    loadSamples();
  }, []);

  // 按照ID排序处理多个样本
  const handleAnalysis = async () => {
    if (!machineResponse.trim()) {
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

      // 按照ID排序选中的样本
      const sortedSampleIds = [...selectedSample].sort((a, b) => a - b);

      // 获取当前要测试的样本ID（已完成的测试数量对应的索引）
      const completedCount = analysisResults.size;

      // 如果所有样本都已测试完成，提示用户
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

      // 检查当前样本是否已经测试过
      if (analysisResults.has(currentSampleId)) {
        toast({
          title: "样本已测试",
          description: "当前样本已经测试过，请选择其他样本",
          variant: "default",
        });
        setLoading(false);
        return;
      }

      // 更新进度信息
      setTaskProgress({
        value: Math.round((completedCount / totalCount) * 100),
        current: completedCount + 1,
        total: totalCount,
      });

      // 使用当前样本进行分析
      const sample = samples.find((s) => s.id === currentSampleId);
      if (!sample) {
        throw new Error("未找到选中的测试样本");
      }

      const result = await submitForAnalysis(sample.text, machineResponse);

      // 保存结果到Map中
      const newResults = new Map(analysisResults);
      newResults.set(currentSampleId, result);
      setAnalysisResults(newResults);

      // 设置当前查看的结果索引为最新的结果
      const newIndex = sortedSampleIds.findIndex(
        (id) => id === currentSampleId
      );
      setCurrentResultIndex(newIndex >= 0 ? newIndex : 0);

      // 更新进度
      const newCompletedCount = newResults.size;
      setTaskProgress({
        value: Math.round((newCompletedCount / totalCount) * 100),
        current: newCompletedCount,
        total: totalCount,
      });

      // 使用新的结果格式显示通知
      toast({
        title: "分析完成",
        description: `测评结果: ${
          result.assessment.valid ? "通过" : "不通过"
        } (${Math.round(result.assessment.overall_score * 100)}%)`,
        variant: result.assessment.valid ? "default" : "destructive",
      });

      // 清空机器响应，准备下一条测试
      setMachineResponse("");

      // 如果还有未测试的样本，提示用户输入下一条响应
      if (newCompletedCount < totalCount) {
        // 获取下一个要测试的样本
        const nextSampleId = sortedSampleIds[newCompletedCount];
        const nextSample = samples.find((s) => s.id === nextSampleId);

        if (nextSample) {
          toast({
            title: "请输入下一条响应",
            description: `请为指令"${nextSample.text}"输入车机响应`,
            variant: "default",
          });
        }
      } else {
        // 所有样本都已测试完成
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
      // 不再需要从队列中移除已测试的样本，因为我们现在使用analysisResults来跟踪哪些样本已经被测试
    }
  };

  // 当选择新的测试样本时，重置错误状态
  useEffect(() => {
    setError(null);
  }, [selectedSample]);

  // 获取当前显示的分析结果
  const getCurrentResult = (): AnalysisResult | null => {
    if (selectedSample.length === 0 || analysisResults.size === 0) return null;

    const sortedIds = [...selectedSample].sort((a, b) => a - b);
    if (currentResultIndex >= sortedIds.length) return null;

    const currentId = sortedIds[currentResultIndex];
    return analysisResults.get(currentId) || null;
  };

  // 检查是否有前一个结果
  const hasPreviousResult = (): boolean => {
    if (currentResultIndex <= 0) return false;

    // 找到前一个已分析的结果
    let newIndex = currentResultIndex - 1;
    const sortedIds = [...selectedSample].sort((a, b) => a - b);

    // 确保新索引对应的样本已经被分析过
    while (newIndex >= 0) {
      const sampleId = sortedIds[newIndex];
      if (analysisResults.has(sampleId)) {
        return true;
      }
      newIndex--;
    }

    return false;
  };

  // 检查是否有下一个结果
  const hasNextResult = (): boolean => {
    if (currentResultIndex >= selectedSample.length - 1) return false;

    // 找到下一个已分析的结果
    let newIndex = currentResultIndex + 1;
    const sortedIds = [...selectedSample].sort((a, b) => a - b);

    // 确保新索引对应的样本已经被分析过
    while (newIndex < sortedIds.length) {
      const sampleId = sortedIds[newIndex];
      if (analysisResults.has(sampleId)) {
        return true;
      }
      newIndex++;
    }

    return false;
  };

  // 切换到上一个结果
  const goToPreviousResult = () => {
    if (currentResultIndex > 0) {
      // 找到前一个已分析的结果
      let newIndex = currentResultIndex - 1;
      const sortedIds = [...selectedSample].sort((a, b) => a - b);

      // 确保新索引对应的样本已经被分析过
      while (newIndex >= 0) {
        const sampleId = sortedIds[newIndex];
        if (analysisResults.has(sampleId)) {
          break;
        }
        newIndex--;
      }

      if (newIndex >= 0) {
        setCurrentResultIndex(newIndex);
      }
    }
  };

  // 切换到下一个结果
  const goToNextResult = () => {
    if (currentResultIndex < selectedSample.length - 1) {
      // 找到下一个已分析的结果
      let newIndex = currentResultIndex + 1;
      const sortedIds = [...selectedSample].sort((a, b) => a - b);

      // 确保新索引对应的样本已经被分析过
      while (newIndex < sortedIds.length) {
        const sampleId = sortedIds[newIndex];
        if (analysisResults.has(sampleId)) {
          break;
        }
        newIndex++;
      }

      if (newIndex < sortedIds.length) {
        setCurrentResultIndex(newIndex);
      }
    }
  };

  // 获取当前显示的样本文本（用于结果显示）
  const getCurrentSampleText = (): string => {
    if (selectedSample.length === 0) return "";

    const sortedIds = [...selectedSample].sort((a, b) => a - b);
    if (currentResultIndex >= sortedIds.length) return "";

    const currentId = sortedIds[currentResultIndex];
    const sample = samples.find((s) => s.id === currentId);
    return sample ? sample.text : "";
  };

  // 获取当前要测试的样本文本（用于输入响应）
  const getCurrentTestSampleText = (): string => {
    if (selectedSample.length === 0) return "";

    // 按照ID排序选中的样本
    const sortedSampleIds = [...selectedSample].sort((a, b) => a - b);

    // 获取已完成的测试数量
    const completedCount = analysisResults.size;

    // 如果所有样本都已测试完成，返回空字符串
    if (completedCount >= sortedSampleIds.length) return "";

    // 获取下一个要测试的样本ID
    const nextSampleId = sortedSampleIds[completedCount];
    const nextSample = samples.find((s) => s.id === nextSampleId);

    return nextSample ? nextSample.text : "";
  };

  return (
    <div className="flex flex-col w-full max-h-screen">
      {/* Header with logo and title */}
      <header className="bg-background p-3 flex items-center justify-between shadow-sm">
        <div className="flex-1"></div>
        <div className="flex items-center space-x-3">
          <div className="h-8 relative">
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WechatIMG141.jpg-5GyOuwpCpXccaTWId1io6GfGROhdlY.png"
              alt="CNTARC Logo"
              width={200}
              height={32}
              className="object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-wide text-primary drop-shadow-sm">
            语音交互大模型分析
          </h1>
        </div>
        <div className="flex-1 flex justify-end pr-4">
          <ThemeToggle />
        </div>
      </header>

      {/* Navigation */}
      <NavTabs />

      {/* Main content */}
      <div className="flex flex-auto p-4 gap-4 h-dvh">
        <div className="flex flex-col w-1/2 gap-4 h-full">
          <div className="flex-auto">
            <TestSamples
              samples={samples}
              onSamples={setSamples}
              selectedSample={selectedSample}
              onSelectSample={setSelectedSample}
              onDeleteSample={(id) =>
                setSamples(samples.filter((s) => s.id !== id))
              }
            />
          </div>
          <div className="flex-auto h-full">
            <MachineResponse
              value={machineResponse}
              onChange={setMachineResponse}
              onSubmit={handleAnalysis}
              isAnalyzing={loading}
              currentSampleText={getCurrentTestSampleText()}
            />
          </div>
        </div>
        <div className="flex flex-col w-1/2 gap-y-2">
          <div className="flex-none">
            <ProgressBar
              progress={taskProgress}
              samplelength={selectedSample.length}
            />
          </div>
          <div className="flex-1">
            {/* 添加结果导航按钮 */}
            <div className="flex flex-auto items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousResult}
                  disabled={!hasPreviousResult()}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一条
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextResult}
                  disabled={!hasNextResult()}
                >
                  下一条
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedSample.length > 0 && (
                  <>
                    该结果的指令:{" "}
                    <span className="font-medium">
                      {getCurrentSampleText()}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex-auto h-full overflow-auto">
              <AnalysisResults
                result={getCurrentResult()}
                loading={loading}
                error={error}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
