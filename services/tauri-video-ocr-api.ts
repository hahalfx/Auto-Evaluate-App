import { invoke } from '@tauri-apps/api/core';

export interface VideoFrameData {
  imageData: Uint8Array;
  timestamp: number;
  width: number;
  height: number;
}

export interface OcrTaskStatus {
  isRunning: boolean;
  processedFrames: number;
  queueSize: number;
  currentFps: number;
}

export class TauriVideoOcrApi {
  /**
   * 推送视频帧到OCR处理队列
   * @param frameData 视频帧数据
   * @returns Promise<void>
   */
  static async pushVideoFrame(frameData: VideoFrameData): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 100; // 100ms
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await invoke('push_video_frame', {
          imageData: Array.from(frameData.imageData),
          timestamp: frameData.timestamp,
          width: frameData.width,
          height: frameData.height,
        });
        return; // 成功则直接返回
      } catch (error) {
        const errorMessage = String(error);
        
        // 如果是OCR任务未启动错误，且还有重试次数，则等待后重试
        if (errorMessage.includes('OCR任务未启动') && attempt < maxRetries) {
          console.warn(`推送视频帧失败 (尝试 ${attempt}/${maxRetries}): ${errorMessage}, ${retryDelay}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        // 其他错误或重试次数用完，抛出错误
        console.error('推送视频帧失败:', error);
        throw error;
      }
    }
  }

  /**
   * 获取OCR任务状态
   * @returns Promise<OcrTaskStatus>
   */
  static async getOcrTaskStatus(): Promise<OcrTaskStatus> {
    try {
      return await invoke('get_ocr_task_status');
    } catch (error) {
      console.error('获取OCR任务状态失败:', error);
      throw error;
    }
  }

  /**
   * 将Canvas转换为视频帧数据
   * @param canvas HTMLCanvasElement
   * @returns Promise<VideoFrameData>
   */
  static async canvasToVideoFrame(canvas: HTMLCanvasElement): Promise<VideoFrameData> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('无法从canvas创建blob'));
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            const arrayBuffer = reader.result as ArrayBuffer;
            resolve({
              imageData: new Uint8Array(arrayBuffer),
              timestamp: Date.now(),
              width: canvas.width,
              height: canvas.height,
            });
          };
          reader.onerror = () => reject(new Error('读取blob失败'));
          reader.readAsArrayBuffer(blob);
        },
        'image/jpeg',
        0.8
      );
    });
  }

  /**
   * 从视频流捕获帧并推送
   * @param video HTMLVideoElement
   * @param canvas HTMLCanvasElement
   * @returns Promise<void>
   */
  static async captureAndPushFrame(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement
  ): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法获取canvas上下文');
    }

    // 设置canvas尺寸与视频一致
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 绘制当前帧
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 转换为帧数据并推送
    const frameData = await this.canvasToVideoFrame(canvas);
    await this.pushVideoFrame(frameData);
  }
}

// 使用示例
export class VideoOcrManager {
  private isRunning = false;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private intervalId: number | null = null;

  /**
   * 初始化视频OCR
   * @param video HTMLVideoElement
   * @param canvas HTMLCanvasElement
   */
  initialize(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.video = video;
    this.canvas = canvas;
  }

  /**
   * 开始视频OCR
   * @param fps 帧率，默认30
   */
  async start(fps = 30) {
    if (!this.video || !this.canvas) {
      throw new Error('视频和canvas未初始化');
    }

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const interval = 1000 / fps;

    this.intervalId = window.setInterval(async () => {
      if (this.isRunning && this.video && this.canvas) {
        try {
          await TauriVideoOcrApi.captureAndPushFrame(this.video, this.canvas);
        } catch (error) {
          console.error('推送视频帧失败:', error);
        }
      }
    }, interval);
  }

  /**
   * 停止视频OCR
   */
  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 获取当前状态
   */
  async getStatus(): Promise<OcrTaskStatus> {
    return TauriVideoOcrApi.getOcrTaskStatus();
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.stop();
    this.video = null;
    this.canvas = null;
  }
}
