import { useState, useEffect, useCallback } from 'react';
import { TauriApiService } from '@/services/tauri-api';
import type { Task } from '@/types/api';
import { useToast } from '@/components/ui/use-toast';

export function useTauriTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentTask, setCurrentTaskState] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAllTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedTasks = await TauriApiService.getAllTasks();
      setTasks(fetchedTasks);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tasks');
      toast({
        variant: "destructive",
        title: "获取任务失败",
        description: err.message || '从后端获取任务列表时发生错误。',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const fetchTaskById = useCallback(async (taskId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      // Note: TauriApiService doesn't have getTaskById, using getAllTasks and filtering
      // This should be optimized if a direct backend call is available/added
      const allTasks = await TauriApiService.getAllTasks(); 
      const task = allTasks.find(t => t.id === taskId) || null;
      setCurrentTaskState(task);
      return task;
    } catch (err: any) {
      setError(err.message || `Failed to fetch task ${taskId}`);
      toast({
        variant: "destructive",
        title: "获取任务详情失败",
        description: err.message || `获取任务 ${taskId} 详情时发生错误。`,
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const createTask = useCallback(async (name: string, testSamplesIds: number[], wakeWordId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const newTaskId = await TauriApiService.createTask(name, testSamplesIds, wakeWordId);
      await fetchAllTasks(); // Refresh the tasks list
      toast({
        title: "任务创建成功",
        description: `任务 "${name}" 已成功创建 (ID: ${newTaskId})。`,
      });
      return newTaskId;
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
      toast({
        variant: "destructive",
        title: "创建任务失败",
        description: err.message || '创建新任务时发生错误。',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllTasks, toast]);

  const updateTaskStatus = useCallback(async (taskId: number, status: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await TauriApiService.updateTaskStatus(taskId, status);
      await fetchAllTasks(); // Refresh tasks
      if (currentTask?.id === taskId) {
        setCurrentTaskState(prev => prev ? { ...prev, task_status: status } : null);
      }
      toast({
        title: "任务状态更新成功",
        description: `任务 #${taskId} 的状态已更新为 ${status}。`,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to update task status');
      toast({
        variant: "destructive",
        title: "更新任务状态失败",
        description: err.message || `更新任务 #${taskId} 状态时发生错误。`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllTasks, currentTask, toast]);

  const deleteTask = useCallback(async (taskId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      await TauriApiService.deleteTask(taskId);
      await fetchAllTasks(); // Refresh the tasks list
      if (currentTask?.id === taskId) {
        setCurrentTaskState(null);
      }
      toast({
        title: "任务删除成功",
        description: `任务 #${taskId} 已被删除。`,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to delete task');
      toast({
        variant: "destructive",
        title: "删除任务失败",
        description: err.message || `删除任务 #${taskId} 时发生错误。`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllTasks, currentTask, toast]);
  
  const setCurrentTask = useCallback(async (task: Task | null) => {
    if (task) {
      await TauriApiService.setCurrentTask(task.id);
    }
    // It seems setCurrentTask in Tauri only sets it on the backend.
    // We still need to manage the frontend state for the current task.
    setCurrentTaskState(task);
  }, []);


  useEffect(() => {
    fetchAllTasks();
  }, [fetchAllTasks]);

  return {
    tasks,
    currentTask,
    isLoading,
    error,
    fetchAllTasks,
    fetchTaskById,
    createTask,
    updateTaskStatus,
    deleteTask,
    setCurrentTask,
  };
}
