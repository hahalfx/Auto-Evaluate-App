"use client";
import { ProgressBar } from "./progress-bar";
import { useLLMAnalysis } from "@/hooks/useLLMAnalysis";
import { useEffect, useState } from "react";
import { store } from "@/store";
import { setCurrentTask } from "@/store/taskSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { tauriGetCurrentTask } from "@/services/tauri-analysis-api";
import OCRPage, { VisualWakeConfig } from "./ocr";

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
  } = useLLMAnalysis();

  const currentReduxTask = store.getState().tasks.currentTask;
  const dispatch = useAppDispatch();
  const [visualWakeConfig, setVisualWakeConfig] = useState<VisualWakeConfig>({
    templateData: [],
    frameRate: 10,
    threshold: 0.5,
    maxDetectionTime: 5,
    maxDetectionTimeSecs: 5,
  });

  useEffect(() => {
    const manageTaskLoading = async () => {
      try {
        console.log("LLMAnalysisInterface: Attempting to fetch current task from backend...");
        const taskFromBackend = await tauriGetCurrentTask();
        console.log("LLMAnalysisInterface: Fetched current task from backend:", taskFromBackend);

        if (taskFromBackend) {
          // Check if Redux needs update
          if (!currentReduxTask || currentReduxTask.id !== taskFromBackend.id) {
            // The fetched task is of type TauriTask. We need to ensure it's compatible
            // with what setCurrentTask action expects (likely types/api.ts Task).
            // For now, assuming they are compatible or will be made compatible.
            // If not, a mapping function would be needed here.
            dispatch(setCurrentTask(taskFromBackend as any)); // Use 'as any' for now if types differ slightly
            console.log("LLMAnalysisInterface: Dispatched setCurrentTask with task from backend", taskFromBackend);
          } else {
            console.log("LLMAnalysisInterface: Redux task already up-to-date with backend task.");
          }
        } else {
          console.error("LLMAnalysisInterface: No current task returned from backend.");
        }
      } catch (error) {
        console.error("LLMAnalysisInterface: Error getting current task from backend:", error);
        // Handle error, e.g., show a toast or set an error state
      }
    };

    manageTaskLoading();
  }, [dispatch, currentReduxTask]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header section commented out, can be restored if needed */}
      <div className="grid grid-cols-3 p-4 gap-4 bg-background h-full flex-1 overflow-hidden">
        <div className="row-span-3 row-start-1 col-start-1 col-span-2 overflow-hidden">
          <OCRPage setVisualWakeConfig={setVisualWakeConfig}/>
        </div>
        
        {/* 右侧控制面板 - 现在是一个整体 */}
        <div className="row-start-1 row-span-3 col-start-3 overflow-hidden">
          <ProgressBar
            progressname={progressName}
            samplelength={selectedSample.length}
            onStartAutomatedTest={handleStartAutomatedTest}
            visualWakeConfig={visualWakeConfig}
            isPlaying={isPlaying}
            isRecording={isRecording}
            isAnalyzing={loading}
            disabled={loading}
            goToPreviousResult={goToPreviousResult}
            hasPreviousResult={hasPreviousResult}
            goToNextResult={goToNextResult}
            hasNextResult={hasNextResult}
            // MachineResponse相关参数
            machineResponseValue={machineResponse}
            onMachineResponseChange={setMachineResponse}
            onMachineResponseSubmit={handleAnalysis}
            currentSampleText={getCurrentTestSampleText()}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}
