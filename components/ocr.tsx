// components/OCRVideoComponent.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { useToast } from "./ui/use-toast";

// Define types for better type safety
interface OCRResultItem {
  text: string;
  confidence: number;
  box: [number, number][]; // Assuming box is an array of [x,y] coordinate pairs
}

interface OCRResultData {
  results: OCRResultItem[];
  inference_time: number;
}

interface ServerConfig {
  roi?: [number, number, number, number] | null;
  ocr_interval?: number;
}

interface OCRResultMessage {
  type: "ocr_result";
  data: OCRResultData;
}

interface ServerErrorMessage {
  type: "error";
  message: string;
}

interface InitMessage {
  type: "init";
  config: ServerConfig;
}

type ServerMessage = OCRResultMessage | ServerErrorMessage | InitMessage;

export function OCRVideoComponent() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null); // Changed to useRef

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [ocrResults, setOcrResults] = useState<OCRResultItem[]>([]);
  const [lastInferenceTime, setLastInferenceTime] = useState<number>(0);
  const [fps, setFps] = useState<number>(0);
  const [isSelectingROI, setIsSelectingROI] = useState<boolean>(false);
  const [roi, setRoi] = useState<[number, number, number, number] | null>(null); // [x, y, width, height]
  const [roiStartPoint, setRoiStartPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [ocrInterval, setOcrInterval] = useState<number>(0.5);
  const [serverUrl, setServerUrl] = useState<string>("ws://localhost:8765");
  const { toast } = useToast();

  const frameRateRef = useRef<{
    lastFrameTime: number;
    frames: number;
    lastSendTime: number;
    displayLastFrameTime: number;
    displayFrames: number;
  }>({
    lastFrameTime: 0,
    frames: 0,
    lastSendTime: 0,
    displayLastFrameTime: 0,
    displayFrames: 0
  });
  const activeStreamRef = useRef<MediaStream | null>(null);
  const isDrawingRef = useRef<{ x: number; y: number } | null>(null);

  const roiRef = useRef(roi);
  const ocrIntervalRef = useRef(ocrInterval);
  const isCapturingRef = useRef(isCapturing);
  const frameIdRef = useRef(0);

  useEffect(() => { roiRef.current = roi; }, [roi]);
  useEffect(() => { ocrIntervalRef.current = ocrInterval; }, [ocrInterval]);
  useEffect(() => { isCapturingRef.current = isCapturing; }, [isCapturing]);

  // 获取可用的摄像头设备
  const getVideoDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(
        (device) => device.kind === "videoinput"
      );
      setVideoDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDevice) {
        // Select first device only if none is selected
        setSelectedDevice(videoInputs[0].deviceId);
      }
    } catch (error) {
      console.error("Error enumerating devices:", error);
    }
  }, [selectedDevice]);

  // 初始化摄像头
  const initCamera = useCallback(async () => {
    if (!selectedDevice) return;
    try {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: selectedDevice },
          width: { ideal: 854 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        activeStreamRef.current = stream;
        await videoRef.current.play();
        console.log("Camera initialized");
      }
    } catch (error) {
      console.error("Error initializing camera:", error);
      toast({
        title: "初始化摄像头失败",
        description: "请检查摄像头设置",
        variant: "destructive",
      });
    }
  }, [selectedDevice]);

  // 连接到WebSocket服务器
  const connectToServer = useCallback(() => {
    try {
      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        console.log("WebSocket already connected");
        return socketRef.current;
      }
      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.CONNECTING
      ) {
        console.log("WebSocket connection in progress");
        return socketRef.current;
      }

      const newSocket = new WebSocket(serverUrl);

      newSocket.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        setIsCapturing(true);
        // 仅发送ROI配置，不再发送ocrInterval
        if (roiRef.current) {
          newSocket.send(
            JSON.stringify({
              type: "config",
              config: { roi: roiRef.current },
            })
          );
        }
        
        // 提示用户OCR识别已开始，并且无法修改ROI
        toast({
          title: "OCR识别已开始",
          description: roiRef.current ? "使用已设置的ROI区域识别" : "使用整个画面进行识别",
          variant: "default",
        });
      };

      newSocket.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);
        setIsCapturing(false); // Stop capturing if connection drops
      };

      newSocket.onerror = (event) => {
        console.error("WebSocket error:", event);
        toast({
          title: "WebSocket 连接失败",
          description: "请检查服务器设置",
          variant: "destructive",
        });
        setIsConnected(false);
        setIsCapturing(false);
      };

      newSocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as ServerMessage;

          if (message.type === "ocr_result") {
            setOcrResults(message.data.results || []);
            setLastInferenceTime(message.data.inference_time || 0);
          } else if (message.type === "error") {
            console.error("Server error:", message.message);
            toast({
              title: "服务器错误",
              description: message.message,
              variant: "destructive",
            });
          } else if (message.type === "init") {
            // Safer handling of potentially undefined optional properties
            if (message.config.hasOwnProperty('roi')) {
              // If client currently has no ROI, accept server's. Otherwise, client's current ROI takes precedence for this new session.
              if (roiRef.current === null) {
                setRoi(message.config.roi === undefined ? null : message.config.roi);
              } else {
                console.log(
                  "Client has an active ROI, ignoring ROI from server init message. Client ROI:",
                  roiRef.current,
                  "Server init ROI:",
                  message.config.roi
                );
              }
            }
            if (message.config.hasOwnProperty('ocr_interval')) {
              if (message.config.ocr_interval !== undefined) {
                const newInterval = Number(message.config.ocr_interval);
                if (!isNaN(newInterval)) {
                    setOcrInterval(newInterval);
                    // ocrIntervalRef will be updated by its own useEffect
                }
              }
            }
          }
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      };

      socketRef.current = newSocket;
      return newSocket;
    } catch (error) {
      console.error("Error connecting to WebSocket server:", error);
      toast({
        title: "WebSocket 连接失败",
        description: "请检查服务器设置",
        variant: "destructive",
      });
      return null;
    }
  }, [serverUrl, toast]);

  // 断开WebSocket连接
  const disconnectFromServer = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
    // setIsConnected(false); // onclose handler will set this
  }, []);

  // 捕获视频帧并发送到服务器
  const captureAndSend = useCallback(() => {
    // Conditions for not proceeding are checked by the loop manager (useEffect)
    // This function assumes it's called when conditions are met.

    const video = videoRef.current;
    // Double check video status, though loop manager should also check
    if (!video || video.videoWidth === 0 || video.videoHeight === 0 || video.paused || video.ended) {
      return; 
    }
    
    // socketRef and isCapturingRef should also be valid here if loop is running
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !isCapturingRef.current) {
        return;
    }

    const now = performance.now();
    const currentOcrInterval = ocrIntervalRef.current;
    const lastSendTime = frameRateRef.current.lastSendTime || 0;
    const shouldSendFrame = now - lastSendTime >= currentOcrInterval * 1000;

    if (shouldSendFrame) {
      frameRateRef.current.lastSendTime = now;

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        return; 
      }
      
      const currentRoi = roiRef.current;

      if (currentRoi && currentRoi[2] > 0 && currentRoi[3] > 0) {
        canvas.width = currentRoi[2];
        canvas.height = currentRoi[3];
        context.drawImage(
          video,
          currentRoi[0], currentRoi[1], currentRoi[2], currentRoi[3],
          0, 0, currentRoi[2], currentRoi[3]
        );
      } else {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      try {
        canvas.toBlob(async (blob) => {
          if (blob && socketRef.current?.readyState === WebSocket.OPEN && isCapturingRef.current) {
            const currentFrameId = frameIdRef.current;
            frameIdRef.current++; // Increment ref

            const metadata = JSON.stringify({
              type: "frame",
              frame_id: currentFrameId,
              width: canvas.width,
              height: canvas.height,
              is_roi: !!currentRoi,
              original_width: video.videoWidth,
              original_height: video.videoHeight,
              roi_coords: currentRoi
            });
            const metaBuffer = new TextEncoder().encode(metadata);
            const blobBuffer = await blob.arrayBuffer();
            const combined = new Uint8Array(metaBuffer.length + blobBuffer.byteLength);
            combined.set(metaBuffer);
            combined.set(new Uint8Array(blobBuffer), metaBuffer.length);
            
            socketRef.current.send(combined);
          }
        }, 'image/jpeg', 0.7);
      } catch (error) {
        console.error("Error sending frame:", error);
        if (error instanceof DOMException && error.name === "InvalidStateError") {
          toast({
            title: "WebSocket 连接已断开",
            description: "请检查服务器设置",
            variant: "destructive",
          });
        }
      }
    }
    // No more requestAnimationFrame(captureAndSend) here; the loop is managed by useEffect
  }, [toast, setOcrResults, setLastInferenceTime]); // Dependencies are stable setters and toast

  // 开始捕获
  const startCapturing = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      const newSocket = connectToServer();
      if (newSocket) {
        // Wait for connection to be established before starting capture
        newSocket.onopen = () => {
          setIsConnected(true);
          setIsCapturing(true);
          // 发送初始配置：ROI和所选间隔
          newSocket.send(
            JSON.stringify({
              type: "config",
              config: { 
                roi: roiRef.current,
                ocr_interval: ocrIntervalRef.current
              },
            })
          );
          
          toast({
            title: "OCR识别已开始",
            description: `${roiRef.current ? "使用已设置的ROI区域" : "使用整个画面"}进行识别，间隔${ocrIntervalRef.current}秒`,
            variant: "default",
          });
        };
      } else {
        toast({
          title: "建立 WebSocket 连接失败",
          description: "请检查服务器设置",
          variant: "destructive",
        });
      }
    } else {
      setIsCapturing(true);
      
      // 发送配置到服务器
      socketRef.current.send(
        JSON.stringify({
          type: "config",
          config: { 
            roi: roiRef.current,
            ocr_interval: ocrIntervalRef.current
          },
        })
      );
      
      toast({
        title: "OCR识别已开始",
        description: `${roiRef.current ? "使用已设置的ROI区域" : "使用整个画面"}进行识别，间隔${ocrIntervalRef.current}秒`,
        variant: "default",
      });
    }
  }, [connectToServer, toast]);

  // 停止捕获
  const stopCapturing = useCallback(() => {
    setIsCapturing(false);
    // 清空OCR结果
    setOcrResults([]);
    // 断开WebSocket连接
    disconnectFromServer();
  }, [disconnectFromServer]);

  // 清除ROI
  const clearRoi = useCallback(() => {
    // 如果正在进行OCR识别，则不允许清除ROI
    if (isCapturing) {
      toast({
        title: "无法清除ROI",
        description: "请先停止OCR识别再清除感兴趣区域",
        variant: "destructive",
      });
      return;
    }
    
    setRoi(null);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "config",
          config: {
            roi: null,
          },
        })
      );
    }
    
    // 提示用户ROI已清除
    toast({
      title: "ROI区域已清除",
      description: "现在将识别整个画面",
      variant: "default",
    });
  }, [isCapturing, toast]);

  // 开始选择ROI
  const startSelectingROI = useCallback(() => {
    // 如果正在进行OCR识别，则不允许修改ROI
    if (isCapturing) {
      toast({
        title: "无法修改ROI",
        description: "请先停止OCR识别再修改感兴趣区域",
        variant: "destructive",
      });
      return;
    }
    setIsSelectingROI(true);
  }, [isCapturing, toast]);

  // 更新OCR间隔
  const updateOcrInterval = useCallback((value: string) => {
    const newInterval = parseFloat(value);
    setOcrInterval(newInterval);
    // 不再发送到服务器，由前端控制帧发送频率
  }, []);

  // 初始化 & 清理
  useEffect(() => {
    getVideoDevices(); // Get devices on mount

    return () => {
      // Cleanup on unmount
      disconnectFromServer();
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [getVideoDevices, disconnectFromServer]); // Empty dependency array means this runs once on mount and cleans up on unmount

  // 当选择设备变化时初始化摄像头
  useEffect(() => {
    if (selectedDevice) {
      initCamera();
    }
  }, [selectedDevice, initCamera]);

  // 当画面显示开始时，启动显示循环
  useEffect(() => {
    if (!videoRef.current) return;
    
    const updateDisplayFps = () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
      
      // 更新显示FPS计数 - 这里始终计算FPS，无论是否正在OCR识别
      const now = performance.now();
      frameRateRef.current.displayFrames++;
      
      if (now - frameRateRef.current.displayLastFrameTime >= 1000) {
        setFps(frameRateRef.current.displayFrames);
        frameRateRef.current.displayFrames = 0;
        frameRateRef.current.displayLastFrameTime = now;
      }
      
      requestAnimationFrame(updateDisplayFps);
    };
    
    // 启动显示FPS计算循环，这会始终运行，即使未开始OCR捕获也会显示画面FPS
    requestAnimationFrame(updateDisplayFps);
    
    return () => {
      // 清理工作
    };
  }, []); // 使用空数组作为依赖，确保只在组件挂载时运行一次

  // 当捕获状态或连接状态变化时处理发送
  useEffect(() => {
    let animationFrameId: number | null = null;

    const animationLoop = () => {
      // Check conditions for continuing the loop *before* calling captureAndSend
      if (
        isCapturingRef.current &&
        socketRef.current?.readyState === WebSocket.OPEN &&
        videoRef.current &&
        !videoRef.current.paused &&
        !videoRef.current.ended &&
        videoRef.current.videoWidth > 0 && // Ensure video has dimensions
        videoRef.current.videoHeight > 0
      ) {
        captureAndSend(); // This function now only processes and sends one frame
        animationFrameId = requestAnimationFrame(animationLoop); // Schedule the next iteration
      } else if (isCapturingRef.current) {
        // If still meant to be capturing, but other conditions failed (e.g. socket not ready, video not ready),
        // try again after a short delay to avoid tight loop on failed conditions.
        animationFrameId = requestAnimationFrame(animationLoop);
      }
    };

    if (isCapturing && isConnected) {
      frameRateRef.current.lastSendTime = 0; // Reset for immediate send
      frameIdRef.current = 0; // Reset frameId on new capture session start
      animationFrameId = requestAnimationFrame(animationLoop); // Start the loop
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isCapturing, isConnected, captureAndSend]); // captureAndSend is now stable

  // 绘制视频帧和OCR结果到Canvas
  const drawVisuals = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    if (videoRef.current.paused || videoRef.current.ended) {
      requestAnimationFrame(drawVisuals); // Keep trying if video not ready
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight)
        canvas.height = video.videoHeight;
    } else {
      requestAnimationFrame(drawVisuals); // Video dimensions not yet available
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
    // Don't draw video here, video element is visible

    // 绘制ROI
    if (roi) {
      const [x, y, width, height] = roi;
      ctx.strokeStyle = "lime"; // Brighter green
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
    }

    // 绘制临时ROI选择框
    if (isSelectingROI && roiStartPoint && isDrawingRef.current) {
      ctx.strokeStyle = "yellow";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]); // Dashed line for selection
      ctx.strokeRect(
        roiStartPoint.x,
        roiStartPoint.y,
        isDrawingRef.current.x - roiStartPoint.x,
        isDrawingRef.current.y - roiStartPoint.y
      );
      ctx.setLineDash([]); // Reset line dash
    }

    // 绘制OCR结果
    if (ocrResults.length > 0 && (roiRef.current ? isCapturingRef.current : true)) {
      // Only draw if capturing OR if no ROI (global OCR)
      ctx.lineWidth = 2;
      ctx.font = "bold 16px Arial";

      ocrResults.forEach((result) => {
        const { box, text, confidence } = result;
        if (!box || box.length !== 4) return;

        ctx.strokeStyle = "red";
        ctx.beginPath();
        ctx.moveTo(box[0][0], box[0][1]);
        for (let i = 1; i < box.length; i++) {
          ctx.lineTo(box[i][0], box[i][1]);
        }
        ctx.closePath();
        ctx.stroke();

        const displayText = `${text} (${(confidence * 100).toFixed(1)}%)`;
        const textMetrics = ctx.measureText(displayText);
        const textBgX = box[0][0];
        const textBgY = box[0][1] - 22; // Position above the box

        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(textBgX, textBgY, textMetrics.width + 10, 20);

        ctx.fillStyle = "white";
        ctx.fillText(displayText, textBgX + 5, textBgY + 15);
      });
    }

    // 绘制FPS和推理时间
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(10, canvas.height - 60, 220, 50); // Positioned at bottom-left
    ctx.fillStyle = "lime";
    ctx.font = "16px Arial";
    ctx.fillText(`FPS: ${fps}`, 20, canvas.height - 40);
    
    // 只在捕获时显示推理时间
    if (isCapturing) {
      ctx.fillText(
        `Server Inference: ${lastInferenceTime.toFixed(3)}s`,
        20,
        canvas.height - 20
      );
    }

    requestAnimationFrame(drawVisuals);
  }, [
    roi,
    isSelectingROI,
    roiStartPoint,
    ocrResults,
    fps,
    lastInferenceTime,
    isCapturing,
  ]); // Added isCapturing

  // Start drawing loop for canvas visuals
  useEffect(() => {
    const animationFrameId = requestAnimationFrame(drawVisuals);
    return () => cancelAnimationFrame(animationFrameId);
  }, [drawVisuals]);

  const getMousePos = (
    canvasElement: HTMLCanvasElement,
    event: React.MouseEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const rect = canvasElement.getBoundingClientRect();
    // Scale mouse coordinates to video/canvas resolution if display size is different
    const scaleX = canvasElement.width / rect.width;
    const scaleY = canvasElement.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  // 处理鼠标事件
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // 如果正在OCR识别，不允许操作
      if (isCapturing) return;
      if (!isSelectingROI || !canvasRef.current) return;
      const pos = getMousePos(canvasRef.current, e);
      setRoiStartPoint(pos);
      isDrawingRef.current = pos; // Initialize current drawing position
    },
    [isSelectingROI, isCapturing]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // 如果正在OCR识别，不允许操作
      if (isCapturing) return;
      if (!isSelectingROI || !roiStartPoint || !canvasRef.current) return;
      const pos = getMousePos(canvasRef.current, e);
      isDrawingRef.current = pos; // Update current drawing position for visual feedback
    },
    [isSelectingROI, roiStartPoint, isCapturing]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // 如果正在OCR识别，不允许操作
      if (isCapturing) return;
      if (!isSelectingROI || !roiStartPoint || !canvasRef.current) return;

      const pos = getMousePos(canvasRef.current, e);

      const x1 = Math.min(roiStartPoint.x, pos.x);
      const y1 = Math.min(roiStartPoint.y, pos.y);
      const x2 = Math.max(roiStartPoint.x, pos.x);
      const y2 = Math.max(roiStartPoint.y, pos.y);

      const newRoi: [number, number, number, number] = [
        Math.max(0, Math.round(x1)), // Ensure ROI is within canvas bounds
        Math.max(0, Math.round(y1)),
        Math.min(canvasRef.current.width - x1, Math.round(x2 - x1)),
        Math.min(canvasRef.current.height - y1, Math.round(y2 - y1)),
      ];

      // Ensure ROI has a minimum size
      if (newRoi[2] < 10 || newRoi[3] < 10) {
        console.log("ROI too small, not setting.");
        setIsSelectingROI(false);
        setRoiStartPoint(null);
        isDrawingRef.current = null;
        return;
      }

      setRoi(newRoi);

      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        socketRef.current.send(
          JSON.stringify({
            type: "config",
            config: {
              roi: newRoi,
            },
          })
        );
      }

      setIsSelectingROI(false);
      setRoiStartPoint(null);
      isDrawingRef.current = null;
      
      // 提示用户ROI已设置成功
      toast({
        title: "ROI区域已设置",
        description: `区域大小: ${newRoi[2]}x${newRoi[3]}`,
        variant: "default",
      });
    },
    [isSelectingROI, roiStartPoint, isCapturing, toast]
  );

  return (
    <div className="flex flex-col p-4 rounded-lg shadow-md bg-white space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        {/* Connection & Device Controls */}
        <div className="space-y-2">
          {/* <Input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="WebSocket URL (e.g., ws://localhost:8765)"
            className="w-full p-2 text-black bg-white"
          /> */}
          <Select
            value={selectedDevice}
            onValueChange={(value) => setSelectedDevice(value)}
            disabled={videoDevices.length === 0}
          >
            <SelectTrigger className="bg-white text-black">
              <SelectValue placeholder="Select a camera" />
            </SelectTrigger>
            <SelectContent>
              {videoDevices.map((device) => (
                <SelectItem value={device.deviceId} key={device.deviceId}>{device.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isCapturing ? (
            <Button
              onClick={startCapturing}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={videoDevices.length === 0 || !selectedDevice}
            >
              开始 OCR 识别
            </Button>
          ) : (
            <button
              onClick={stopCapturing}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
            >
              停止 OCR 识别
            </button>
          )}
        </div>

        {/* ROI & Interval Controls */}
        <div className="h-full space-y-2">
          <div className="flex space-x-2">
            <Button
              onClick={startSelectingROI}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isCapturing}
            >
              {roi ? "重新选择 ROI" : "选择 ROI 区域"}
            </Button>
            <Button
              onClick={clearRoi}
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!roi || isCapturing}
            >
              清除 ROI 区域
            </Button>
          </div>
          <div className="flex items-center space-x-2 text-sm">
            <label htmlFor="ocrInterval" className="whitespace-nowrap">
              OCR 间隔 (秒):
            </label>
            <Select
              value={ocrInterval.toString()}
              onValueChange={(value) => updateOcrInterval(value)}
              disabled={isCapturing}
            >
              <SelectTrigger className="bg-white text-black w-32">
                <SelectValue placeholder="选择间隔" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.1">0.1 (10 FPS)</SelectItem>
                <SelectItem value="0.2">0.2 (5 FPS)</SelectItem>
                <SelectItem value="0.5">0.5 (2 FPS)</SelectItem>
                <SelectItem value="1.0">1.0 (1 FPS)</SelectItem>
                <SelectItem value="2.0">2.0 (0.5 FPS)</SelectItem>
                <SelectItem value="5.0">5.0 (0.2 FPS)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm">
            连接状态:{" "}
            <span
              className={`font-semibold ${
                isConnected ? "text-green-400" : "text-red-400"
              }`}
            >
              {isConnected ? "已连接" : "未连接"}
            </span>
            {isCapturing && (
              <span className="ml-2 text-blue-400">
                OCR识别中 (发送频率: {(1/ocrInterval).toFixed(1)}帧/秒)
              </span>
            )}
            {!isCapturing && (
              <span className="ml-2 text-yellow-400">
                实时预览中 (未进行OCR识别)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Video and Canvas Container */}
      <div className="flex-grow relative flex flex-col justify-center items-center bg-white rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="max-w-full max-h-full object-contain" // Scales video within container
          playsInline
          autoPlay // Added autoPlay
          muted
          onLoadedMetadata={() => {
            // Ensure canvas is resized when video metadata is loaded
            if (videoRef.current && canvasRef.current) {
              canvasRef.current.width = videoRef.current.videoWidth;
              canvasRef.current.height = videoRef.current.videoHeight;
            }
          }}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full" // Overlay canvas
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ imageRendering: "pixelated" }} // For sharper rendering if canvas is scaled by CSS
        />
        {isSelectingROI && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 p-2 bg-black bg-opacity-70 rounded-md text-yellow-400 text-sm z-10">
            点击并拖动鼠标，选择要识别的区域
          </div>
        )}
      </div>

      {/* Result Panel */}
      <div className="w-full">
        <div className="space-y-1 text-sm">
          {ocrResults.length > 0 ? (
            ocrResults.map((result, index) => (
              <div
                key={index}
                className="flex justify-between items-center p-1.5 rounded"
              >
                <span className="text-gray-200">{result.text}</span>
                <span className="text-green-400 font-mono text-xs">
                  {(result.confidence * 100).toFixed(1)}%
                </span>
              </div>
            ))
          ) : (
            <div className="text-gray-400 italic">
              {isCapturing
                ? "未检测到文字或正在等待结果..."
                : "点击开始OCR识别来检测文字"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OCRVideoComponent;
