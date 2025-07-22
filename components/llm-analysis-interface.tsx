"use client";
import { TestSamples } from "./test-samples";
import { AnalysisResults } from "./analysis-results";
import { MachineResponse } from "./machine-response";
import { ProgressBar } from "./progress-bar";
import { useLLMAnalysis } from "@/hooks/useLLMAnalysis";
import { useEffect } from "react"; // Removed useState as showExportDialog is not used
import { store } from "@/store";
import { setCurrentTask } from "@/store/taskSlice";
import { useAppDispatch } from "@/store/hooks";
import { tauriGetCurrentTask } from "@/services/tauri-analysis-api"; // Removed tauriSetCurrentTask
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
    handleStartAutomatedTest, // This is the name returned by the hook now
    handleAnalysis,         // This is the name returned by the hook now
    getCurrentResult,
    hasPreviousResult,
    hasNextResult,
    goToPreviousResult,
    goToNextResult,
    getCurrentSampleText,
    getCurrentTestSampleText,
    selectedSample,
    // handleDeleteSample, // This was from the hook, ensure it's used if needed or remove
  } = useLLMAnalysis();

  // const params = useParams(); // Removed
  // const Id = params.Id; // Removed
  // const status = store.getState().tasks.status; // We'll fetch directly, so Redux status less critical here
  const currentReduxTask = store.getState().tasks.currentTask; // Still useful for comparison
  const dispatch = useAppDispatch();

  useEffect(() => {
    // const taskIdFromParam = Id ? parseInt(Id as string) : null; // Removed

    // if (taskIdFromParam !== null) { // Removed condition based on URL param
      // console.log("LLMAnalysisInterface: Attempting to set and fetch task for ID:", taskIdFromParam); // Removed
      
      const manageTaskLoading = async () => {
        try {
          // await tauriSetCurrentTask(taskIdFromParam); // Removed call to set task
          // console.log("LLMAnalysisInterface: Backend current task ID set to", taskIdFromParam); // Removed
          
          console.log("LLMAnalysisInterface: Attempting to fetch current task from backend...");
          const taskFromBackend = await tauriGetCurrentTask();
          console.log("LLMAnalysisInterface: Fetched current task from backend:", taskFromBackend);

          if (taskFromBackend) {
            // Ensure the fetched task ID matches the param ID, as backend's current task might differ // Comment irrelevant now
            // if set_current_task failed silently or another process changed it. // Comment irrelevant now
            // However, get_current_task should reflect what was just set by set_current_task. // Comment irrelevant now
            // if (taskFromBackend.id === taskIdFromParam) { // Removed condition based on URL param
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
            // } else { // Removed else block for ID mismatch
              // console.error(`LLMAnalysisInterface: Fetched task ID ${taskFromBackend.id} does not match param ID ${taskIdFromParam}.`);
              // Handle this discrepancy, e.g. by clearing current task or showing error
            // }
          } else {
            console.error("LLMAnalysisInterface: No current task returned from backend.");
            // Potentially clear current task in Redux if it's stale
            // if (currentReduxTask && currentReduxTask.id === taskIdFromParam) { // taskIdFromParam removed
            //   // dispatch(setCurrentTask(null)); // Or an appropriate action to clear/indicate error
            // }
          }
        } catch (error) {
          console.error("LLMAnalysisInterface: Error getting current task from backend:", error);
          // Handle error, e.g., show a toast or set an error state
        }
      };

      manageTaskLoading();
    // } // Removed closing bracket for URL param condition
  }, [dispatch, currentReduxTask]); // Depend on dispatch and currentReduxTask

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header section commented out, can be restored if needed */}
      <div className="grid grid-cols-3 p-6 gap-6 bg-background h-full flex-1 overflow-hidden">
        <div className="row-span-3 row-start-1 col-start-1 col-span-2 overflow-hidden">
          <OCRPage />
        </div>
        <div className="row-start-1 col-start-3 overflow-hidden">
          <ProgressBar
            progressname={progressName}
            samplelength={selectedSample.length}
            onStartAutomatedTest={handleStartAutomatedTest} // Use the correct function from the hook
            isPlaying={isPlaying}
            isRecording={isRecording}
            isAnalyzing={loading}
            disabled={selectedSample.length === 0}
            goToPreviousResult={goToPreviousResult}
            hasPreviousResult={hasPreviousResult} // Pass function reference
            goToNextResult={goToNextResult}
            hasNextResult={hasNextResult}     // Pass function reference
          />
        </div>
        <div className="row-start-4 col-start-1 col-span-2 overflow-hidden">
          <MachineResponse
            ref={machineResponseRef}
            value={machineResponse}
            onChange={setMachineResponse}
            onSubmit={handleAnalysis} // Use the correct function from the hook
            isAnalyzing={loading}
            currentSampleText={getCurrentTestSampleText()}
          />
        </div>
        
        <div className="row-span-3 col-start-3 overflow-hidden">
          <div className="flex-1 h-full overflow-hidden">
            <AnalysisResults
              error={error}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
