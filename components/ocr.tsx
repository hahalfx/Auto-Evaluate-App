// components/OCRVideoComponent.tsx
"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
// 1. 引入 Tauri API
import { invoke } from "@tauri-apps/api/core";

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

// 2. 定义与 Rust 后端匹配的类型
interface RustOcrResultItem {
  text: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
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
  const [ocrInterval, setOcrInterval] = useState<number>(0.5); // 识别间隔 (秒)
  const { toast } = useToast();
  const [isInitializing, setIsInitializing] = useState(false);
  const [devicesLoaded, setDevicesLoaded] = useState(false);

  // --- Refs for Callbacks (保持不变) ---
  const roiRef = useRef(roi);
  const ocrIntervalRef = useRef(ocrInterval);
  const isCapturingRef = useRef(isCapturing);
  useEffect(() => {
    roiRef.current = roi;
  }, [roi]);
  useEffect(() => {
    ocrIntervalRef.current = ocrInterval;
  }, [ocrInterval]);
  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  // --- 摄像头和设备逻辑 (修复循环依赖) ---
  const getVideoDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
        });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(
        (d) => d.kind === "videoinput" && d.deviceId
      );
      setVideoDevices(videoInputs);
      return videoInputs;
    } catch (error) {
      console.error("无法获取摄像头设备:", error);
      toast({
        title: "摄像头错误",
        description: "无法获取视频设备列表，请检查权限。",
        variant: "destructive",
      });
      return [];
    } finally {
      setDevicesLoaded(true);
    }
  }, [toast]);

  const initCamera = useCallback(async () => {
    if (!selectedDevice || isInitializing) return;

    // 防止重复初始化同一设备
    if (
      lastInitializedDeviceRef.current === selectedDevice &&
      activeStreamRef.current
    ) {
      return;
    }

    if (initializationPromiseRef.current) {
      try {
        await initializationPromiseRef.current;
      } catch (e) {}
    }

    const promise = (async () => {
      setIsInitializing(true);
      try {
        if (activeStreamRef.current) {
          activeStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: selectedDevice },
            width: { ideal: 854 },
            height: { ideal: 480 },
          },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          activeStreamRef.current = stream;
          lastInitializedDeviceRef.current = selectedDevice;
          await videoRef.current.play();
        }
      } catch (error) {
        console.error("摄像头初始化失败:", error);
        toast({
          title: "摄像头初始化失败",
          description: (error as Error).message,
          variant: "destructive",
        });
        throw error;
      } finally {
        setIsInitializing(false);
        initializationPromiseRef.current = null;
      }
    })();
    initializationPromiseRef.current = promise;
    return promise;
  }, [selectedDevice, toast]);

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

  // 3. 核心通讯函数：调用 Rust 后端
  const captureAndSend = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.paused) return;

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

      // A. 将 Canvas 内容转换为 Blob（这里使用 PNG 格式，适合 OCR）
      const blob = await canvasToBlob(canvas, "image/png");

      // B. 从 Blob 获取底层的 ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();

      // C. 创建 Uint8Array 视图。Tauri 会对此进行优化传输。
      const encodedImageBytes = new Uint8Array(arrayBuffer);

      const results = await invoke<RustOcrResultItem[]>("perform_ocr", {
        imageData: encodedImageBytes,
        width: canvas.width,
        height: canvas.height,
      });
      const endTime = performance.now();

      setOcrResults(results);
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

  // 4. 开始/停止OCR识别函数
  const startCapturing = useCallback(async () => {
    try {
      await invoke("perform_ocr_only");
      toast({
        title: "OCR 引擎已启动",
        description: "现在开始进行实时文字识别。",
      });
      setIsCapturing(true);
    } catch (error) {
      console.error("启动OCR识别失败:", error);
      toast({
        title: "OCR识别启动失败",
        description: String(error),
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopCapturing = useCallback(() => {
    setIsCapturing(false);
    setOcrResults([]);
    toast({
      title: "OCR 识别已停止",
      description: "实时文字识别已停止。",
    });
  }, [toast]);

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

  // --- Effect Hooks (修复循环依赖) ---
  useEffect(() => {
    let isMounted = true;

    const loadDevices = async () => {
      const devices = await getVideoDevices();
      // 只在组件仍然挂载且没有选中设备时设置默认设备
      if (isMounted && devices.length > 0 && !selectedDevice) {
        setSelectedDevice(devices[0].deviceId || "default");
      }
    };

    loadDevices();

    return () => {
      isMounted = false;
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []); // 移除依赖，只在组件挂载时执行一次

  useEffect(() => {
    if (devicesLoaded && selectedDevice) {
      initCamera();
    }
  }, [devicesLoaded, selectedDevice]); // 移除 initCamera 依赖

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
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [captureAndSend]);

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

    if (ocrResults.length > 0) {
      ocrResults.forEach((result) => {
        const { bbox, text, confidence } = result;
        const [x, y, w, h] = bbox;

        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        const displayText = `${text} (${confidence.toFixed(1)}%)`;
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
        `Rust 推理: ${lastInferenceTime.toFixed(3)}s`,
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

        <div className="flex-grow" />

        <div className="flex items-center gap-2">
          {!isCapturing ? (
            <Button
              onClick={startCapturing}
              disabled={!devicesLoaded || isInitializing}
            >
              <Scan className="h-4 w-4 mr-2" />
              开始 OCR 识别
            </Button>
          ) : (
            <Button onClick={stopCapturing} variant="destructive">
              停止 OCR 识别
            </Button>
          )}
        </div>

        <div className="flex items-center text-sm text-muted-foreground gap-2">
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

      <div className="h-24 overflow-y-auto text-sm pr-2">
        {ocrResults.length > 0 ? (
          ocrResults.map((result, index) => (
            <div
              key={index}
              className="flex justify-between items-center p-1.5 rounded hover:bg-gray-100"
            >
              <span className="text-gray-800">{result.text}</span>
              <span className="text-primary font-mono text-xs font-semibold">
                {result.confidence.toFixed(1)}%
              </span>
            </div>
          ))
        ) : (
          <div className="text-gray-400 italic pt-2">
            {isCapturing
              ? "正在识别或未检测到文字..."
              : "点击“开始OCR识别”以检测文字"}
          </div>
        )}
      </div>
    </div>
  );
}

export default OCRVideoComponent;
