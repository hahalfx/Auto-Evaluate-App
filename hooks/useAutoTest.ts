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
import { setAutoStart } from "@/store/taskSlice";

// 自定义Hook，用于设置自动化测试流程

export function useAutoTest() {
  //Redux中的samples,Task状态
  const samples = useAppSelector(selectAllSamples);
  const selectedSample = useAppSelector(selectSelectedSampleIds);
  const Task = useAppSelector((state) => state.tasks.currentTask);
  const autoStart = useAppSelector((state) => state.tasks.autoStart);
  const dispatch = useAppDispatch();

  // 机器响应相关状态
  const [machineResponse, setMachineResponse] = useState<string>("");
  const machineResponseRef = useRef<MachineResponseHandle>(null);

  // 分析结果相关状态
  const [analysisResults, setAnalysisResults] = useState<
    Record<number, AnalysisResult>
  >();
  const [currentResultIndex, setCurrentResultIndex] = useState<number>(0);

  // 进度和状态相关
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

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
  const [isPlaying, setIsPlaying] = useState(false); // 是否正在播放音频
  const [isRecording, setIsRecording] = useState(false); // 是否正在录音
  const isPlayingNextRef = useRef<boolean>(false); // 防止重复播放的标记

  const setSelectedSampleIds = (ids: number[]) => {
    dispatch(setSelectedSamples(ids));
  };

  const handleDeleteSample = (id: number) => {
    dispatch(deleteSample(id));
  };

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

  useEffect(() => {
    if (Task && autoStart) {
      startAutoTest();
      dispatch(setAutoStart(false));
    }
  }, [Task, autoStart]);

  const startAutoTest = () => {

  };
}
