import { useState, useEffect, useRef } from "react";
import { submitForAnalysis, fetchTestSamples } from "@/services/api";
import type { AnalysisResult, TestSample } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";
import { MachineResponseHandle } from "@/components/machine-response";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectAllSamples,
  selectSelectedSampleIds,
  setSelectedSamples,
  updateSampleResult,
  deleteSample,
} from "@/store/samplesSlice";

import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { set } from "date-fns";
import { useVoiceRecognition } from "./useVoiceRecognition";
import { start } from "repl";

// 自定义Hook，用于设置自动化测试流程

export function useAutoTest() {
  //Redux中的samples,Task状态
  const samples = useAppSelector(selectAllSamples);
  const selectedSample = useAppSelector(selectSelectedSampleIds);
  const Task = useAppSelector((state) => state.tasks.currentTask);
  const dispatch = useAppDispatch();

  // 机器响应相关状态
  const [machineResponse, setMachineResponse] = useState<string>("");

  // 分析结果相关状态
  const [analysisResults, setAnalysisResults] =
    useState<Record<number, AnalysisResult>>();
  const sampleList = Task?.test_samples_ids
  const [currentSampleIndex, setCurrentSampleIndex] = useState<number>(0);

  // 进度和状态相关
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // 任务进度
  const [taskProgress, setTaskProgress] = useState<{
    value: number;
    current: number;
    total: number;
  }>({
    value: 0,
    current: 0,
    total: 0,
  });

  // 播放控制相关状态
  const [autoPlayNext, setAutoPlayNext] = useState(true); // 是否自动播放下一条
  const [playEnd, setPlayEnd] = useState(false); // 是否播放结束
  const [RecognitionStable, setRecognitionStable] = useState(false); // 是否语音识别已稳定
  const [isPlaying, setIsPlaying] = useState(false); // 是否正在播放音频
  const [isRecording, setIsRecording] = useState(false); // 是否正在录音

  const setSelectedSampleIds = (ids: number[]) => {
    dispatch(setSelectedSamples(ids));
  };

  const handleDeleteSample = (id: number) => {
    dispatch(deleteSample(id));
  };

  const startAutoTest = () => {
    // 使用自定义Hook播放匹配的音频
    const { playMatchedAudio } = useAudioPlayer({
      onPlayEnd: () => {
        console.log("音频播放结束");
        setIsPlaying(false);
        setPlayEnd(true);
      },
      onPlayError: (errorMsg) => {
        toast.toast({
          title: "播放失败",
          description: errorMsg,
          variant: "destructive",
        });
      },
    });

    // Use custom hooks for voice recognition and audio playback
    const { isRecording, error, startRecording, stopRecording } =
      useVoiceRecognition({
        onRecognitionResult: (text) => {
          setMachineResponse(text);
        },
        onRecognitionStable: (text) => {
          toast.toast({
            title: "识别结果已稳定",
            description: "自动停止录音",
            variant: "default",
          });
          console.log("语音识别结果自动停止录音:", text);
          setRecognitionStable(true);
        },
        onError: (errorMsg) => {
          toast.toast({
            title: "语音识别错误",
            description: errorMsg,
            variant: "destructive",
          });
        },
      });

    setIsRecording(isRecording);

    //将被选择语料按id排序
    const sortedSampleIds = [...selectedSample].sort((a, b) => a - b);
    if (sortedSampleIds.length === 0) {
      toast.toast({
        title: "请选择语料",
        description: "请选择需要测试的语料",
        variant: "destructive",
      });
      return;
    }

    // 任务内语料循环流程
    for (let i = 0; i < sortedSampleIds.length; i++) {
      try {
        playMatchedAudio(samples[sortedSampleIds[i]].text);
        setIsPlaying(true);
      } catch (error) {
        toast.toast({
          title: "音频播放失败",
          variant: "destructive",
        });
      }

      playEnd ? (startRecording(), setPlayEnd(false)) : null;

      RecognitionStable ? ()
    }
  };



  return {
    startAutoTest,
    machineResponse,
    isRecording,
  };
}
