import { useState } from "react";
import { exportWakeDetectionResults } from "@/utils/exportWakeDetectionResults";
import type { WakeDetectionResult } from "./useWakeDetectionResults";
import type { WakeWord } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";

export function useExportWakeDetectionResults() {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const exportResults = async (
    taskName: string,
    results: WakeDetectionResult[],
    wakeWords: WakeWord[]
  ) => {
    if (!results || results.length === 0) {
      toast({
        variant: "destructive",
        title: "导出失败",
        description: "该任务没有唤醒检测结果数据，请先执行唤醒检测任务",
      });
      return;
    }

    setIsExporting(true);

    try {
      const fileName = await exportWakeDetectionResults({
        taskName,
        results,
        wakeWords,
      });
      
      toast({
        title: "导出成功",
        description: `唤醒检测结果已导出为：${fileName}`,
      });
    } catch (error) {
      console.error("导出失败:", error);
      toast({
        variant: "destructive",
        title: "导出失败",
        description: error instanceof Error ? error.message : "导出过程中发生未知错误",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportWakeDetectionResults: exportResults,
    isExporting,
  };
}