import { useState } from "react";
import { exportTaskReport, exportTaskReportCSV } from "@/utils/exportTaskReport";
import type { Task, TestSample, WakeWord } from "@/types/api";
import type { WakeDetectionResult } from "@/hooks/useWakeDetectionResults";
import { useToast } from "@/components/ui/use-toast";

interface UseExportTaskReportOptions {
  format?: "excel" | "csv";
}

export function useExportTaskReport(options: UseExportTaskReportOptions = {}) {
  const { format = "excel" } = options;
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const exportReport = async (
    task: Task | null,
    samples: TestSample[],
    wakeWords: WakeWord[],
    wakeDetectionResults?: WakeDetectionResult[]
  ) => {
    if (!task) {
      toast({
        variant: "destructive",
        title: "导出失败",
        description: "请先选择一个任务",
      });
      return;
    }

    setIsExporting(true);

    try {
      // 检查是否有测试结果
      if (!task.test_result || Object.keys(task.test_result).length === 0) {
        throw new Error("该任务还没有测试结果，请先执行测试");
      }

      // 检查数据完整性
      if (samples.length === 0) {
        throw new Error("样例数据为空，无法导出");
      }

      if (format === "csv") {
        const csvContent = exportTaskReportCSV({ task, samples, wakeWords, wakeDetectionResults });
        // 创建并下载 CSV 文件
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${task.name}_测试报告_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      } else {
        await exportTaskReport(
          { task, samples, wakeWords, wakeDetectionResults },
          (fileName) => {
            toast({
              title: "导出成功",
              description: `报告已导出为：${fileName}`,
            });
          },
          (error) => {
            throw error;
          }
        );
      }
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
    exportReport,
    isExporting,
  };
}