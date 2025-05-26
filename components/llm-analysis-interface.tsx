"use client";
import { TestSamples } from "./test-samples";
import { AnalysisResults } from "./analysis-results";
import { MachineResponse } from "./machine-response";
import { ProgressBar } from "./progress-bar";
import { useLLMAnalysis } from "@/hooks/useLLMAnalysis";
import { useEffect, useState } from "react";
import { store } from "@/store";
import CV from "./custom/cv";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { selectTasksStatus, setCurrentTask } from "@/store/taskSlice";
import { useAppDispatch } from "@/store/hooks";
import { Button } from "./ui/button";
import { ArrowLeft, Download, Save } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import Link from "next/link";
import OCRPage from "./ocr";

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
  const status = store.getState().tasks.status;
  const currentTask = store.getState().tasks.currentTask;
  // 获取Redux dispatch函数，用于派发actions
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (Id && status === "succeeded") {
      console.log("当前任务ID:", Id);
      const taskId = parseInt(Id as string);

      const selectedTask = store
        .getState()
        .tasks.items.find((task) => task.id === taskId);

      if (status === "succeeded") {
        if (!selectedTask) {
          console.error("未找到对应任务");
          return;
        }
      }
      !currentTask && dispatch(setCurrentTask(selectedTask));

      return;
    }
  }, [Id, status]);

  return (
    <div className="w-full max-h-full ">
      {/* <div className="flex flex-col gap-4 px-6 pt-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/taskmanage">
              <Button variant="outline" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h2 className="text-3xl font-bold tracking-tight">
              {currentTask?.name}
            </h2>
          </div>
        </div>
        <div className="flex gap-2">
          <AlertDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
          >
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                导出结果
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>导出测试结果</AlertDialogTitle>
                <AlertDialogDescription>
                  请选择导出格式：
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <Button
                  variant="outline"
                  onClick={() => setShowExportDialog(false)}
                >
                  导出为Excel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowExportDialog(false)}
                >
                  导出为PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowExportDialog(false)}
                >
                  导出为CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowExportDialog(false)}
                >
                  导出为JSON
                </Button>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button className="gap-2">
            <Save className="h-4 w-4" />
            保存结果
          </Button>
        </div>
      </div> */}
      {/* Main content */}
      <div className="grid grid-cols-2 px-6 pt-4 gap-4 h-full">
        <div className="row-span-3 row-start-1 col-start-1">
          {/* <TestSamples
              initialPageSize={4}
              onDeleteSample={handleDeleteSample}
            /> */}
          {/* <CV /> */}
          <OCRPage />
        </div>
        <div className="row-start-1 col-start-2">
          <ProgressBar
            progress={taskProgress}
            progressname={progressName}
            samplelength={selectedSample.length}
            onStartAutomatedTest={handleStartAutomatedTest}
            isPlaying={isPlaying}
            isRecording={isRecording}
            isAnalyzing={loading}
            disabled={selectedSample.length === 0}
            goToPreviousResult={goToPreviousResult}
            hasPreviousResult={hasPreviousResult}
            goToNextResult={goToNextResult}
            hasNextResult={hasNextResult}
          />
        </div>
        <div className="row-start-4 col-start-1">
          <MachineResponse
            ref={machineResponseRef}
            value={machineResponse}
            onChange={setMachineResponse}
            onSubmit={handleAnalysis}
            isAnalyzing={loading}
            currentSampleText={getCurrentTestSampleText()}
          />
        </div>
        
        <div className="row-span-3">
          {/* 添加结果导航按钮 */}
          <div className="flex flex-none items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedSample.length > 0 && (
                <>
                  该结果的指令:{" "}
                  <span className="font-medium">{getCurrentSampleText()}</span>
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
  );
}
