"use client";

import { useState, useEffect, useCallback } from "react";
import { TauriApiService } from "@/services/tauri-api";
import type { TimingData } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";

export function useTimingData(taskId?: number) {
  const [timingData, setTimingData] = useState<Record<number, TimingData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchTimingData = useCallback(async (id: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await TauriApiService.getTimingDataByTask(id);
      console.log('Raw timing data received:', data);
      
      // 直接使用后端返回的数据，不进行属性名转换
      const processedData: Record<number, TimingData> = {};
      for (const [sampleId, timing] of Object.entries(data)) {
        const timingObj = timing as any;
        
        // 处理时间戳转换
        const convertTime = (timeValue: any): string | null => {
          if (timeValue === null || timeValue === undefined) return null;
          if (typeof timeValue === 'number') {
            return new Date(timeValue).toISOString();
          }
          return String(timeValue);
        };

        // 处理数值
        const convertNumber = (numValue: any): number | null => {
          if (numValue === null || numValue === undefined || isNaN(Number(numValue))) return null;
          return Number(numValue);
        };

        // 构建正确的数据结构
        processedData[Number(sampleId)] = {
          voiceCommandStartTime: convertTime(timingObj.voice_command_start_time),
          firstCharAppearTime: convertTime(timingObj.first_char_appear_time),
          voiceCommandEndTime: convertTime(timingObj.voice_command_end_time),
          fullTextAppearTime: convertTime(timingObj.full_text_appear_time),
          actionStartTime: convertTime(timingObj.action_start_time),
          ttsFirstFrameTime: convertTime(timingObj.tts_first_frame_time),
          voiceRecognitionTimeMs: convertNumber(timingObj.voice_recognition_time_ms),
          interactionResponseTimeMs: convertNumber(timingObj.interaction_response_time_ms),
          ttsResponseTimeMs: convertNumber(timingObj.tts_response_time_ms),
        };
      }
      
      console.log('Processed timing data:', processedData);
      setTimingData(processedData);
    } catch (err: any) {
      setError(err.message || '获取时间参数失败');
      toast({
        variant: "destructive",
        title: "获取时间参数失败",
        description: err.message || '从后端获取时间参数时发生错误。',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (taskId) {
      fetchTimingData(taskId);
    }
  }, [taskId, fetchTimingData]);

  const refreshTimingData = useCallback(() => {
    if (taskId) {
      fetchTimingData(taskId);
    }
  }, [taskId, fetchTimingData]);

  return {
    timingData,
    isLoading,
    error,
    refreshTimingData,
  };
}
