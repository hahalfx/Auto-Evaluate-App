"use client";
import { TestSamples } from "./test-samples";
import { AnalysisResults } from "./analysis-results";
import { MachineResponse } from "./machine-response";
import { ProgressBar } from "./progress-bar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SidebarTrigger } from "./ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useLLMAnalysis } from "@/hooks/useLLMAnalysis";
import { useEffect } from "react";
import { store } from "@/store";
import CV from "./custom/cv";
import { useRouter, useParams, useSearchParams } from "next/navigation";


export function LLMAnalysisInterface() {
  const {
    machineResponse,
    setMachineResponse,
    loading,
    error,
    taskProgress,
    progressName,
    isPlaying,
    isRecording,
    machineResponseRef,
    handleStartAutomatedTest,
    handleAnalysis,
    getCurrentResult,
    hasPreviousResult,
    hasNextResult,
    goToPreviousResult,
    goToNextResult,
    getCurrentSampleText,
    getCurrentTestSampleText,
    selectedSample,
    handleDeleteSample,
  } = useLLMAnalysis();

  // 动态路由获取任务ID
  const params = useParams();

  const Id = params.Id;

  useEffect(() => {
    if (Id) {
      console.log("当前任务ID:", Id);
      const taskId = parseInt(Id as string);
      const selectedTask = store
        .getState()
        .tasks.items.find((task) => task.id === taskId);
      if (!selectedTask) {
        console.error("未找到对应任务");
        return;
      }

      // 添加延迟，给音频文件加载和状态更新留出时间
      const timer = setTimeout(() => {
        // 检查任务是否处于待处理状态
        if (selectedTask.task_status === "pending") {
          handleStartAutomatedTest();
        }
      }, 1000); // 延迟1秒

      return () => clearTimeout(timer);
    }
  }, [Id]);

  return (
    <div className="flex flex-col w-full max-h-screen ">

      {/* Main content */}
      <div className="flex flex-auto p-6 gap-4 h-dvh overflow-auto">
        <div className="flex flex-col w-1/2 gap-4 h-full">
          <div className="flex-1 basis-2/3">
            {/* <TestSamples
              initialPageSize={4}
              onDeleteSample={handleDeleteSample}
            /> */}
            <CV />
          </div>
          <div className="flex-1 h-full">
            <MachineResponse
              ref={machineResponseRef}
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
              progressname={progressName}
              samplelength={selectedSample.length}
              onStartAutomatedTest={handleStartAutomatedTest}
              isPlaying={isPlaying}
              isRecording={isRecording}
              isAnalyzing={loading}
              disabled={selectedSample.length === 0}
            />
          </div>
          <div className="flex flex-col flex-1">
            {/* 添加结果导航按钮 */}
            <div className="flex flex-none items-center justify-between mb-2">
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

            <div className="flex-1 h-full overflow-auto">
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
