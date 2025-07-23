import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import { MachineResponseHandle } from "@/components/machine-response";
import {
  tauriStartAutomatedTest,
  tauriSubmitAnalysis,
  listenToProgressUpdated,
  listenToPlayAudio,
  listenToAnalysisCompleted,
  listenToTaskCompleted,
  listenToErrorOccurred,
  type AnalysisCompletedEventPayload,
  type ErrorOccurredPayload,
} from "@/services/tauri-analysis-api";
import type { AnalysisResult, TestSample, TaskProgress as TauriTaskProgressType, PlayAudioEvent, WakeWord } from "@/types/tauri";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectAllSamples,
  setSelectedSamples, // This might be re-evaluated if backend manages task samples exclusively
  updateSampleResult,
  deleteSample,
  fetchSamples,
  fetchWakeWords,
  selectWakeWords,
  selectSamplesStatus,
} from "@/store/samplesSlice";
import {
  fetchTasks,
  updateMachineResponse,
  updateTaskAsync,
  updateTaskStatus,
  updateTestResult,
} from "@/store/taskSlice";
import { store } from "@/store";
import { useAudioPlayer } from "./useAudioPlayer";
import type { Task as ApiTask, AnalysisResult as ApiAnalysisResult } from "@/types/api";
import type { Task as TauriTask, AnalysisResult as TauriAnalysisResult, LlmAnalysis as TauriLlmAnalysis } from "@/types/tauri";

// Helper function to transform Tauri AnalysisResult to API AnalysisResult
function transformTauriAnalysisResultToApi(
  tauriResult: TauriAnalysisResult
): ApiAnalysisResult {
  return {
    assessment: tauriResult.assessment,
    llmAnalysis: tauriResult.llm_analysis
      ? {
          title: tauriResult.llm_analysis.title,
          content: tauriResult.llm_analysis.content,
          context: tauriResult.llm_analysis.context,
          multiRound: tauriResult.llm_analysis.multi_round,
        }
      : undefined,
    test_time: tauriResult.test_time,
    audioFile: tauriResult.audio_file,
    recognitionFile: tauriResult.recognition_file,
    device: tauriResult.device,
    recognitionResult: tauriResult.recognition_result,
    insertionErrors: tauriResult.insertion_errors,
    deletionErrors: tauriResult.deletion_errors,
    substitutionErrors: tauriResult.substitution_errors,
    totalWords: tauriResult.total_words,
    referenceText: tauriResult.reference_text,
    recognizedText: tauriResult.recognized_text,
    resultStatus: tauriResult.result_status,
    recognitionTime: tauriResult.recognition_time,
    responseTime: tauriResult.response_time,
  };
}

// Helper function to transform Tauri Task to API Task
function transformTauriTaskToApiTask(
  tauriTask: TauriTask
): ApiTask {
  let apiTestResult: Record<number, ApiAnalysisResult> | undefined = undefined;
  if (tauriTask.test_result) {
    apiTestResult = {};
    for (const key in tauriTask.test_result) {
      if (Object.prototype.hasOwnProperty.call(tauriTask.test_result, key)) {
        const sampleId = parseInt(key, 10);
        const tauriAnalysisResult = tauriTask.test_result[key];
        if (tauriAnalysisResult) {
           apiTestResult[sampleId] = transformTauriAnalysisResultToApi(tauriAnalysisResult);
        }
      }
    }
  }

  let apiMachineResponse: Record<number, import('@/types/api').MachineResponseData> | undefined = undefined;
  if (tauriTask.machine_response) {
    apiMachineResponse = {};
    for (const key in tauriTask.machine_response) {
      if (Object.prototype.hasOwnProperty.call(tauriTask.machine_response, key)) {
        const sampleId = parseInt(key, 10);
        const machineRespData = tauriTask.machine_response[key];
        if (machineRespData) {
            apiMachineResponse[sampleId] = machineRespData as import('@/types/api').MachineResponseData;
        }
      }
    }
  }

  const apiTask: ApiTask = {
    id: tauriTask.id,
    name: tauriTask.name,
    test_samples_ids: tauriTask.test_samples_ids,
    wake_word_ids: tauriTask.wake_word_ids,
    machine_response: apiMachineResponse,
    test_result: apiTestResult,
    task_status: tauriTask.task_status,
    task_progress: tauriTask.task_progress === null ? undefined : tauriTask.task_progress,
    created_at: tauriTask.created_at,
    audioType: tauriTask.audio_type === null ? undefined : tauriTask.audio_type,
    audioFile: tauriTask.audio_file === null ? undefined : tauriTask.audio_file,
    audioDuration: tauriTask.audio_duration === null ? undefined : tauriTask.audio_duration,
    audioCategory: tauriTask.audio_category === null ? undefined : tauriTask.audio_category,
    testCollection: tauriTask.test_collection === null ? undefined : tauriTask.test_collection,
    testDuration: tauriTask.test_duration === null ? undefined : tauriTask.test_duration,
    sentenceAccuracy: tauriTask.sentence_accuracy === null ? undefined : tauriTask.sentence_accuracy,
    wordAccuracy: tauriTask.word_accuracy === null ? undefined : tauriTask.word_accuracy,
    characterErrorRate: tauriTask.character_error_rate === null ? undefined : tauriTask.character_error_rate,
    recognitionSuccessRate: tauriTask.recognition_success_rate === null ? undefined : tauriTask.recognition_success_rate,
    totalWords: tauriTask.total_words === null ? undefined : tauriTask.total_words,
    insertionErrors: tauriTask.insertion_errors === null ? undefined : tauriTask.insertion_errors,
    deletionErrors: tauriTask.deletion_errors === null ? undefined : tauriTask.deletion_errors,
    substitutionErrors: tauriTask.substitution_errors === null ? undefined : tauriTask.substitution_errors,
    fastestRecognitionTime: tauriTask.fastest_recognition_time === null ? undefined : tauriTask.fastest_recognition_time,
    slowestRecognitionTime: tauriTask.slowest_recognition_time === null ? undefined : tauriTask.slowest_recognition_time,
    averageRecognitionTime: tauriTask.average_recognition_time === null ? undefined : tauriTask.average_recognition_time,
    completedSamples: tauriTask.completed_samples === null ? undefined : tauriTask.completed_samples,
  };

  return apiTask;
}


export function useLLMAnalysis() {
  const dispatch = useAppDispatch();
  const samples = useAppSelector(selectAllSamples);
  const wakeWords = useAppSelector(selectWakeWords);
  const sampleStatus = useAppSelector(selectSamplesStatus);
  const Task = useAppSelector((state) => state.tasks.currentTask);
  const selectedSampleIdsFromTask = Task?.test_samples_ids || [];

  const [machineResponse, setMachineResponse] = useState<string>("");
  const machineResponseRef = useRef<MachineResponseHandle>(null);
  const [analysisResults, setAnalysisResults] = useState<Map<number, AnalysisResult>>(new Map());
  const [currentResultIndex, setCurrentResultIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [taskProgress, setTaskProgress] = useState<TauriTaskProgressType>({ value: 0, current: 0, total: 0 });
  const [progressName, setProgressName] = useState<string>("");
  
  const [currentPlayingSampleId, setCurrentPlayingSampleId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const isPlayingNextRef = useRef<boolean>(false);


  useEffect(() => {
    if (sampleStatus === "idle") {
      dispatch(fetchSamples());
      dispatch(fetchWakeWords());
      dispatch(fetchTasks());
    }
  }, [dispatch, sampleStatus]);

  useEffect(() => {
    setTaskProgress({ value: 0, current: 0, total: 0 });
    setProgressName("");
    setError(null);
    setAnalysisResults(new Map());
    setCurrentResultIndex(0);
    setCurrentPlayingSampleId(null);
    setIsPlaying(false);
    setIsRecording(false);
    isPlayingNextRef.current = false;
  }, [Task?.id]);

  const audioPlayer = useAudioPlayer({ // Store the whole hook result
    onPlayEnd: () => {
      console.log("Audio playback ended, starting ASR.");
      setIsPlaying(false);
      isPlayingNextRef.current = false; 
      machineResponseRef.current?.startRecording();
    },
    onPlayError: (errorMsg) => {
      setIsPlaying(false);
      isPlayingNextRef.current = false; 
      toast({ title: "Playback Error", description: errorMsg, variant: "destructive" });
    },
  });
  const { playWakeAudio, playMatchedAudio } = audioPlayer; // Destructure after initialization

  useEffect(() => {
    console.log('[useLLMAnalysis] Setting up Tauri event listeners. Task ID:', Task?.id); // Diagnostic log
    const unlistenFunctions: Array<() => void> = [];

    listenToProgressUpdated((payload) => {
      console.log("Event: progress-updated", payload);
      setTaskProgress(payload);
      setProgressName(payload.current < payload.total ? `分析中 (${payload.current}/${payload.total})` : "分析完成");
    }).then(unlisten => unlistenFunctions.push(unlisten));

    listenToPlayAudio(async (payload: PlayAudioEvent) => {
      console.log("Event: play-audio", payload);
      if (isPlayingNextRef.current) {
        console.warn("Already attempting to play, skipping new play-audio event for sample:", payload.sample_id);
        return;
      }
      isPlayingNextRef.current = true;

      setCurrentPlayingSampleId(payload.sample_id);
      const currentSampleForDisplay = samples.find(s => s.id === payload.sample_id);
      setProgressName(`播放: ${currentSampleForDisplay?.text.substring(0,20) || payload.sample_text.substring(0,20)}...`);
      setLoading(false);
      setError(null);
      setIsPlaying(true); 

      const wakeWordIdToPlay = Task?.wake_word_ids.includes(payload.wake_word_id) ? payload.wake_word_id : undefined;
      let wakeWordTextToPlay: string | undefined = undefined;

      if (wakeWordIdToPlay) {
        const foundWakeWord = wakeWords.find(ww => ww.id === wakeWordIdToPlay);
        if (foundWakeWord) {
          wakeWordTextToPlay = foundWakeWord.text;
        } else {
          console.warn("Wake word text not found for ID:", wakeWordIdToPlay);
        }
      }
      
      try {
        if (wakeWordTextToPlay) {
          await playWakeAudio(wakeWordTextToPlay, payload.sample_text);
        } else {
          await playMatchedAudio(payload.sample_text);
        }
      } catch (audioError) {
        console.error("Error during audio playback:", audioError);
        setIsPlaying(false);
        isPlayingNextRef.current = false;
        toast({ title: "Audio Playback Failed", description: String(audioError), variant: "destructive" });
      }
    }).then(unlisten => unlistenFunctions.push(unlisten));

    listenToAnalysisCompleted((payload: AnalysisCompletedEventPayload) => {
      console.log("Event: analysis-completed", payload);
      setLoading(false); 
      setMachineResponse(""); 

      const { sample_id, result } = payload;
      setAnalysisResults(prevResults => new Map(prevResults).set(sample_id, result));

      const transformedResult = transformTauriAnalysisResultToApi(result);
      const resultForDispatch = { ...transformedResult, test_time: transformedResult.test_time || new Date().toLocaleString() };

      dispatch(
        updateTestResult({
          taskId: Task?.id,
          sampleId: sample_id,
          result: resultForDispatch,
        })
      );
      dispatch(
        updateSampleResult({
          sampleId: sample_id,
          taskId: Task?.id,
          result: resultForDispatch,
        })
      );
      
      const sortedIds = [...selectedSampleIdsFromTask].sort((a, b) => a - b);
      const newIdx = sortedIds.indexOf(sample_id);
      if (newIdx !== -1) setCurrentResultIndex(newIdx);

      toast({
        title: "分析完成",
        description: `样本 ${sample_id}: ${
          result.assessment.valid ? "通过" : "不通过"
        } (${Math.round(result.assessment.overall_score * 100)}%)`,
        variant: result.assessment.valid ? "default" : "destructive",
      });
    }).then(unlisten => unlistenFunctions.push(unlisten));

    listenToTaskCompleted(() => {
      console.log("Event: task-completed");
      setLoading(false);
      setProgressName("测试全部完成");
      setCurrentPlayingSampleId(null); 
      dispatch(updateTaskStatus({ taskId: Task?.id, status: "completed" }));
      
      // Ensure newTask is correctly typed before transformation
      const rawNewTask = store.getState().tasks.currentTask as TauriTask | null; // Get it as TauriTask or null
      
      if (rawNewTask && rawNewTask.id === Task?.id) { // Ensure we are updating the same task
        const transformedTask = transformTauriTaskToApiTask(rawNewTask);
        dispatch(updateTaskAsync(transformedTask)); 
      }
      toast({
        title: "测试已全部完成",
        description: `所有样本已分析完毕。`,
        variant: "default",
      });
    }).then(unlisten => unlistenFunctions.push(unlisten));

    listenToErrorOccurred((payload: ErrorOccurredPayload) => {
      console.error("Event: error-occurred", payload);
      setLoading(false);
      setIsPlaying(false); 
      isPlayingNextRef.current = false;
      setError(payload.message);
      setProgressName("错误");
      toast({
        title: "后端错误",
        description: payload.message,
        variant: "destructive",
      });
    }).then(unlisten => {
      if (unlisten) unlistenFunctions.push(unlisten);
    });

    return () => {
      console.log('[useLLMAnalysis] Cleaning up Tauri event listeners. Task ID:', Task?.id); // Diagnostic log
      unlistenFunctions.forEach(unlisten => {
        if (typeof unlisten === 'function') {
          unlisten();
        }
      });
    };
  }, [dispatch, Task?.id, wakeWords, selectedSampleIdsFromTask, playWakeAudio, playMatchedAudio, toast, samples]);


  useEffect(() => {
    const currentRef = machineResponseRef.current;
    if (currentRef) {
      setIsRecording(currentRef.isRecording || false);
    }
  }, [machineResponseRef.current?.isRecording]);


  const setSelectedSampleIds_local = (ids: number[]) => {
    dispatch(setSelectedSamples(ids));
  };

  const handleDeleteSample_local = (id: number) => {
    dispatch(deleteSample(id));
  };

  const handleStartAutomatedTest_local = async () => {
    if (selectedSampleIdsFromTask.length === 0) {
      toast({ title: "无测试样本", description: "当前任务没有选择测试样本。", variant: "destructive" });
      return;
    }
    if (loading || isPlaying) { 
      toast({ title: "测试进行中", description: "请等待当前操作完成。", variant: "default" });
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysisResults(new Map());
    setCurrentResultIndex(0);
    setTaskProgress({ value: 0, current: 0, total: selectedSampleIdsFromTask.length });
    setProgressName("正在启动测试...");
    setCurrentPlayingSampleId(null); 

    try {
      await tauriStartAutomatedTest();
    } catch (e: any) {
      console.error("Failed to start automated test:", e);
      setError(e.message || "启动测试失败 (Tauri).");
      setLoading(false);
      setProgressName("启动失败");
      toast({ title: "测试启动失败", description: e.message || "无法通过后端启动测试。", variant: "destructive" });
    }
  };
  
  const handleAnalysis_local = async (responseOverride?: string) => {
    const responseToSubmit = responseOverride || machineResponse;

    if (!responseToSubmit.trim()) {
      toast({ title: "车机响应不能为空", variant: "destructive" });
      return;
    }
    if (currentPlayingSampleId === null) {
      toast({ title: "无当前样本", description:"没有正在测试的样本可供提交分析。", variant: "destructive" });
      return;
    }
    if (loading) { 
        toast({ title: "分析进行中", description:"请等待当前分析完成。", variant: "default" });
        return;
    }

    setLoading(true);
    setError(null);
    setProgressName(`提交分析: ${currentPlayingSampleId}`);
    
    dispatch(
      updateMachineResponse({
        taskId: Task?.id,
        sampleId: currentPlayingSampleId,
        response: { text: responseToSubmit, connected: true }, 
      })
    );

    try {
      await tauriSubmitAnalysis(currentPlayingSampleId, responseToSubmit);
    } catch (e: any) {
      console.error("Failed to submit analysis via Tauri:", e);
      setError(e.message || "提交分析失败。");
      setLoading(false); 
      setProgressName("分析提交失败");
      toast({ title: "分析提交失败", description: e.message || "无法向后端提交分析。", variant: "destructive" });
    }
  };

  const runAutomatedTest_local = async (initialResponse?: string) => {
    if (initialResponse) {
      await handleAnalysis_local(initialResponse);
    } else {
      await handleStartAutomatedTest_local();
    }
  };


  const getCurrentResult = (): AnalysisResult | null => {
    if (selectedSampleIdsFromTask.length === 0 || analysisResults.size === 0) return null;
    const sortedIds = [...selectedSampleIdsFromTask].sort((a, b) => a - b);
    if (currentResultIndex >= sortedIds.length || currentResultIndex < 0) return null; 
    const currentId = sortedIds[currentResultIndex];
    return analysisResults.get(currentId) || null;
  };

  const hasPreviousResult = (): boolean => {
    if (currentResultIndex <= 0) return false;
    const sortedIds = [...selectedSampleIdsFromTask].sort((a, b) => a - b);
    for (let i = currentResultIndex - 1; i >= 0; i--) {
      if (analysisResults.has(sortedIds[i])) return true;
    }
    return false;
  };

  const hasNextResult = (): boolean => {
    if (currentResultIndex >= selectedSampleIdsFromTask.length - 1) return false;
    const sortedIds = [...selectedSampleIdsFromTask].sort((a, b) => a - b);
    for (let i = currentResultIndex + 1; i < sortedIds.length; i++) {
      if (analysisResults.has(sortedIds[i])) return true;
    }
    return false;
  };

  const goToPreviousResult = () => {
    if (currentResultIndex > 0) {
      const sortedIds = [...selectedSampleIdsFromTask].sort((a, b) => a - b);
      for (let newIndex = currentResultIndex - 1; newIndex >= 0; newIndex--) {
        if (analysisResults.has(sortedIds[newIndex])) {
          setCurrentResultIndex(newIndex);
          return;
        }
      }
    }
  };

  const goToNextResult = () => {
    if (currentResultIndex < selectedSampleIdsFromTask.length - 1) {
      const sortedIds = [...selectedSampleIdsFromTask].sort((a, b) => a - b);
      for (let newIndex = currentResultIndex + 1; newIndex < sortedIds.length; newIndex++) {
        if (analysisResults.has(sortedIds[newIndex])) {
          setCurrentResultIndex(newIndex);
          return;
        }
      }
    }
  };

  const getCurrentSampleText = (): string => { 
    if (selectedSampleIdsFromTask.length === 0 || currentResultIndex >= selectedSampleIdsFromTask.length || currentResultIndex < 0) return "";
    const sortedIds = [...selectedSampleIdsFromTask].sort((a, b) => a - b);
    const currentId = sortedIds[currentResultIndex];
    const sample = samples.find((s: TestSample) => s.id === currentId);
    return sample ? sample.text : "";
  };

  const getCurrentTestSampleText = (): string => { 
    if (currentPlayingSampleId === null) return "";
    const sample = samples.find((s: TestSample) => s.id === currentPlayingSampleId);
    return sample ? sample.text : `样本 ID: ${currentPlayingSampleId}`;
  };

  return {
    selectedSample: selectedSampleIdsFromTask,
    setSelectedSample: setSelectedSampleIds_local,
    handleDeleteSample: handleDeleteSample_local,
    machineResponse,
    setMachineResponse,
    loading,
    error,
    taskProgress,
    progressName,
    isPlaying,
    isRecording,
    machineResponseRef,
    handleStartAutomatedTest: handleStartAutomatedTest_local,
    handleAnalysis: handleAnalysis_local,
    runAutomatedTest: runAutomatedTest_local,
    getCurrentResult,
    hasPreviousResult,
    hasNextResult,
    goToPreviousResult,
    goToNextResult,
    getCurrentSampleText,
    getCurrentTestSampleText,
  };
}
