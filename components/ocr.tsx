// components/OCRVideoComponent.tsx
"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
// 1. 引入 Tauri API
import { Channel, invoke } from "@tauri-apps/api/core";

// --- UI 组件引入 (保持不变) ---
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { useToast } from "./ui/use-toast";
import {
  Eraser,
  MonitorUp,
  Scan,
  Settings,
  SquareDashedMousePointer,
  Target,
  Eye,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { TemplateManager } from "./template-manager";


// 2. 定义与 Rust 后端匹配的类型
interface RustOcrResultItem {
  text: string;
  combined_bbox: [number, number, number, number]; // [x, y, width, height]
}

// 视觉检测配置接口
export interface VisualWakeConfig {
  frameRate: number;
  threshold: number;
  maxDetectionTime: number;
  templateData: Array<[string, string]>; // [name, base64_data]
}

// OCR配置接口
interface OcrConfig {
  interval: number;
  roi: [number, number, number, number] | null;
}

// 定义从 Channel 接收的事件类型
interface OcrEvent {
  data?: RustOcrResultItem[];
  session?: {
    first_text_detected_time?: number;
    text_stabilized_time?: number;
    final_text: string;
    is_session_complete: boolean;
    should_stop_ocr: boolean;
    current_frame: number;
  };
  error?: string;
}

// 任务状态枚举
enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed"
}


export function OCRVideoComponent({ setVisualWakeConfig }: { setVisualWakeConfig: (config: VisualWakeConfig) => void }) {
  // --- Refs (基本不变) ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const initializationPromiseRef = useRef<Promise<void> | null>(null);
  const frameRateRef = useRef({
    lastSendTime: 0,
    displayLastFrameTime: 0,
    displayFrames: 0,
  });
  const isDrawingRef = useRef<{ x: number; y: number } | null>(null);
  const lastInitializedDeviceRef = useRef<string>("");

  const messageHandlerRef = useRef<((event: OcrEvent) => void) | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // --- State (已简化) ---
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [ocrResults, setOcrResults] = useState<RustOcrResultItem[]>([]);
  const [lastInferenceTime, setLastInferenceTime] = useState<number>(0);
  
  // 修改ROI相关状态 - 为OCR和视觉检测分别创建独立的ROI（使用视频原始坐标系）
  const [isSelectingOcrROI, setIsSelectingOcrROI] = useState<boolean>(false);
  const [isSelectingVisualROI, setIsSelectingVisualROI] = useState<boolean>(false);
  const [ocrRoi, setOcrRoi] = useState<[number, number, number, number] | null>(null);
  const [visualRoi, setVisualRoi] = useState<[number, number, number, number] | null>(null);
  const [roiStartPoint, setRoiStartPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  
  const [ocrInterval, setOcrInterval] = useState<number>(0.02); // 识别间隔 (秒)
  const { toast } = useToast();
  const [isInitializing, setIsInitializing] = useState(false);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [ocrTaskEvent, setOcrTaskEvent] = useState<string | null>(null);
  const [isOcrReady, setIsOcrReady] = useState<boolean>(false);
  const [firstTextDetectedTime, setFirstTextDetectedTime] =
    useState<Date | null>(null);
  const [textStabilizedTime, setTextStabilizedTime] = useState<Date | null>(
    null
  );

  const [activeTaskResult, setActiveTaskResult] = useState<TaskStatus>(TaskStatus.PENDING);

  // 添加视觉检测相关状态
  const [isVisualDetectionActive, setIsVisualDetectionActive] = useState<boolean>(false);

  // 添加调试信息状态
  const [debugInfo, setDebugInfo] = useState<{
    videoOriginalSize: { width: number; height: number };
    videoDisplaySize: { width: number; height: number };
    scaleFactors: { x: number; y: number };
  } | null>(null);

  // 添加视频尺寸稳定状态
  const [videoSizeStable, setVideoSizeStable] = useState<boolean>(false);

  // 视觉检测配置状态
  const [visualConfig, setVisualConfig] = useState<VisualWakeConfig>({
    frameRate: 10,
    threshold: 0.5,
    maxDetectionTime: 30,
    templateData: [],
  });

  // OCR配置状态
  const [ocrConfig, setOcrConfig] = useState<OcrConfig>({
    interval: 0.02,
    roi: null,
  });

  // 更新视觉检测配置
  const updateVisualConfig = (updates: Partial<VisualWakeConfig>) => {
    setVisualConfig(prev => ({ ...prev, ...updates }));
  };

  // 更新OCR配置
  const updateOcrConfig = (updates: Partial<OcrConfig>) => {
    setOcrConfig(prev => ({ ...prev, ...updates }));
  };

  // --- Refs for Callbacks (保持不变) ---
  const ocrRoiRef = useRef(ocrRoi);
  const visualRoiRef = useRef(visualRoi);
  const ocrIntervalRef = useRef(ocrInterval);
  const isCapturingRef = useRef(isCapturing);
  const isVisualDetectionActiveRef = useRef(isVisualDetectionActive);

  // 使用 useEffect 来同步 state 到 ref
  useEffect(() => {
    ocrRoiRef.current = ocrRoi;
  }, [ocrRoi]);
  useEffect(() => {
    visualRoiRef.current = visualRoi;
  }, [visualRoi]);
  useEffect(() => {
    ocrIntervalRef.current = ocrInterval;
  }, [ocrInterval]);
  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);
  useEffect(() => {
    isVisualDetectionActiveRef.current = isVisualDetectionActive;
  }, [isVisualDetectionActive]);
  // 将视觉检测配置传递给父组件
  useEffect(() => {
    setVisualWakeConfig(visualConfig);
  }, [visualConfig]);

  useEffect(() => {
    // 使用一个变量来防止在组件卸载后继续执行异步代码
    let isCancelled = false;

    const setupCamera = async () => {
      // 流程开始时，立即设置"正在初始化"状态，UI可以显示加载动画
      setIsInitializing(true);

      try {
        // --- 第一步：获取并授权设备列表 ---
        // 为了获取列表，需要先请求一次权限
        await navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((stream) => {
            // 拿到权限后立刻关闭这个临时的流
            stream.getTracks().forEach((track) => track.stop());
          });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(
          (d) => d.kind === "videoinput" && d.deviceId
        );

        // 如果组件此时已被卸载，则中止后续所有操作
        if (isCancelled) return;

        setVideoDevices(videoInputs);
        setDevicesLoaded(true);

        // --- 第二步：决定要使用哪个设备 ---
        const deviceToUse =
          selectedDevice ||
          (videoInputs.length > 0 ? videoInputs[0].deviceId : null);

        if (!deviceToUse) {
          // 如果没有可用的摄像头，抛出一个明确的错误，会被下面的 catch 捕获
          throw new Error("没有找到可用的摄像头设备。");
        }

        // 如果计算出的设备与当前state中的不一致，更新它
        // 这通常只在第一次加载时发生
        if (deviceToUse !== selectedDevice) {
          setSelectedDevice(deviceToUse);
        }

        // --- 第三步：真正打开并播放摄像头视频流 ---

        // 在获取新视频流之前，确保已关闭任何可能存在的旧视频流
        if (activeStreamRef.current) {
          activeStreamRef.current.getTracks().forEach((track) => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceToUse },
            width: { ideal: 854 },
            height: { ideal: 480 },
          },
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        // 将视频流设置到 video 元素上
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          activeStreamRef.current = stream; // 保存对当前活动流的引用
          await videoRef.current.play();
        }
      } catch (error) {
        // 【关键】捕获整个流程中的任何错误
        if (isCancelled) return;

        console.error("摄像头设置过程中出错:", error);
        // 使用 toast 向用户显示一个友好的错误提示，而不是抛出错误导致组件崩溃
        toast({
          title: "摄像头错误",
          description: (error as Error).message,
          variant: "destructive",
        });
      } finally {
        // 无论成功还是失败，最后都将"正在初始化"状态设为 false
        if (!isCancelled) {
          setIsInitializing(false);
        }
      }
    };

    // 执行这个统一的设置函数
    setupCamera();

    // 这是这个 effect 的清理函数，在组件被卸载时自动执行
    return () => {
      isCancelled = true;
      // 确保在组件卸载时，摄像头一定会被关闭
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      console.log("摄像头设置 effect 已清理，视频流已停止。");
    };
  }, [selectedDevice, toast]); // 依赖项现在非常简单和可控：仅在用户手动切换设备时重新运行

  //后端任务控制信号监听
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let unlistenTaskEvent: UnlistenFn | undefined;
    let unlistenActiveTask: UnlistenFn | undefined;
    let unlistenTaskCompleted: UnlistenFn | undefined;

    const setupListeners = async () => {
      try {
        // 监听旧的ocr_event（向后兼容）
        unlisten = await listen("ocr_event", (event) => {
          console.log("React Component 收到 ocr_event:", event.payload);
          setOcrTaskEvent(String(event.payload));
        });

        // 监听新的ocr_task_event（结构化事件）
        unlistenTaskEvent = await listen("ocr_task_event", (event) => {
          console.log("React Component 收到 ocr_task_event:", event.payload);
          const data = event.payload as any;

          if (data && typeof data === "object") {
            const eventType = data.type;
            const taskId = data.task_id;
            const message = data.message;

            console.log(
              `OCR Task Event - Type: ${eventType}, Task: ${taskId}, Message: ${message}`
            );

            // 处理不同类型的事件
            switch (eventType) {
              case "start":
                setOcrTaskEvent("start");
                toast({
                  title: "OCR任务启动",
                  description: message || "OCR任务开始初始化",
                });
                break;
              case "ready":
                setOcrTaskEvent("ready");
                toast({
                  title: "OCR任务就绪",
                  description: message || "OCR任务已准备就绪",
                });
                break;
              case "stop":
                setOcrTaskEvent("stop");
                const reason = data.reason || "completed";
                const processedFrames = data.processed_frames || 0;
                toast({
                  title: "OCR任务停止",
                  description: `${
                    message || "OCR任务已停止"
                  } (处理了 ${processedFrames} 帧)`,
                  variant: reason === "completed" ? "default" : "destructive",
                });
                break;
              case "session_complete":
                setOcrTaskEvent("session_complete");
                toast({
                  title: "OCR会话完成",
                  description: message || "OCR会话已完成",
                });
                break;
              case "error":
                const consecutiveErrors = data.consecutive_errors || 0;
                toast({
                  title: "OCR处理错误",
                  description: `${data.error} (连续错误: ${consecutiveErrors})`,
                  variant: "destructive",
                });
                break;
              case "warning":
                toast({
                  title: "OCR警告",
                  description: message || "OCR处理警告",
                  variant: "destructive",
                });
                break;
              default:
                console.log("未知的OCR任务事件类型:", eventType);
            }
          } else {
            // 处理简单字符串格式（向后兼容）
            setOcrTaskEvent(String(event.payload));
          }
        });

        // 监听active_task信息（用于视觉唤醒检测）
        unlistenActiveTask = await listen('active_task_info', (event) => {
          console.log("React Component 收到 active_task_info:", event.payload);
          const status = event.payload;
          
          if (status === 'started') {
            console.log("收到 active_task_info started 事件，启动视觉检测帧推送");
            setIsVisualDetectionActive(true);
          } else if (status === 'stopped' || status === 'timeout') {
            console.log("收到 active_task_info 停止事件，停止视觉检测帧推送");
            setIsVisualDetectionActive(false);
          }
        });

        unlistenTaskCompleted = await listen('task_completed', (event) => {
          console.log("React Component 收到 task_completed:", event.payload);
          const taskType = event.payload;
          console.log('任务完成:', taskType);
          if (taskType === 'active_task_completed') {
            setActiveTaskResult(TaskStatus.COMPLETED);
          } else if (taskType === 'active_task_timeout') {
            setActiveTaskResult(TaskStatus.FAILED);
          }
        });

      } catch (error) {
        console.error("监听OCR事件失败:", error);
      }
    };

    setupListeners();

    return () => {
      if (unlisten) {
        try {
          unlisten();
          console.log("已取消监听 ocr_event");
        } catch (error) {
          console.error("取消监听 ocr_event 失败:", error);
        }
      }
      if (unlistenTaskEvent) {
        try {
          unlistenTaskEvent();
          console.log("已取消监听 ocr_task_event");
        } catch (error) {
          console.error("取消监听 ocr_task_event 失败:", error);
        }
      }
      if (unlistenActiveTask) {
        try {
          unlistenActiveTask();
          console.log("已取消监听 active_task_info");
        } catch (error) {
          console.error("取消监听 active_task_info 失败:", error);
        }
      }
    };
  }, [toast]);

  

  //任务状态更新
  useEffect(() => {
    if (ocrTaskEvent === "start") {
      console.log("收到OCR启动信号，等待就绪信号...");
      setIsOcrReady(false);
      // 不立即启动，等待ready事件
    } else if (ocrTaskEvent === "ready") {
      console.log("收到OCR就绪信号，开始视频帧推送");
      setIsOcrReady(true);
      startCapturing();
    } else if (ocrTaskEvent === "stop") {
      console.log("收到OCR停止信号");
      setIsOcrReady(false);
      stopCapturing();
    } else if (ocrTaskEvent === "session_complete") {
      console.log("收到OCR会话完成信号，等待任务自然停止...");
      // 不立即停止，等待后端任务自然完成并发送stop事件
    }
  }, [ocrTaskEvent]);

  /**
   * 辅助函数：将 canvas.toBlob() 的回调方式包装成 Promise
   */
  const canvasToBlob = (
    canvas: HTMLCanvasElement,
    type: string = "image/png",
    quality?: number
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Canvas to Blob conversion failed"));
          }
        },
        type,
        quality
      );
    });
  };

  // 3. 核心通讯函数：使用新的push_video_frame API
  const captureAndSend = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.paused) return;

    // 检查是否需要推送帧（OCR或视觉检测）
    const shouldSendForOCR = isCapturing;
    const shouldSendForVisual = isVisualDetectionActive;
    
    if (!shouldSendForOCR && !shouldSendForVisual) {
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    // 根据任务类型选择对应的ROI
    const currentOcrRoi = ocrRoiRef.current;
    const currentVisualRoi = visualRoiRef.current;
    
    // 为OCR任务处理ROI - 现在ROI坐标已经是视频原始坐标系
    if (shouldSendForOCR && currentOcrRoi && currentOcrRoi[2] > 0 && currentOcrRoi[3] > 0) {
      const [x, y, w, h] = currentOcrRoi;
      
      // 验证ROI边界
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      const clampedX = Math.max(0, Math.min(x, videoWidth - 1));
      const clampedY = Math.max(0, Math.min(y, videoHeight - 1));
      const clampedWidth = Math.min(w, videoWidth - clampedX);
      const clampedHeight = Math.min(h, videoHeight - clampedY);
      
      if (clampedWidth > 0 && clampedHeight > 0) {
        canvas.width = clampedWidth;
        canvas.height = clampedHeight;
        context.drawImage(
          video,
          clampedX,
          clampedY,
          clampedWidth,
          clampedHeight,
          0,
          0,
          clampedWidth,
          clampedHeight
        );

        // 调试信息
        console.log("OCR ROI截取:", {
          original: currentOcrRoi,
          clamped: { x: clampedX, y: clampedY, w: clampedWidth, h: clampedHeight },
          canvas: { width: canvas.width, height: canvas.height }
        });
      } else {
        // ROI无效，使用完整画面
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        console.log("OCR使用完整画面，ROI无效");
      }
    } else if (shouldSendForVisual && currentVisualRoi && currentVisualRoi[2] > 0 && currentVisualRoi[3] > 0) {
      // 为视觉检测任务处理ROI - 现在ROI坐标已经是视频原始坐标系
      const [x, y, w, h] = currentVisualRoi;
      
      // 验证ROI边界
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      const clampedX = Math.max(0, Math.min(x, videoWidth - 1));
      const clampedY = Math.max(0, Math.min(y, videoHeight - 1));
      const clampedWidth = Math.min(w, videoWidth - clampedX);
      const clampedHeight = Math.min(h, videoHeight - clampedY);
      
      if (clampedWidth > 0 && clampedHeight > 0) {
        canvas.width = clampedWidth;
        canvas.height = clampedHeight;
        context.drawImage(
          video,
          clampedX,
          clampedY,
          clampedWidth,
          clampedHeight,
          0,
          0,
          clampedWidth,
          clampedHeight
        );

        // 调试信息
        console.log("视觉检测ROI截取:", {
          original: currentVisualRoi,
          clamped: { x: clampedX, y: clampedY, w: clampedWidth, h: clampedHeight },
          canvas: { width: canvas.width, height: canvas.height }
        });
      } else {
        // ROI无效，使用完整画面
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        console.log("视觉检测使用完整画面，ROI无效");
      }
    } else {
      // 没有ROI或ROI无效，使用完整画面
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      console.log("使用完整画面，无ROI");
    }

    try {
      const startTime = performance.now();

      // A. 将 Canvas 内容转换为 Blob（这里使用 PNG/JPEG 格式，适合 OCR）
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.8);

      // B. 从 Blob 获取底层的 ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();

      // C. 创建 Uint8Array 视图。Tauri 会对此进行优化传输。
      const encodedImageBytes = new Uint8Array(arrayBuffer);
      
      const timestamp = Date.now();

      // 根据需要推送到不同的端点
      const promises: Promise<any>[] = [];

      // 如果正在捕获，推送给OCR
      if (shouldSendForOCR) {
        promises.push(
          invoke("push_video_frame_ocr", {
            imageData: Array.from(encodedImageBytes),
            timestamp,
            width: canvas.width,
            height: canvas.height,
          })
        );
      }

      // 如果视觉检测激活，推送给视觉检测
      if (shouldSendForVisual) {
        promises.push(
          invoke("push_video_frame_visual", {
            imageData: Array.from(encodedImageBytes),
            timestamp,
            width: canvas.width,
            height: canvas.height,
          })
        );
      }

      // 等待所有推送完成
      await Promise.all(promises);

      const endTime = performance.now();
      setLastInferenceTime((endTime - startTime) / 1000);

      // 更新帧率统计
      frameRateRef.current.displayFrames++;
      const now = performance.now();
      if (now - frameRateRef.current.displayLastFrameTime >= 1000) {
        const fps = frameRateRef.current.displayFrames;
        frameRateRef.current.displayFrames = 0;
        frameRateRef.current.displayLastFrameTime = now;
        console.log(`当前帧率: ${fps} FPS`);
      }
    } catch (error) {
      console.error("推送视频帧失败:", error);
    }
  }, [canvasToBlob, isCapturing, isVisualDetectionActive]);

  // 5. 停止 OCR 会话 (自动关闭引擎)
  const stopCapturing = useCallback(() => {
    setIsCapturing(false);

    if (messageHandlerRef.current) {
      messageHandlerRef.current = null;
    }

    console.log("前端视频帧采集结束完毕，清理通道");
  }, [toast]);

  useEffect(() => {
    // 这个 Effect 只在组件第一次挂载时运行一次
    // 返回一个清理函数，这个函数将在组件被卸载时自动执行
    return () => {
      console.log("OCR component unmounting. Cleaning up all resources.");
      // 调用 stopCapturing 可以完美地停止所有正在运行的流程并清理 channel 和引擎
      stopCapturing();
    };
  }, [stopCapturing]); // 依赖 stopCapturing

  // 4. 开始 OCR 会话 (自动启动引擎)
  const startCapturing = useCallback(async () => {
    toast({ title: "正在启动 OCR 引擎..." });

    // 创建持久的消息处理器
    const messageHandler = (event: OcrEvent) => {
      console.log("Raw channel event:", event);

      if (event.session) {
        console.log("Received OCR session result:", event.session);

        // 显示会话结果
        if (event.session.is_session_complete) {
          toast({
            title: "OCR会话完成",
            description: `文本已稳定，最终内容: ${event.session.final_text}`,
          });
        }

        // 显示时间信息
        if (event.session.first_text_detected_time) {
          console.log(
            "首次检测到文本时间:",
            new Date(
              event.session.first_text_detected_time
            ).toLocaleTimeString()
          );
          setFirstTextDetectedTime(
            new Date(event.session.first_text_detected_time)
          );
        }
        if (event.session.text_stabilized_time) {
          console.log(
            "文本稳定时间:",
            new Date(event.session.text_stabilized_time).toLocaleTimeString()
          );
          setTextStabilizedTime(new Date(event.session.text_stabilized_time));
        }
      } else if (event.data) {
        console.log("Received OCR data:", event.data);
        setOcrResults(event.data);
      } else if (event.error) {
        console.error("Backend OCR Error:", event.error);
        toast({
          title: "OCR执行失败",
          description: event.error,
          variant: "destructive",
        });
        //stopCapturing();
      } else {
        console.warn("Unknown event format:", event);
      }
    };

    // 保存处理器引用
    messageHandlerRef.current = messageHandler;

    // Create and configure the channel using the `.onmessage` property
    const newChannel = new Channel<OcrEvent>();
    newChannel.onmessage = messageHandler;

    try {
      // 可以保留一个预热/检查引擎状态的命令
      await invoke("start_ocr_session", { channel: newChannel });
    } catch (error) {
      toast({
        title: "OCR 引擎初始化失败",
        description: String(error),
        variant: "destructive",
      });
      return;
    }

    // D. 更新 UI 状态，激活 useEffect 中的循环
    setIsCapturing(true);

    toast({ title: "OCR 识别已启动", description: "实时文字识别进行中。" });
  }, [toast, stopCapturing]);

  // --- ROI 和间隔设置函数 (修改为支持两种ROI) ---
  const clearOcrRoi = useCallback(() => {
    if (isCapturing) {
      toast({
        title: "操作无效",
        description: "请先停止OCR识别再清除ROI。",
        variant: "destructive",
      });
      return;
    }
    setOcrRoi(null);
    toast({ title: "OCR ROI区域已清除", description: "现在将识别整个画面。" });
  }, [isCapturing, toast]);

  const clearVisualRoi = useCallback(() => {
    if (isVisualDetectionActive) {
      toast({
        title: "操作无效",
        description: "请先停止视觉检测再清除ROI。",
        variant: "destructive",
      });
      return;
    }
    setVisualRoi(null);
    toast({ title: "视觉检测ROI区域已清除", description: "现在将检测整个画面。" });
  }, [isVisualDetectionActive, toast]);

  const startSelectingOcrROI = useCallback(() => {
    if (isCapturing) {
      toast({
        title: "操作无效",
        description: "请先停止OCR识别再修改ROI。",
        variant: "destructive",
      });
      return;
    }
    setIsSelectingOcrROI(true);
    setIsSelectingVisualROI(false); // 确保只选择一个ROI
  }, [isCapturing, toast]);

  const startSelectingVisualROI = useCallback(() => {
    if (isVisualDetectionActive) {
      toast({
        title: "操作无效",
        description: "请先停止视觉检测再修改ROI。",
        variant: "destructive",
      });
      return;
    }
    setIsSelectingVisualROI(true);
    setIsSelectingOcrROI(false); // 确保只选择一个ROI
  }, [isVisualDetectionActive, toast]);

  const updateOcrInterval = useCallback((value: string) => {
    setOcrInterval(parseFloat(value));
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      if (!videoRef.current || !canvasRef.current) return;

      const now = performance.now();
      const timeSinceLastSend = now - frameRateRef.current.lastSendTime;

      // 检查是否需要继续循环
      const shouldContinueForOCR = isCapturing;
      const shouldContinueForVisual = isVisualDetectionActive;
      
      if (!shouldContinueForOCR && !shouldContinueForVisual) {
        return;
      }

      // 根据配置决定发送间隔
      let minInterval = 0;
      if (shouldContinueForOCR) {
        minInterval = Math.max(minInterval, ocrConfig.interval * 1000);
      }
      if (shouldContinueForVisual) {
        minInterval = Math.max(minInterval, 1000 / visualConfig.frameRate);
      }

      if (timeSinceLastSend >= minInterval) {
        captureAndSend();
        frameRateRef.current.lastSendTime = now;
      }

      requestAnimationFrame(loop);
    };

    // 只要OCR捕获或视觉检测任一激活就启动循环
    if (isCapturing || isVisualDetectionActive) {
      animationFrameId = requestAnimationFrame(loop);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [captureAndSend, isCapturing, isVisualDetectionActive, ocrConfig.interval, visualConfig.frameRate]);

  const drawVisuals = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (
      !video ||
      !canvas ||
      video.paused ||
      video.ended ||
      video.videoWidth === 0
    ) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 获取容器尺寸
    const containerRect = canvas.parentElement?.getBoundingClientRect();
    if (!containerRect) return;

    // 确保canvas尺寸与显示尺寸匹配（与wake-detection-workflow一致）
    canvas.width = containerRect.width;
    canvas.height = containerRect.height;

    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 计算视频在容器中的实际显示尺寸（考虑object-fit: contain）
    const containerAspect = canvas.width / canvas.height;
    const videoAspect = video.videoWidth / video.videoHeight;

    let displayWidth, displayHeight, offsetX = 0, offsetY = 0;

    if (containerAspect > videoAspect) {
      // 容器更宽，以高度为准
      displayHeight = canvas.height;
      displayWidth = (video.videoWidth / video.videoHeight) * displayHeight;
      offsetX = (canvas.width - displayWidth) / 2;
    } else {
      // 容器更高，以宽度为准
      displayWidth = canvas.width;
      displayHeight = (video.videoHeight / video.videoWidth) * displayWidth;
      offsetY = (canvas.height - displayHeight) / 2;
    }

    // 计算缩放比例
    const scaleX = displayWidth / video.videoWidth;
    const scaleY = displayHeight / video.videoHeight;

    // 更新调试信息
    setDebugInfo({
      videoOriginalSize: { width: video.videoWidth, height: video.videoHeight },
      videoDisplaySize: { width: displayWidth, height: displayHeight },
      scaleFactors: { x: scaleX, y: scaleY }
    });

    // 设置视频尺寸稳定状态
    if (!videoSizeStable) {
      setVideoSizeStable(true);
    }

    // 只有在视频尺寸稳定后才进行绘制
    if (videoSizeStable) {
      // 绘制OCR ROI（缩放到显示尺寸）
      if (ocrRoi) {
        const displayX = offsetX + (ocrRoi[0] * scaleX);
        const displayY = offsetY + (ocrRoi[1] * scaleY);
        const displayWidth = ocrRoi[2] * scaleX;
        const displayHeight = ocrRoi[3] * scaleY;

        ctx.strokeStyle = "lime";
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.strokeRect(displayX, displayY, displayWidth, displayHeight);
        
        // 添加OCR ROI标签
        ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
        ctx.font = "bold 14px Arial";
        ctx.fillText("OCR", displayX + 5, displayY + 20);

        // 调试信息
        console.log("OCR ROI绘制:", {
          original: ocrRoi,
          display: { x: displayX, y: displayY, w: displayWidth, h: displayHeight },
          offset: { x: offsetX, y: offsetY },
          scale: { x: scaleX, y: scaleY }
        });
      }

      // 绘制视觉检测 ROI（缩放到显示尺寸）
      if (visualRoi) {
        const displayX = offsetX + (visualRoi[0] * scaleX);
        const displayY = offsetY + (visualRoi[1] * scaleY);
        const displayWidth = visualRoi[2] * scaleX;
        const displayHeight = visualRoi[3] * scaleY;

        ctx.strokeStyle = "cyan";
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.strokeRect(displayX, displayY, displayWidth, displayHeight);
        
        // 添加视觉检测 ROI标签
        ctx.fillStyle = "rgba(0, 255, 255, 0.8)";
        ctx.font = "bold 14px Arial";
        ctx.fillText("视觉检测", displayX + 5, displayY + 20);

        // 调试信息
        console.log("视觉检测ROI绘制:", {
          original: visualRoi,
          display: { x: displayX, y: displayY, w: displayWidth, h: displayHeight },
          offset: { x: offsetX, y: offsetY },
          scale: { x: scaleX, y: scaleY }
        });
      }

      // 绘制正在选择的ROI（考虑视频实际显示区域）
      if ((isSelectingOcrROI || isSelectingVisualROI) && roiStartPoint && isDrawingRef.current) {
        // 将鼠标坐标转换到视频实际显示区域
        const mouseToVideoX = (x: number) => Math.max(0, Math.min((x - offsetX) / scaleX, video.videoWidth));
        const mouseToVideoY = (y: number) => Math.max(0, Math.min((y - offsetY) / scaleY, video.videoHeight));

        // 计算ROI的原始坐标
        const videoX1 = mouseToVideoX(Math.min(roiStartPoint.x, isDrawingRef.current.x));
        const videoY1 = mouseToVideoY(Math.min(roiStartPoint.y, isDrawingRef.current.y));
        const videoX2 = mouseToVideoX(Math.max(roiStartPoint.x, isDrawingRef.current.x));
        const videoY2 = mouseToVideoY(Math.max(roiStartPoint.y, isDrawingRef.current.y));

        const videoWidth = videoX2 - videoX1;
        const videoHeight = videoY2 - videoY1;

        if (videoWidth > 0 && videoHeight > 0) {
          const displayX = offsetX + (videoX1 * scaleX);
          const displayY = offsetY + (videoY1 * scaleY);
          const displayWidth = videoWidth * scaleX;
          const displayHeight = videoHeight * scaleY;

          ctx.strokeStyle = "yellow";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(displayX, displayY, displayWidth, displayHeight);
          ctx.setLineDash([]);

          // 调试信息
          console.log("正在选择ROI:", {
            mouse: { start: roiStartPoint, current: isDrawingRef.current },
            video: { x1: videoX1, y1: videoY1, x2: videoX2, y2: videoY2, w: videoWidth, h: videoHeight },
            display: { x: displayX, y: displayY, w: displayWidth, h: displayHeight }
          });
        }
      }

      if (ocrResults?.length || 0) {
        ocrResults.forEach((result) => {
          const { combined_bbox, text } = result;
          const [x, y, w, h] = combined_bbox;

          // OCR结果已经是视频原始坐标，转换为显示坐标
          const displayX = offsetX + (x * scaleX);
          const displayY = offsetY + (y * scaleY);
          const displayW = w * scaleX;
          const displayH = h * scaleY;

          ctx.strokeStyle = "red";
          ctx.lineWidth = 2;
          ctx.strokeRect(displayX, displayY, displayW, displayH);

          const displayText = `${text}`;
          ctx.font = "bold 16px Arial";
          const textMetrics = ctx.measureText(displayText);

          ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
          ctx.fillRect(displayX, displayY - 22, textMetrics.width + 10, 20);
          ctx.fillStyle = "white";
          ctx.fillText(displayText, displayX + 5, displayY - 7);
        });
      }

      if (isCapturing) {
        ctx.fillStyle = "lime";
        ctx.font = "16px Arial";
        ctx.fillText(
          `Rust 推理: ${lastInferenceTime.toFixed(4)}s`,
          10,
          canvas.height - 10
        );
      }
    }
  }, [
    ocrRoi,
    visualRoi,
    isSelectingOcrROI,
    isSelectingVisualROI,
    roiStartPoint,
    ocrResults,
    lastInferenceTime,
    isCapturing,
    videoSizeStable,
  ]);

  useEffect(() => {
    let animationFrameId: number;
    const animationLoop = () => {
      drawVisuals();
      animationFrameId = requestAnimationFrame(animationLoop);
    };
    animationFrameId = requestAnimationFrame(animationLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [drawVisuals]);

  // --- 鼠标事件处理 (修改为与wake-detection-workflow一致的坐标系统) ---
  const getMousePos = useCallback(
    (
      canvasElement: HTMLCanvasElement,
      event: React.MouseEvent<HTMLCanvasElement>
    ) => {
      const canvas = canvasElement;
      if (!canvas) return { x: 0, y: 0 };

      // 获取鼠标在canvas上的显示坐标
      const canvasRect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - canvasRect.left;
      const mouseY = event.clientY - canvasRect.top;

      return {
        x: mouseX,
        y: mouseY,
      };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      console.log("Mouse down event:", { isCapturing, isSelectingOcrROI, isSelectingVisualROI, hasCanvas: !!canvasRef.current });
      if (isCapturing || (!isSelectingOcrROI && !isSelectingVisualROI) || !canvasRef.current) return;
      const pos = getMousePos(canvasRef.current, e);
      console.log("Mouse down position:", pos);
      setRoiStartPoint(pos);
      isDrawingRef.current = pos;
    },
    [isCapturing, isSelectingOcrROI, isSelectingVisualROI, getMousePos]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (
        isCapturing ||
        (!isSelectingOcrROI && !isSelectingVisualROI) ||
        !roiStartPoint ||
        !canvasRef.current
      )
        return;
      const pos = getMousePos(canvasRef.current, e);
      isDrawingRef.current = pos;
    },
    [isCapturing, isSelectingOcrROI, isSelectingVisualROI, roiStartPoint, getMousePos]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      console.log("Mouse up event:", { isCapturing, isSelectingOcrROI, isSelectingVisualROI, hasStartPoint: !!roiStartPoint, hasCanvas: !!canvasRef.current });
      if (
        isCapturing ||
        (!isSelectingOcrROI && !isSelectingVisualROI) ||
        !roiStartPoint ||
        !canvasRef.current
      )
        return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      // 获取容器尺寸
      const containerRect = canvas.parentElement?.getBoundingClientRect();
      if (!containerRect) return;

      const canvasWidth = containerRect.width;
      const canvasHeight = containerRect.height;

      // 计算视频显示区域（考虑object-fit: contain）- 使用完整的coordinate transformation logic
      const containerAspect = canvasWidth / canvasHeight;
      const videoAspect = video.videoWidth / video.videoHeight;

      let displayWidth, displayHeight, offsetX = 0, offsetY = 0;

      if (containerAspect > videoAspect) {
        // 容器更宽，以高度为准
        displayHeight = canvasHeight;
        displayWidth = (video.videoWidth / video.videoHeight) * displayHeight;
        offsetX = (canvasWidth - displayWidth) / 2;
      } else {
        // 容器更高，以宽度为准
        displayWidth = canvasWidth;
        displayHeight = (video.videoHeight / video.videoWidth) * displayWidth;
        offsetY = (canvasHeight - displayHeight) / 2;
      }

      const scaleX = video.videoWidth / displayWidth;
      const scaleY = video.videoHeight / displayHeight;

      // 获取鼠标在canvas上的显示坐标
      const canvasRect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - canvasRect.left;
      const mouseY = e.clientY - canvasRect.top;

      // 计算ROI在视频原始坐标系中的位置 - 确保使用完整的转换
      const startX = Math.min(roiStartPoint.x, mouseX);
      const startY = Math.min(roiStartPoint.y, mouseY);
      const endX = Math.max(roiStartPoint.x, mouseX);
      const endY = Math.max(roiStartPoint.y, mouseY);

      // 转换到视频原始坐标并确保边界
      const roiX1 = Math.max(0, Math.min((startX - offsetX) * scaleX, video.videoWidth));
      const roiY1 = Math.max(0, Math.min((startY - offsetY) * scaleY, video.videoHeight));
      const roiX2 = Math.max(0, Math.min((endX - offsetX) * scaleX, video.videoWidth));
      const roiY2 = Math.max(0, Math.min((endY - offsetY) * scaleY, video.videoHeight));

      const roiWidth = roiX2 - roiX1;
      const roiHeight = roiY2 - roiY1;

      if (roiWidth < 10 || roiHeight < 10) {
        console.log("ROI 区域太小");
        toast({
          title: "ROI区域太小",
          description: "请选择更大的区域",
          variant: "destructive",
        });
        return;
      }

      // 确保ROI不超出视频边界
      const clampedX = Math.max(0, Math.min(roiX1, video.videoWidth - 1));
      const clampedY = Math.max(0, Math.min(roiY1, video.videoHeight - 1));
      const clampedWidth = Math.min(roiWidth, video.videoWidth - clampedX);
      const clampedHeight = Math.min(roiHeight, video.videoHeight - clampedY);

      if (clampedWidth > 0 && clampedHeight > 0) {
        // 保存视频原始坐标
        const newRoi: [number, number, number, number] = [
          Math.round(clampedX),
          Math.round(clampedY),
          Math.round(clampedWidth),
          Math.round(clampedHeight),
        ];
        
        console.log("Setting new ROI:", newRoi);
        console.log("ROI计算详情:", {
          mouse: { x: mouseX, y: mouseY, start: roiStartPoint },
          display: { width: displayWidth, height: displayHeight, offsetX, offsetY },
          video: { width: video.videoWidth, height: video.videoHeight },
          scale: { x: scaleX, y: scaleY },
          roi: { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight }
        });
        
        // 根据当前选择模式设置对应的ROI
        if (isSelectingOcrROI) {
          setOcrRoi(newRoi);
          updateOcrConfig({ roi: newRoi });
          toast({
            title: "OCR ROI区域已设置",
            description: `区域大小: ${newRoi[2]}×${newRoi[3]}`,
          });
        } else if (isSelectingVisualROI) {
          setVisualRoi(newRoi);
          toast({
            title: "视觉检测ROI区域已设置", 
            description: `区域大小: ${newRoi[2]}×${newRoi[3]}`,
          });
        }
      }
      
      // 清除选择状态
      setIsSelectingOcrROI(false);
      setIsSelectingVisualROI(false);
      setRoiStartPoint(null);
      isDrawingRef.current = null;
    },
    [isCapturing, isSelectingOcrROI, isSelectingVisualROI, roiStartPoint, toast, updateOcrConfig]
  );

  const formatTimeWithMs = (date: Date | null) => {
    if (!date) return "未记录";
    return date.toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3, // 显示毫秒
    });
  };

  const formatTimeDifference = (start: Date | null, end: Date | null) => {
    if (!start || !end) return null;
    const diff = end.getTime() - start.getTime();
    return `${diff}ms`;
  };

  // 监听视频尺寸变化，确保尺寸稳定
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleResize = () => {
      // 当视频尺寸发生变化时，重置稳定状态
      setVideoSizeStable(false);
    };

    const handleLoadedMetadata = () => {
      // 视频元数据加载完成后，强制刷新Canvas尺寸
      setTimeout(() => {
        setVideoSizeStable(false);
      }, 100);
    };

    // 监听视频的loadedmetadata事件
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('resize', handleResize);
    
    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('resize', handleResize);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 控制面板 - 固定高度 */}
      <div className="flex items-center flex-wrap gap-1 flex-shrink-0 p-2 border-b bg-white">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={"ghost"} size="icon" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[500px]" align="start">
            <div className="grid gap-4">
              <h4 className="font-medium leading-none">视频配置</h4>
              
              {/* 摄像头选择 */}
              <div className="flex items-center gap-2 text-sm">
                <span className="flex-shrink-0">选择摄像头：</span>
                <Select
                  value={selectedDevice}
                  onValueChange={setSelectedDevice}
                  disabled={!devicesLoaded || videoDevices.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择摄像头" />
                  </SelectTrigger>
                  <SelectContent>
                    {videoDevices.map((device) => (
                      <SelectItem value={device.deviceId} key={device.deviceId}>
                        {device.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* OCR配置 */}
              <div className="space-y-2 border-t pt-2">
                <h5 className="text-sm font-medium">OCR配置</h5>
                <div className="flex items-center gap-2 text-sm">
                  <span>OCR 间隔 (秒):</span>
                  <Select
                    value={ocrConfig.interval.toString()}
                    onValueChange={(value) => updateOcrConfig({ interval: Number(value) })}
                    disabled={isCapturing}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="选择间隔" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.02">0.02 (50 FPS)</SelectItem>
                      <SelectItem value="0.1">0.1 (10 FPS)</SelectItem>
                      <SelectItem value="0.2">0.2 (5 FPS)</SelectItem>
                      <SelectItem value="0.5">0.5 (2 FPS)</SelectItem>
                      <SelectItem value="1.0">1.0 (1 FPS)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

              </div>

              {/* 视觉检测配置 */}
              <div className="space-y-2 border-t pt-2">
                <h5 className="text-sm font-medium">视觉检测配置</h5>
                <div className="flex items-center gap-2 text-sm">
                  <span>帧率 (FPS):</span>
                  <Select
                    value={visualConfig.frameRate.toString()}
                    onValueChange={(value) => updateVisualConfig({ frameRate: Number(value) })}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 FPS</SelectItem>
                      <SelectItem value="5">5 FPS</SelectItem>
                      <SelectItem value="10">10 FPS</SelectItem>
                      <SelectItem value="15">15 FPS</SelectItem>
                      <SelectItem value="30">30 FPS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span>阈值:</span>
                  <Select
                    value={visualConfig.threshold.toString()}
                    onValueChange={(value) => updateVisualConfig({ threshold: Number(value) })}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.3">0.3</SelectItem>
                      <SelectItem value="0.5">0.5</SelectItem>
                      <SelectItem value="0.7">0.7</SelectItem>
                      <SelectItem value="0.8">0.8</SelectItem>
                      <SelectItem value="0.9">0.9</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span>最大检测时间 (秒):</span>
                  <Select
                    value={visualConfig.maxDetectionTime.toString()}
                    onValueChange={(value) => updateVisualConfig({ maxDetectionTime: Number(value) })}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5秒</SelectItem>
                      <SelectItem value="10">10秒</SelectItem>
                      <SelectItem value="30">30秒</SelectItem>
                      <SelectItem value="60">60秒</SelectItem>
                    </SelectContent>
                  </Select>
                </div>


                {/* 模板管理 */}
                <div className="space-y-2 border-t pt-2">
                  <h6 className="text-xs font-medium">模板管理</h6>
                  <TemplateManager
                    templateFiles={visualConfig.templateData.map(([name, data]) => ({ name, data }))}
                    onTemplateFilesChange={(templates) => {
                      const templateData = templates.map(t => [t.name, t.data] as [string, string]);
                      updateVisualConfig({ templateData });
                    }}
                    disabled={isCapturing}
                    roi={visualRoi}
                    videoRef={videoRef}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* OCR ROI选择按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isSelectingOcrROI ? "destructive" : "ghost"}
              size="icon"
              onClick={startSelectingOcrROI}
              disabled={isCapturing}
              className="h-8 w-8"
            >
              <SquareDashedMousePointer className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>选择 OCR ROI 区域</p>
          </TooltipContent>
        </Tooltip>

        {/* OCR ROI清除按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={"ghost"}
              size="icon"
              onClick={clearOcrRoi}
              disabled={!ocrRoi || isCapturing}
              className="h-8 w-8"
            >
              <Eraser className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>清除 OCR ROI 区域</p>
          </TooltipContent>
        </Tooltip>

        {/* 视觉检测ROI选择按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isSelectingVisualROI ? "destructive" : "ghost"}
              size="icon"
              onClick={startSelectingVisualROI}
              disabled={isVisualDetectionActive}
              className="h-8 w-8"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>选择视觉检测 ROI 区域</p>
          </TooltipContent>
        </Tooltip>

        {/* 视觉检测ROI清除按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={"ghost"}
              size="icon"
              onClick={clearVisualRoi}
              disabled={!visualRoi || isVisualDetectionActive}
              className="h-8 w-8"
            >
              <Target className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>清除视觉检测 ROI 区域</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center text-sm text-muted-foreground gap-2 ml-2">
          <MonitorUp
            className="h-4 w-4"
            color={isCapturing ? "hsl(var(--primary))" : "orange"}
          />
          <span>
            {isCapturing
              ? `识别中 (${(1 / ocrInterval).toFixed(1)} FPS)`
              : "实时预览中"}
          </span>
        </div>
      </div>

      {/* 主要内容区域 - 使用flex布局充分利用空间 */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* 视频显示区域 - 占据大部分空间 */}
        <div className="flex-1 relative bg-gray-900 rounded-lg overflow-hidden m-2">
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            playsInline
            autoPlay
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-auto"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />
          {(isSelectingOcrROI || isSelectingVisualROI) && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 p-2 bg-black/70 rounded-md text-yellow-400 text-sm z-10">
              {isSelectingOcrROI ? "点击并拖动鼠标，选择OCR识别区域" : "点击并拖动鼠标，选择视觉检测区域"}
            </div>
          )}
        </div>

        {/* 底部信息区域 - 固定高度 */}
        <div className="flex-shrink-0 p-2 space-y-2">
          {/* OCR结果显示区域 */}
          <div className="flex-shrink-0">
            {ocrResults?.length || 0 ? (
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {ocrResults.map((result, index) => (
                  <div
                    key={index}
                    className="text-sm p-2 rounded bg-gray-50 border hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-gray-800 break-words line-clamp-1">{result.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 italic p-2 text-center">
                {isCapturing
                  ? "正在识别或未检测到文字..."
                  : "点击开始OCR识别以检测文字"}
              </div>
            )}
          </div>

          {/* 时间信息 - 固定高度 */}
          <div className="flex flex-row text-xs gap-4" style={{ height: '20px' }}>
            <div className="flex-1">
              首次检测: {firstTextDetectedTime ? formatTimeWithMs(firstTextDetectedTime) : '未记录'}
            </div>
            <div className="flex-1">
              文本稳定: {textStabilizedTime ? formatTimeWithMs(textStabilizedTime) : '未记录'}
            </div>
          </div>

          {/* 调试信息 - 可折叠 */}
          {debugInfo && (
            <details className="text-xs text-gray-500 border-t pt-1">
              <summary className="cursor-pointer hover:text-gray-700">调试信息</summary>
              <div className="mt-1 space-y-1">
                <div>视频原始尺寸: {debugInfo.videoOriginalSize.width} x {debugInfo.videoOriginalSize.height}</div>
                <div>视频显示尺寸: {debugInfo.videoDisplaySize.width.toFixed(0)} x {debugInfo.videoDisplaySize.height.toFixed(0)}</div>
                <div>缩放比例: X={debugInfo.scaleFactors.x.toFixed(2)}, Y={debugInfo.scaleFactors.y.toFixed(2)}</div>
                <div>视频尺寸稳定: {videoSizeStable ? '是' : '否'}</div>
                {canvasRef.current && (
                  <div>Canvas显示尺寸: {canvasRef.current.getBoundingClientRect().width.toFixed(0)} x {canvasRef.current.getBoundingClientRect().height.toFixed(0)}</div>
                )}
                {canvasRef.current && (
                  <div>Canvas样式尺寸: {canvasRef.current.style.width} x {canvasRef.current.style.height}</div>
                )}
                {canvasRef.current && (
                  <div>Canvas像素尺寸: {canvasRef.current.width} x {canvasRef.current.height}</div>
                )}
                {videoRef.current && canvasRef.current && (
                  <div>
                    视频位置: ({videoRef.current.getBoundingClientRect().left.toFixed(0)}, {videoRef.current.getBoundingClientRect().top.toFixed(0)})
                    Canvas位置: ({canvasRef.current.getBoundingClientRect().left.toFixed(0)}, {canvasRef.current.getBoundingClientRect().top.toFixed(0)})
                  </div>
                )}
                {videoRef.current && canvasRef.current && (
                  <div>
                    视频尺寸: {videoRef.current.getBoundingClientRect().width.toFixed(0)} x {videoRef.current.getBoundingClientRect().height.toFixed(0)}
                    Canvas尺寸: {canvasRef.current.getBoundingClientRect().width.toFixed(0)} x {canvasRef.current.getBoundingClientRect().height.toFixed(0)}
                  </div>
                )}
                {videoRef.current && (
                  <div>视频宽高比: {(videoRef.current.videoWidth / videoRef.current.videoHeight).toFixed(3)}</div>
                )}
                {videoRef.current && (
                  <div>显示宽高比: {(videoRef.current.getBoundingClientRect().width / videoRef.current.getBoundingClientRect().height).toFixed(3)}</div>
                )}
                {ocrRoi && (
                  <div>OCR ROI显示坐标: [{ocrRoi[0]}, {ocrRoi[1]}, {ocrRoi[2]}, {ocrRoi[3]}]</div>
                )}
                {visualRoi && (
                  <div>视觉检测ROI显示坐标: [{visualRoi[0]}, {visualRoi[1]}, {visualRoi[2]}, {visualRoi[3]}]</div>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export default OCRVideoComponent;
