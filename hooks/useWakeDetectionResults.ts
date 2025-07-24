import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface WakeDetectionResult {
  test_index: number;
  wake_word_id: number;
  wake_word_text: string;
  wake_task_completed: boolean;
  active_task_completed: boolean;
  success: boolean;
  confidence?: number;
  timestamp: number;
  duration_ms: number;
}

export function useWakeDetectionResults(taskId?: number) {
  const [results, setResults] = useState<WakeDetectionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = async () => {
    if (!taskId) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await invoke<WakeDetectionResult[]>('get_wake_detection_results', { taskId });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取唤醒检测结果失败');
      console.error('获取唤醒检测结果失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [taskId]);

  // 计算统计数据
  const stats = {
    total: results.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    successRate: results.length > 0 ? (results.filter(r => r.success).length / results.length) * 100 : 0,
    avgConfidence: results.length > 0 
      ? results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length 
      : 0,
    avgDuration: results.length > 0 
      ? results.reduce((sum, r) => sum + r.duration_ms, 0) / results.length 
      : 0,
  };

  return {
    results,
    isLoading,
    error,
    stats,
    refetch: fetchResults,
  };
} 