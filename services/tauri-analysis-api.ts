import { invoke } from '@tauri-apps/api/core';
import type { Event as TauriEvent } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';
import type { AnalysisResult as TauriAnalysisResult, TaskProgress as TauriTaskProgress, PlayAudioEvent as TauriPlayAudioEvent, Task as TauriTask } from '@/types/tauri'; // Corrected import path

/**
 * Starts the automated test process for the current task via Tauri.
 * @param wakeWordId 可选的唤醒词ID，如果没有提供则使用任务的第一个
 * @param templateData 可选的模板数据，用于视觉检测
 * @param frameRate 可选的帧率，默认10
 * @param threshold 可选的阈值，默认0.5
 * @param maxDetectionTimeSecs 可选的最大检测时间，默认30秒
 */
export async function tauriStartAutomatedTest(
  wakeWordId?: number,
  templateData?: Array<[string, string]>,
  frameRate?: number,
  threshold?: number,
  maxDetectionTimeSecs?: number
): Promise<void> {
  await invoke('new_meta_workflow', {
    wakeWordId,
    templateData,
    frameRate,
    threshold,
    maxDetectionTimeSecs
  });
}

/**
 * Submits the machine response for a given sample for analysis via Tauri.
 * The actual analysis result will be delivered via an "analysis-completed" event.
 * @param sampleId The ID of the sample being analyzed.
 * @param machineResponse The response from the machine.
 */
export async function tauriSubmitAnalysis(sampleId: number, machineResponse: string): Promise<void> {
  // The Rust command `submit_analysis` returns a Result<AnalysisResult, String>,
  // but we will primarily rely on the "analysis-completed" event for the result
  // to keep the flow consistent with other events.
  // If direct result handling is preferred, this function can be modified.
  await invoke('submit_analysis', { sampleId, machineResponse });
}

// Event listener types (payloads should match Rust structs)

export interface AnalysisCompletedEventPayload {
  sample_id: number;
  result: TauriAnalysisResult;
}

export interface TaskCompletedPayload {
  // Define if there's specific data, otherwise can be void or a simple status
}

export interface ErrorOccurredPayload {
  message: string;
}

// Wrapper functions for event listeners to ensure type safety

export async function listenToProgressUpdated(handler: (payload: TauriTaskProgress) => void): Promise<() => void> {
  return await listen<TauriTaskProgress>('progress-updated', (event: TauriEvent<TauriTaskProgress>) => {
    handler(event.payload);
  });
}

export async function listenToPlayAudio(handler: (payload: TauriPlayAudioEvent) => void): Promise<() => void> {
  return await listen<TauriPlayAudioEvent>('play-audio', (event: TauriEvent<TauriPlayAudioEvent>) => {
    handler(event.payload);
  });
}

export async function listenToAnalysisCompleted(handler: (payload: AnalysisCompletedEventPayload) => void): Promise<() => void> {
  return await listen<AnalysisCompletedEventPayload>('analysis-completed', (event: TauriEvent<AnalysisCompletedEventPayload>) => {
    handler(event.payload);
  });
}

export async function listenToTaskCompleted(handler: (payload?: TaskCompletedPayload) => void): Promise<() => void> {
  // Assuming 'task-completed' might not have a detailed payload or it's simple
  return await listen<TaskCompletedPayload | undefined>('task-completed', (event: TauriEvent<TaskCompletedPayload | undefined>) => {
    handler(event.payload);
  });
}

export async function listenToErrorOccurred(handler: (payload: ErrorOccurredPayload) => void): Promise<() => void> {
  return await listen<ErrorOccurredPayload>('error-occurred', (event: TauriEvent<ErrorOccurredPayload>) => {
    handler(event.payload);
  });
}

// It might also be useful to have a command to get the initial state if needed,
// e.g., current task details, existing analysis results for a task when it's loaded.
// For now, we assume the backend pushes necessary initial state or it's handled by existing Redux flows.

/**
 * Sets the current task ID in the backend state.
 * @param taskId The ID of the task to set as current.
 */
export async function tauriSetCurrentTask(taskId: number): Promise<void> {
  await invoke('set_current_task', { taskId });
}

/**
 * Gets the current task details from the backend state.
 * @returns The current task details, or null if no task is set.
 */
export async function tauriGetCurrentTask(): Promise<TauriTask | null> {
  return await invoke('get_current_task');
}

export async function tauriPauseWorkflow(): Promise<void> {
  await invoke('pause_workflow');
}

export async function tauriResumeWorkflow(): Promise<void> {
  await invoke('resume_workflow');
}

export async function tauriStopWorkflow(): Promise<void> {
  await invoke('stop_workflow');
}