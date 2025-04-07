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

export function LLMAnalysisInterface() {
  const {
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
    getCurrentResult,
    hasPreviousResult,
    hasNextResult,
    goToPreviousResult,
    goToNextResult,
    getCurrentSampleText,
    getCurrentTestSampleText,
  } = useLLMAnalysis();

  return (
    <div className="flex flex-col w-full max-h-screen">
      <div className="flex items-center fixed top-0 w-full bg-white">
        <SidebarTrigger className="mx-6 my-4"/>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">主页</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/llm-analysis">语音交互大模型分析</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Main content */}
      <div className="pt-14 flex flex-auto p-6 gap-4 h-dvh">
        <div className="flex flex-col w-1/2 gap-4 h-full">
          <div className="flex-none">
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
