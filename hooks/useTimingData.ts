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
      setTimingData(data);
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
