import { invoke } from '@tauri-apps/api/core';
import type { Task, TestSample, WakeWord, AnalysisResult, MachineResponseData, TaskProgress, TimingData } from '@/types/api';

export class TauriApiService {
  // 任务相关
  static async getAllTasks(): Promise<Task[]> {
    return await invoke('get_all_tasks');
  }

  static async getCurrentTask(): Promise<Task | null> {
    return await invoke('get_current_task');
  }

  static async setCurrentTask(taskId: number): Promise<void> {
    return await invoke('set_current_task', { taskId });
  }

  static async createTask(
    name: string,
    testSamplesIds: number[],
    wakeWordId: number
  ): Promise<number> {
    return await invoke('create_task', {
      name,
      testSamplesIds,
      wakeWordId,
    });
  }

  static async updateTaskStatus(taskId: number, status: string): Promise<void> {
    return await invoke('update_task_status', { taskId, status });
  }

  static async deleteTask(taskId: number): Promise<void> {
    return await invoke('delete_task', { taskId });
  }

  // 样本相关
  static async getAllSamples(): Promise<TestSample[]> {
    return await invoke('get_all_samples');
  }

  static async createSample(text: string, audioFile?: string | null): Promise<number> {
    return await invoke('create_sample', { text, audioFile });
  }

  static async createSamplesBatch(samples: Array<{ text: string; audio_file?: string | null }>): Promise<{ created_ids: number[]; ignored_count: number }> {
    // The payload for the Rust command is Vec<SampleCreationPayload>
    // where SampleCreationPayload is { text: String, audio_file: Option<String> }
    // So, we need to ensure the key is `audio_file` as expected by Rust's serde.
    const payload = samples.map(s => ({ text: s.text, audio_file: s.audio_file }));
    // The backend now returns a BatchCreationResult object: { created_ids: Vec<i64>, ignored_count: usize }
    return await invoke('create_samples_batch', { samples: payload });
  }

  static async deleteSample(sampleId: number): Promise<void> {
    return await invoke('delete_sample', { sampleId });
  }

  static async deleteSampleSafe(sampleId: number): Promise<void> {
    return await invoke('delete_sample_safe', { sampleId });
  }

  static async getSamplesByTaskId(taskId: number): Promise<TestSample[]> {
    return await invoke('get_samples_by_task_id', { taskId });
  }

  static async updateTaskSamples(taskId: number, sampleIds: number[]): Promise<void> {
    return await invoke('update_task_samples', { taskId, sampleIds });
  }

  // 唤醒词相关
  static async getAllWakeWords(): Promise<WakeWord[]> {
    return await invoke('get_all_wake_words');
  }

  static async createWakeWord(text: string, audioFile?: string | null): Promise<number> {
    return await invoke('create_wake_word', { text, audioFile });
  }

  static async createWakeWordsBatch(wakewords: Array<{ text: string; audio_file?: string | null }>): Promise<number[]> {
    const payload = wakewords.map(w => ({ text: w.text, audio_file: w.audio_file }));
    return await invoke('create_wake_words_batch', { wakewords: payload });
  }

  static async deleteWakeWord(wakeWordId: number): Promise<void> {
    return await invoke('delete_wake_word', { wakeWordId });
  }

  static async deleteWakeWordSafe(wakeWordId: number): Promise<void> {
    return await invoke('delete_wake_word_safe', { wakeWordId });
  }

  // Precheck samples before import
  static async precheckSamples(texts: string[]): Promise<{ new_texts: string[], duplicate_texts: string[] }> {
    return await invoke('precheck_samples', { texts });
  }

  // 测试相关
  static async startAutomatedTest(): Promise<void> {
    return await invoke('start_automated_test');
  }

  static async submitAnalysis(
    sampleId: number,
    machineResponse: string
  ): Promise<AnalysisResult> {
    return await invoke('submit_analysis', { sampleId, machineResponse });
  }

  static async getTaskProgress(): Promise<TaskProgress> {
    return await invoke('get_task_progress');
  }

  static async getAnalysisResults(): Promise<Record<number, AnalysisResult>> {
    return await invoke('get_analysis_results');
  }

  static async getMachineResponses(): Promise<Record<number, MachineResponseData>> {
    return await invoke('get_machine_responses');
  }

  static async isTesting(): Promise<boolean> {
    return await invoke('is_testing');
  }

  static async stopTesting(): Promise<void> {
    return await invoke('stop_testing');
  }

  // 时间参数相关
  static async getTimingDataByTask(taskId: number): Promise<Record<number, TimingData>> {
    return await invoke('get_timing_data_by_task', { taskId });
  }
}
