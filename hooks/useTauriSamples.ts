import { useState, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { TauriApiService } from '@/services/tauri-api';
import type { TestSample } from '@/types/api';
import { useToast } from '@/components/ui/use-toast';
import * as XLSX from 'xlsx';
import { setSelectedSamples as setSelectedSamplesAction } from '@/store/samplesSlice'; // Renamed to avoid conflict

export function useTauriSamples() {
  const dispatch = useDispatch();
  const [samples, setSamples] = useState<TestSample[]>([]);
  // Rename to avoid conflict with the function we'll expose
  const [internalSelectedSampleIds, setInternalSelectedSampleIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAllSamples = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedSamples = await TauriApiService.getAllSamples();
      setSamples(fetchedSamples);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch samples');
      toast({
        variant: "destructive",
        title: "获取样本失败",
        description: err.message || '从后端获取样本列表时发生错误。',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const createSample = useCallback(async (text: string): Promise<number | null> => {
    setIsLoading(true);
    setError(null);
    try {
      // TauriApiService.createSample returns i64 (which is number in JS)
      const newSampleId = await TauriApiService.createSample(text);
      await fetchAllSamples(); // Refresh
      toast({
        title: "样本创建成功",
        description: `样本 "${text}" 已成功创建 (ID: ${newSampleId})。`,
      });
      return newSampleId; // Ensure this is number
    } catch (err: any) {
      setError(err.message || 'Failed to create sample');
      toast({
        variant: "destructive",
        title: "创建样本失败",
        description: err.message || '创建新样本时发生错误。',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllSamples, toast]);
  
  const createSamplesBatch = useCallback(async (sampleTexts: string[]): Promise<number[] | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const samplesToCreate = sampleTexts.map(text => ({ text, audio_file: null }));
      const result = await TauriApiService.createSamplesBatch(samplesToCreate);
      await fetchAllSamples(); // Refresh
      toast({
        title: "批量创建样本成功",
        description: `${result.created_ids.length} 个样本已成功创建。忽略了 ${result.ignored_count} 个重复项。`,
      });
      return result.created_ids;
    } catch (err: any) {
      setError(err.message || 'Failed to batch create samples');
      toast({
        variant: "destructive",
        title: "批量创建样本失败",
        description: err.message || '批量创建新样本时发生错误。',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllSamples, toast]);

  const deleteSample = useCallback(async (sampleId: number, safeDelete: boolean = false) => {
    setIsLoading(true);
    setError(null);
    try {
      if (safeDelete) {
        await TauriApiService.deleteSampleSafe(sampleId);
      } else {
        await TauriApiService.deleteSample(sampleId);
      }
      await fetchAllSamples(); // Refresh
      // Update both local and Redux state
      const newSelectedIds = internalSelectedSampleIds.filter(id => id !== sampleId);
      setInternalSelectedSampleIds(newSelectedIds);
      dispatch(setSelectedSamplesAction(newSelectedIds));
      toast({
        title: "样本删除成功",
        description: `样本 #${sampleId} 已成功删除。`,
      });
    } catch (err: any) {
      const errorMessage = typeof err === 'string' ? err : err.message || `删除样本 #${sampleId} 时发生未知错误。`;
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "删除样本失败",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllSamples, toast]);

  const importSamplesFromExcel = useCallback(async (file: File): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json<{ 序号?: number; 语料: string }>(worksheet);

      if (jsonData.length === 0) {
        toast({ variant: "default", title: "文件为空", description: "Excel 文件中没有找到可导入的数据。" });
        setIsLoading(false);
        return false;
      }
      
      const sampleTextsToCreate = jsonData.map(row => row.语料).filter(text => typeof text === 'string' && text.trim() !== '');

      if (sampleTextsToCreate.length === 0) {
        toast({ variant: "default", title: "无有效数据", description: "Excel 文件中没有有效的语料文本可导入。" });
        setIsLoading(false);
        return false;
      }

      const samplesForBatch = sampleTextsToCreate.map(text => ({ text, audio_file: null }));
      const result = await TauriApiService.createSamplesBatch(samplesForBatch);
      
      await fetchAllSamples(); // Refresh the full list

      const { created_ids, ignored_count } = result;

      if (created_ids.length > 0 && ignored_count > 0) {
        toast({
          title: "Excel 导入部分完成",
          description: `成功导入 ${created_ids.length} 条新语料，忽略 ${ignored_count} 条已存在的重复语料。`,
        });
      } else if (created_ids.length > 0) {
        toast({
          title: "Excel 导入成功",
          description: `全部 ${created_ids.length} 条语料已成功导入。`,
        });
      } else if (ignored_count > 0) {
        toast({
          variant: "default",
          title: "无新语料导入",
          description: `所有 ${ignored_count} 条语料均已存在，未执行任何操作。`,
        });
      } else {
         // This case should ideally not be hit if checks above are correct
         toast({
          variant: "default",
          title: "无数据导入",
          description: "文件中没有找到可导入的新语料。",
        });
      }
      
      return true;

    } catch (err: any) {
      setError(err.message || 'Failed to import from Excel');
      toast({
        variant: "destructive",
        title: "Excel 导入失败",
        description: err.message || '从 Excel 文件导入样本时发生错误。',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllSamples, toast]);
  


  const getSamplesByTaskId = useCallback(async (taskId: number): Promise<TestSample[] | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const taskSamples = await TauriApiService.getSamplesByTaskId(taskId);
      return taskSamples;
    } catch (err: any) {
      setError(err.message || `Failed to fetch samples for task ${taskId}`);
      toast({
        variant: "destructive",
        title: "获取任务样本失败",
        description: err.message || `获取任务 #${taskId} 的关联样本时发生错误。`,
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const updateTaskSampleAssociations = useCallback(async (taskId: number, newSampleIds: number[]) => {
    setIsLoading(true);
    setError(null);
    try {
      await TauriApiService.updateTaskSamples(taskId, newSampleIds);
      // May need to refresh task data or specific task's sample list if displayed
      toast({
        title: "任务样本关联更新成功",
        description: `任务 #${taskId} 的样本关联已更新。`,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to update task-sample associations');
      toast({
        variant: "destructive",
        title: "更新任务样本关联失败",
        description: err.message || `更新任务 #${taskId} 的样本关联时发生错误。`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);


  useEffect(() => {
    fetchAllSamples();
  }, [fetchAllSamples]);

  // New function to set selected IDs and dispatch to Redux
  const updateSelectedSampleIds = useCallback(
    (newIdsOrCallback: number[] | ((prevIds: number[]) => number[])) => {
      let finalNewIds: number[];
      if (typeof newIdsOrCallback === 'function') {
        finalNewIds = newIdsOrCallback(internalSelectedSampleIds);
      } else {
        finalNewIds = newIdsOrCallback;
      }
      setInternalSelectedSampleIds(finalNewIds);
      dispatch(setSelectedSamplesAction(finalNewIds));
    },
    [dispatch, internalSelectedSampleIds]
  );

  return {
    samples,
    selectedSampleIds: internalSelectedSampleIds, // Expose the internal state
    isLoading,
    error,
    fetchAllSamples,
    createSample,
    createSamplesBatch,
    deleteSample,
    setSelectedSampleIds: updateSelectedSampleIds, // Expose the new updater function
    importSamplesFromExcel,
    getSamplesByTaskId,
    updateTaskSampleAssociations,

  };
}
