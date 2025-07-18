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
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { set } from "date-fns";

// 2. 定义与 Rust 后端匹配的类型
interface RustOcrResultItem {
  text: string;
  combined_bbox: [number, number, number, number]; // [x, y, width, height]
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

export function OCRVideoComponent() {
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
  const [isSelectingROI, setIsSelectingROI] = useState<boolean>(false);
  const [roi, setRoi] = useState<[number, number, number, number] | null>(null);
  const [roiStartPoint, setRoiStartPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [ocrInterval, setOcrInterval] = useState<number>(0.033); // 识别间隔 (秒)
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

  // --- Refs for Callbacks (保持不变) ---
  const roiRef = useRef(roi);
  const ocrIntervalRef = useRef(ocrInterval);
  const isCapturingRef = useRef(isCapturing);

  // 使用 useEffect 来同步 state 到 ref
  useEffect(() => {
    roiRef.current = roi;
  }, [roi]);
  useEffect(() => {
    ocrIntervalRef.current = ocrInterval;
  }, [ocrInterval]);
  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  // // 初始化WebWorker
  // useEffect(() => {
  //   workerRef.current = new Worker("/ocr-worker.js");

  //   workerRef.current.onmessage = (e) => {
  //     const { type, data } = e.data;
  //     if (type === "FRAME_QUEUED") {
  //       // 使用新的push_video_frame API
  //       invoke("push_video_frame", {
  //         imageData: data.imageData,
  //         timestamp: data.timestamp,
  //         width: data.width,
  //         height: data.height,
  //       });
  //     } else if (type === "ERROR") {
  //       console.error("WebWorker error:", data);
  //     }
  //   };

  //   workerRef.current.onerror = (error) => {
  //     console.error("WebWorker error:", error);
  //   };

  //   return () => {
  //     if (workerRef.current) {
  //       workerRef.current.terminate();
  //     }
  //   };
  // }, []);

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

    // 实时检查是否应该停止
    if (!isCapturingRef.current) {
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    const currentRoi = roiRef.current;
    if (currentRoi && currentRoi[2] > 0 && currentRoi[3] > 0) {
      canvas.width = currentRoi[2];
      canvas.height = currentRoi[3];
      context.drawImage(
        video,
        currentRoi[0],
        currentRoi[1],
        currentRoi[2],
        currentRoi[3],
        0,
        0,
        currentRoi[2],
        currentRoi[3]
      );
    } else {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    try {
      const startTime = performance.now();

      // A. 将 Canvas 内容转换为 Blob（这里使用 PNG/JPEG 格式，适合 OCR）
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.8);

      // B. 从 Blob 获取底层的 ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();

      // C. 创建 Uint8Array 视图。Tauri 会对此进行优化传输。
      const encodedImageBytes = new Uint8Array(arrayBuffer);
      // 实时检查是否应该停止
      if (!isCapturingRef.current) {
        return;
      }
      const timestamp = Date.now();
      // // 使用新的push_video_frame API

      // if (workerRef.current) {
      //   workerRef.current.postMessage({
      //     type: "PROCESS_FRAME",
      //     data: {
      //       imageData: encodedImageBytes,
      //       roi: roiRef.current,
      //       timestamp: timestamp,
      //       width: canvas.width,
      //       height: canvas.height,
      //     },
      //   });
      // } else {
      //   // 回退到直接调用新的API
      //   await invoke("push_video_frame", {
      //     imageData: encodedImageBytes,
      //     timestamp: timestamp,
      //     width: canvas.width,
      //     height: canvas.height,
      //   });
      // }

      await invoke("push_video_frame", {
        imageData: encodedImageBytes,
        timestamp: timestamp,
        width: canvas.width,
        height: canvas.height,
      });

      const endTime = performance.now();
      setLastInferenceTime((endTime - startTime) / 1000);
    } catch (error) {
      console.error("OCR 命令调用失败:", error);
      toast({
        title: "OCR 执行失败",
        description: String(error),
        variant: "destructive",
      });
      if (String(error).includes("not initialized")) {
        setIsCapturing(false);
      }
    }
  }, [toast]);

  // 5. 停止 OCR 会话 (自动关闭引擎)
  const stopCapturing = useCallback(() => {
    setIsCapturing(false);

    if (messageHandlerRef.current) {
      messageHandlerRef.current = null;
    }

    // // 清理WebWorker队列
    // if (workerRef.current) {
    //   workerRef.current.postMessage({ type: "CLEAR_QUEUE" });
    // }

    // invoke("stop_ocr_session")
    //   .then(() => {
    //     toast({ title: "OCR识别已停止" });
    //     // 在停止会话后，自动关闭引擎
    //     return invoke("shutdown_ocr_engine");
    //   })
    //   .then(() => {
    //     console.log("OCR engine shutdown automatically.");
    //   })
    //   .catch(console.error);

    console.log("前端视频帧采集结束完毕，清理通道");
  }, [toast]);

  useEffect(() => {
    // 这个 Effect 只在组件第一次挂载时运行一次
    // 返回一个清理函数，这个函数将在组件被卸载时自动执行
    return () => {
      console.log("OCR component unmounting. Cleaning up all resources.");
      // 调用 stopCapturing 可以完美地停止所有正在运行的流程并清理 channel 和引擎
      stopCapturing();

      // // 确保摄像头也被关闭
      // if (activeStreamRef.current) {
      //   activeStreamRef.current.getTracks().forEach((track) => track.stop());
      // }
    };
  }, [stopCapturing]); // 依赖 stopCapturing

  // 4. 开始 OCR 会话 (自动启动引擎)
  const startCapturing = useCallback(async () => {
    toast({ title: "正在启动 OCR 引擎..." });

    // 这一步目前已经改为后端ocr_task先启动了，所以这里可以注释掉
    // try {
    //   // 第一步：自动初始化引擎
    //   await invoke("initialize_ocr_engine");
    //   toast({ title: "引擎已就绪，正在准备识别会话..." });
    // } catch (error) {
    //   toast({
    //     title: "OCR 引擎启动失败",
    //     description: String(error),
    //     variant: "destructive",
    //   });
    //   return; // 引擎启动失败，则不继续
    // }

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

          //这里停止ocr的消息不通过channel获得，通过event获得，这里先注释掉
          // // 如果应该停止OCR
          // if (event.session.should_stop_ocr) {
          //   stopCapturing();
          // }
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

  // --- ROI 和间隔设置函数 (保持不变) ---
  const clearRoi = useCallback(() => {
    if (isCapturing) {
      toast({
        title: "操作无效",
        description: "请先停止OCR识别再清除ROI。",
        variant: "destructive",
      });
      return;
    }
    setRoi(null);
    toast({ title: "ROI区域已清除", description: "现在将识别整个画面。" });
  }, [isCapturing, toast]);

  const startSelectingROI = useCallback(() => {
    if (isCapturing) {
      toast({
        title: "操作无效",
        description: "请先停止OCR识别再修改ROI。",
        variant: "destructive",
      });
      return;
    }
    setIsSelectingROI(true);
  }, [isCapturing, toast]);

  const updateOcrInterval = useCallback((value: string) => {
    setOcrInterval(parseFloat(value));
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      if (isCapturingRef.current) {
        const now = performance.now();
        if (
          now - frameRateRef.current.lastSendTime >=
          ocrIntervalRef.current * 1000
        ) {
          frameRateRef.current.lastSendTime = now;
          captureAndSend();
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    // 只在开始捕获时启动循环
    if (isCapturing) {
      animationFrameId = requestAnimationFrame(loop);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [captureAndSend, isCapturing]);

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

    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (roi) {
      ctx.strokeStyle = "lime";
      ctx.lineWidth = 3;
      ctx.strokeRect(...roi);
    }

    if (isSelectingROI && roiStartPoint && isDrawingRef.current) {
      ctx.strokeStyle = "yellow";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        roiStartPoint.x,
        roiStartPoint.y,
        isDrawingRef.current.x - roiStartPoint.x,
        isDrawingRef.current.y - roiStartPoint.y
      );
      ctx.setLineDash([]);
    }

    if (ocrResults?.length || 0) {
      ocrResults.forEach((result) => {
        const { combined_bbox, text } = result;
        const [x, y, w, h] = combined_bbox;

        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        const displayText = `${text}`;
        ctx.font = "bold 16px Arial";
        const textMetrics = ctx.measureText(displayText);

        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(x, y - 22, textMetrics.width + 10, 20);
        ctx.fillStyle = "white";
        ctx.fillText(displayText, x + 5, y - 7);
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
  }, [
    roi,
    isSelectingROI,
    roiStartPoint,
    ocrResults,
    lastInferenceTime,
    isCapturing,
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

  // --- 鼠标事件处理 (基本不变, 移除了WebSocket相关部分) ---
  const getMousePos = useCallback(
    (
      canvasElement: HTMLCanvasElement,
      event: React.MouseEvent<HTMLCanvasElement>
    ) => {
      const rect = canvasElement.getBoundingClientRect();
      const scaleX = canvasElement.width / rect.width;
      const scaleY = canvasElement.height / rect.height;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isCapturing || !isSelectingROI || !canvasRef.current) return;
      const pos = getMousePos(canvasRef.current, e);
      setRoiStartPoint(pos);
      isDrawingRef.current = pos;
    },
    [isCapturing, isSelectingROI, getMousePos]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (
        isCapturing ||
        !isSelectingROI ||
        !roiStartPoint ||
        !canvasRef.current
      )
        return;
      isDrawingRef.current = getMousePos(canvasRef.current, e);
    },
    [isCapturing, isSelectingROI, roiStartPoint, getMousePos]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (
        isCapturing ||
        !isSelectingROI ||
        !roiStartPoint ||
        !canvasRef.current
      )
        return;
      const pos = getMousePos(canvasRef.current, e);
      const x1 = Math.min(roiStartPoint.x, pos.x);
      const y1 = Math.min(roiStartPoint.y, pos.y);
      const w = Math.abs(pos.x - roiStartPoint.x);
      const h = Math.abs(pos.y - roiStartPoint.y);

      if (w < 10 || h < 10) {
        console.log("ROI 区域太小");
      } else {
        const newRoi: [number, number, number, number] = [
          Math.round(x1),
          Math.round(y1),
          Math.round(w),
          Math.round(h),
        ];
        setRoi(newRoi);
        toast({
          title: "ROI区域已设置",
          description: `区域大小: ${newRoi[2]}x${newRoi[3]}`,
        });
      }
      setIsSelectingROI(false);
      setRoiStartPoint(null);
      isDrawingRef.current = null;
    },
    [isCapturing, isSelectingROI, roiStartPoint, toast, getMousePos]
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

  return (
    <div className="flex flex-col p-4 rounded-lg border bg-white space-y-2 h-full">
      <div className="flex items-center flex-wrap gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={"ghost"} size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="grid gap-4">
              <h4 className="font-medium leading-none">OCR设置</h4>
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
              <div className="flex items-center gap-2 text-sm">
                <span>OCR 间隔 (秒):</span>
                <Select
                  value={ocrInterval.toString()}
                  onValueChange={updateOcrInterval}
                  disabled={isCapturing}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="选择间隔" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.033">0 (30 FPS)</SelectItem>
                    <SelectItem value="0.1">0.1 (10 FPS)</SelectItem>
                    <SelectItem value="0.2">0.2 (5 FPS)</SelectItem>
                    <SelectItem value="0.5">0.5 (2 FPS)</SelectItem>
                    <SelectItem value="1.0">1.0 (1 FPS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={"ghost"}
              size="icon"
              onClick={startSelectingROI}
              disabled={isCapturing}
            >
              <SquareDashedMousePointer className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>选择 ROI 区域</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={"ghost"}
              size="icon"
              onClick={clearRoi}
              disabled={!roi || isCapturing}
            >
              <Eraser className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>清除 ROI 区域</p>
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

      <div className="flex-grow relative flex justify-center items-center bg-gray-900/50 rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="max-w-full max-h-full"
          playsInline
          autoPlay
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
        {isSelectingROI && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 p-2 bg-black/70 rounded-md text-yellow-400 text-sm z-10">
            点击并拖动鼠标，选择要识别的区域
          </div>
        )}
      </div>

      <div className="h-20 overflow-y-auto text-sm pr-2">
        {ocrResults?.length || 0 ? (
          ocrResults.map((result, index) => (
            <div
              key={index}
              className="flex justify-between items-center p-1.5 rounded hover:bg-gray-100"
            >
              <span className="text-gray-800">{result.text}</span>
            </div>
          ))
        ) : (
          <div className="text-gray-400 italic pt-2">
            {isCapturing
              ? "正在识别或未检测到文字..."
              : "点击开始OCR识别以检测文字"}
          </div>
        )}
      </div>
      <div className="flex flex-row text-sm pr-2">
        <div className="flex-1">
          首次检测到文本时间:
          {firstTextDetectedTime && (
            <span className="text-gray-800">
              {formatTimeWithMs(firstTextDetectedTime)}
            </span>
          )}
        </div>
        <div className="flex-1">
          文本稳定时间:
          {textStabilizedTime && (
            <span className="text-gray-800">
              {formatTimeWithMs(textStabilizedTime)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default OCRVideoComponent;
