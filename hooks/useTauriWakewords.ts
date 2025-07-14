import { useState, useEffect, useCallback } from 'react';
import * as XLSX from "xlsx";
import { TauriApiService } from '@/services/tauri-api';
import type { WakeWord } from '@/types/api';
import { useToast } from '@/components/ui/use-toast';

export function useTauriWakewords() {
  const [wakewords, setWakewords] = useState<WakeWord[]>([]);
  const [selectedWakewordIds, setSelectedWakewordIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAllWakewords = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedWakewords = await TauriApiService.getAllWakeWords();
      setWakewords(fetchedWakewords);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch wakewords');
      toast({
        variant: "destructive",
        title: "获取唤醒词失败",
        description: err.message || '从后端获取唤醒词列表时发生错误。',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const createWakeword = useCallback(async (text: string, audioFile?: string | null): Promise<number | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const newWakewordId = await TauriApiService.createWakeWord(text, audioFile);
      await fetchAllWakewords(); // Refresh list
      toast({
        title: "唤醒词创建成功",
        description: `唤醒词 "${text}" 已成功创建 (ID: ${newWakewordId})。`,
      });
      return newWakewordId;
    } catch (err: any) {
      setError(err.message || 'Failed to create wakeword');
      toast({
        variant: "destructive",
        title: "创建唤醒词失败",
        description: err.message || '创建新唤醒词时发生错误。',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllWakewords, toast]);

  const createWakewordsBatch = useCallback(async (wakewordsToCreate: Array<{ text: string; audio_file?: string | null }>): Promise<number[] | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const newWakewordIds = await TauriApiService.createWakeWordsBatch(wakewordsToCreate);
      await fetchAllWakewords(); // Refresh list
      toast({
        title: "批量创建唤醒词成功",
        description: `${newWakewordIds.length} 个唤醒词已成功创建。`,
      });
      return newWakewordIds;
    } catch (err: any) {
      setError(err.message || 'Failed to batch create wakewords');
      toast({
        variant: "destructive",
        title: "批量创建唤醒词失败",
        description: err.message || '批量创建新唤醒词时发生错误。',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllWakewords, toast]);

  const deleteWakeword = useCallback(async (wakewordId: number, safeDelete: boolean = false) => {
    setIsLoading(true);
    setError(null);
    try {
      if (safeDelete) {
        await TauriApiService.deleteWakeWordSafe(wakewordId);
      } else {
        await TauriApiService.deleteWakeWord(wakewordId);
      }
      await fetchAllWakewords(); // Refresh list
      // Update selected IDs
      const newSelectedIds = selectedWakewordIds.filter(id => id !== wakewordId);
      setSelectedWakewordIds(newSelectedIds);
      toast({
        title: "唤醒词删除成功",
        description: `唤醒词 #${wakewordId} 已成功删除。`,
      });
    } catch (err: any) {
      const errorMessage = typeof err === 'string' ? err : err.message || `删除唤醒词 #${wakewordId} 时发生未知错误。`;
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "删除唤醒词失败",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllWakewords, toast, selectedWakewordIds]);

  const importWakewordsFromExcel = useCallback(async (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json<{
            序号: number;
            语料: string;
          }>(firstSheet);

          if (jsonData.length > 0) {
            const wakewordsToCreate = jsonData
              .map((row) => ({
                text: row.语料,
                // audio_file can be added here if the Excel contains it
              }))
              .filter(s => s.text && s.text.trim() !== ""); // Filter out empty text

            if (wakewordsToCreate.length > 0) {
              await createWakewordsBatch(wakewordsToCreate);
            }
            resolve(true);
          } else {
            toast({
              variant: "destructive",
              title: "导入失败",
              description: "Excel 文件中没有找到有效数据或格式不正确。",
            });
            resolve(false);
          }
        } catch (error: any) {
          toast({
            variant: "destructive",
            title: "文件解析失败",
            description: error.message || "解析Excel文件时发生错误。",
          });
          resolve(false);
        }
      };
      reader.onerror = () => {
        toast({
          variant: "destructive",
          title: "文件读取失败",
          description: "读取文件时发生错误。",
        });
        resolve(false);
      };
      reader.readAsArrayBuffer(file);
    });
  }, [createWakewordsBatch, toast]);

  useEffect(() => {
    fetchAllWakewords();
  }, [fetchAllWakewords]);

  // Function to update selected IDs, similar to useTauriSamples
  const updateSelectedWakewordIds = useCallback(
    (newIdsOrCallback: number[] | ((prevIds: number[]) => number[])) => {
      let finalNewIds: number[];
      if (typeof newIdsOrCallback === 'function') {
        finalNewIds = newIdsOrCallback(selectedWakewordIds);
      } else {
        finalNewIds = newIdsOrCallback;
      }
      setSelectedWakewordIds(finalNewIds);
    },
    [selectedWakewordIds]
  );

  return {
    wakewords,
    selectedWakewordIds,
    isLoading,
    error,
    fetchAllWakewords,
    createWakeword,
    createWakewordsBatch,
    deleteWakeword,
    setSelectedWakewordIds: updateSelectedWakewordIds,
    importWakewordsFromExcel,
  };
}
