// OCR性能测试脚本
import { invoke } from '@tauri-apps/api/core';

interface PerformanceMetrics {
  fps: number;
  avgLatency: number;
  maxLatency: number;
  minLatency: number;
  totalFrames: number;
  errors: number;
}

class OCRPerformanceTester {
  private metrics: PerformanceMetrics = {
    fps: 0,
    avgLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
    totalFrames: 0,
    errors: 0
  };

  private startTime: number = 0;
  private frameTimes: number[] = [];
  private isRunning = false;

  async startTest(duration: number = 10000, targetFps: number = 60) {
    console.log(`开始OCR性能测试 - 持续时间: ${duration}ms, 目标FPS: ${targetFps}`);
    
    this.resetMetrics();
    this.startTime = performance.now();
    this.isRunning = true;

    // 初始化OCR引擎
    try {
      await invoke('initialize_ocr_engine');
      console.log('OCR引擎初始化完成');
    } catch (error) {
      console.error('引擎初始化失败:', error);
      return null;
    }

    // 创建测试数据
    const testImage = this.createTestImage();
    
    // 开始测试循环
    const interval = 1000 / targetFps;
    const testPromises: Promise<void>[] = [];
    
    for (let i = 0; i < Math.floor(duration / interval); i++) {
      testPromises.push(
        new Promise((resolve) => {
          setTimeout(async () => {
            if (!this.isRunning) {
              resolve();
              return;
            }

            const frameStart = performance.now();
            try {
              await invoke('perform_ocr', { imageData: testImage });
              const frameEnd = performance.now();
              const latency = frameEnd - frameStart;
              
              this.frameTimes.push(latency);
              this.metrics.totalFrames++;
              
              if (latency > this.metrics.maxLatency) {
                this.metrics.maxLatency = latency;
              }
              if (latency < this.metrics.minLatency) {
                this.metrics.minLatency = latency;
              }
            } catch (error) {
              this.metrics.errors++;
              console.error('OCR处理错误:', error);
            }
            resolve();
          }, i * interval);
        })
      );
    }

    // 等待所有测试完成
    await Promise.all(testPromises);
    
    // 计算最终指标
    this.calculateFinalMetrics(duration);
    
    // 清理
    await invoke('shutdown_ocr_engine');
    
    return this.metrics;
  }

  private createTestImage(): Uint8Array {
    // 创建一个简单的测试图像数据
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    
    // 绘制测试文字
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = 'black';
    ctx.font = '48px Arial';
    ctx.fillText('测试文字', 50, 100);
    
    // 转换为Uint8Array
    const imageData = ctx.getImageData(0, 0, 640, 480);
    return new Uint8Array(imageData.data.buffer);
  }

  private calculateFinalMetrics(duration: number) {
    const actualDuration = performance.now() - this.startTime;
    this.metrics.fps = (this.metrics.totalFrames / actualDuration) * 1000;
    
    if (this.frameTimes.length > 0) {
      this.metrics.avgLatency = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    } else {
      this.metrics.minLatency = 0;
    }
  }

  private resetMetrics() {
    this.metrics = {
      fps: 0,
      avgLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      totalFrames: 0,
      errors: 0
    };
    this.frameTimes = [];
  }

  getResults(): PerformanceMetrics {
    return { ...this.metrics };
  }
}

// 测试运行函数
export async function runOCRPerformanceTest() {
  const tester = new OCRPerformanceTester();
  
  console.log('=== OCR多线程性能测试开始 ===');
  
  // 测试单引擎性能
  console.log('测试单引擎性能...');
  const singleEngineResult = await tester.startTest(5000, 30);
  console.log('单引擎结果:', singleEngineResult);
  
  // 测试双引擎性能
  console.log('测试双引擎性能...');
  const dualEngineResult = await tester.startTest(5000, 60);
  console.log('双引擎结果:', dualEngineResult);
  
  // 性能对比
  if (singleEngineResult && dualEngineResult) {
    const improvement = ((dualEngineResult.fps - singleEngineResult.fps) / singleEngineResult.fps) * 100;
    console.log(`性能提升: ${improvement.toFixed(1)}%`);
    
    return {
      singleEngine: singleEngineResult,
      dualEngine: dualEngineResult,
      improvement: improvement
    };
  }
  
  return null;
}

// 运行测试
if (typeof window !== 'undefined') {
  // 在浏览器环境中运行
  (window as any).runOCRTest = runOCRPerformanceTest;
}
