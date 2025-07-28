import { invoke } from '@tauri-apps/api/core';
import type { Task, TestSample, WakeWord, AnalysisResult, MachineResponseData, TaskProgress, TimingData } from '@/types/api';

// 配置数据结构
export interface ConfigData {
  xunfei: {
    appid: string
    api_key: string
    api_secret: string
  }
  openrouter: {
    api_key: string
    base_url: string
  }
  app: {
    log_level: string
    max_concurrent_tasks: number
    timeout_seconds: number
  }
}

export class TauriApiService {
  // 配置相关
  static async getAppConfig(): Promise<ConfigData> {
    return await invoke('get_app_config');
  }

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
    wakeWordIds: number[]
  ): Promise<number> {
    return await invoke('create_task', {
      name,
      testSamplesIds,
      wakeWordIds,
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

  static async getAllSamplesRaw(): Promise<any[]> {
    return await invoke('get_all_samples_raw');
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

  static async deleteSamplesBatch(sampleIds: number[]): Promise<{ successfully_deleted_ids: number[]; failed_ids: number[]; skipped_ids: number[] }> {
    return await invoke('delete_samples_batch', { sampleIds });
  }

  static async deleteSamplesBatchSafe(sampleIds: number[]): Promise<{ successfully_deleted_ids: number[]; failed_ids: number[]; skipped_ids: number[] }> {
    return await invoke('delete_samples_batch_safe', { sampleIds });
  }

  static async precheckSamples(texts: string[]): Promise<{ new_texts: string[]; duplicate_texts: string[] }> {
    return await invoke('precheck_samples', { texts });
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

  static async getAllWakeWordsRaw(): Promise<any[]> {
    return await invoke('get_all_wake_words_raw');
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

  // 任务包导入相关
  static async importTaskPackage(
    packagePath: string,
    taskName: string
  ): Promise<{ task_id: number; wake_words_created: number; samples_created: number; wake_words_ignored: number; samples_ignored: number }> {
    // console.log("TauriApiService.importTaskPackage - 参数:", { packagePath, taskName });
    // console.log("TauriApiService.importTaskPackage - packagePath类型:", typeof packagePath);
    // console.log("TauriApiService.importTaskPackage - packagePath长度:", packagePath.length);
    
    return await invoke('import_task_package', {
      packagePath,
      taskName,
    });
  }
}
