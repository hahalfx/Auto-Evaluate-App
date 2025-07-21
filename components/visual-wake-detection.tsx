"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { 
  Play, 
  Square, 
  Settings, 
  Camera, 
  Target,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Upload,
  Trash2,
  FileImage
} from "lucide-react";

interface VisualWakeEvent {
  event_type: string;
  confidence?: number;
  timestamp: number;
  message?: string;
}

interface DetectionResult {
  success: boolean;
  confidence?: number;
  timestamp: number;
  message: string;
}

export function VisualWakeDetectionComponent() {
  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // State
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [isSelectingROI, setIsSelectingROI] = useState<boolean>(false);
  const [roi, setRoi] = useState<[number, number, number, number] | null>(null);
  const [roiStartPoint, setRoiStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState<{ x: number; y: number } | null>(null);
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>([]);
  const [lastDetection, setLastDetection] = useState<DetectionResult | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  
  // 模板相关状态
  const [templateFiles, setTemplateFiles] = useState<{name: string, data: string}[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  const { toast } = useToast();

  // 初始化摄像头
  useEffect(() => {
    let isCancelled = false;

    const setupCamera = async () => {
      setIsInitializing(true);

      try {
        // 获取设备权限
        await navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((stream) => {
            stream.getTracks().forEach((track) => track.stop());
          });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(
          (d) => d.kind === "videoinput" && d.deviceId
        );

        if (isCancelled) return;

        setVideoDevices(videoInputs);
        setDevicesLoaded(true);

        const deviceToUse = selectedDevice || (videoInputs.length > 0 ? videoInputs[0].deviceId : null);

        if (!deviceToUse) {
          throw new Error("没有找到可用的摄像头设备。");
        }

        if (deviceToUse !== selectedDevice) {
          setSelectedDevice(deviceToUse);
        }

        // 关闭旧流
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

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          activeStreamRef.current = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        if (isCancelled) return;

        console.error("摄像头设置过程中出错:", error);
        toast({
          title: "摄像头错误",
          description: (error as Error).message,
          variant: "destructive",
        });
      } finally {
        if (!isCancelled) {
          setIsInitializing(false);
        }
      }
    };

    setupCamera();

    return () => {
      isCancelled = true;
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [selectedDevice, toast]);

  // 监听视觉检测事件
  useEffect(() => {
    let unlistenVisualWake: (() => void) | null = null;
    let unlistenVisualStatus: (() => void) | null = null;

    const setupListeners = async () => {
      try {
        unlistenVisualWake = await listen<VisualWakeEvent>('visual_wake_event', (event) => {
          const { event_type, confidence, timestamp, message } = event.payload;
          
          const result: DetectionResult = {
            success: event_type === 'wake_detected',
            confidence,
            timestamp,
            message: message || event_type,
          };

          setLastDetection(result);
          setDetectionResults(prev => [result, ...prev.slice(0, 9)]); // 保留最近10个结果

          if (event_type === 'wake_detected') {
            toast({
              title: "检测成功",
              description: `匹配度: ${confidence?.toFixed(3)}`,
              variant: "default",
            });
          } else if (event_type === 'detection_error') {
            toast({
              title: "检测错误",
              description: message,
              variant: "destructive",
            });
          }
        });

        unlistenVisualStatus = await listen('visual_wake_status', (event) => {
          const status = event.payload;
          console.log('视觉检测状态:', status);
          
          if (status === 'started') {
            setIsDetecting(true);
            toast({
              title: "视觉检测已启动",
              description: "正在监控唤醒UI",
              variant: "default",
            });
          } else if (status === 'stopped') {
            setIsDetecting(false);
            toast({
              title: "视觉检测已停止",
              description: "停止监控唤醒UI",
              variant: "default",
            });
          } else if (status === 'calibrated') {
            setIsCalibrating(false);
            toast({
              title: "校准完成",
              description: "阈值已自动调整",
              variant: "default",
            });
          }
        });
      } catch (error) {
        console.error('设置事件监听器失败:', error);
      }
    };

    setupListeners();

    return () => {
      if (unlistenVisualWake) {
        unlistenVisualWake();
      }
      if (unlistenVisualStatus) {
        unlistenVisualStatus();
      }
    };
  }, [toast]);

  // 选择模板图像（使用HTML文件选择器）
  const selectTemplateImages = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/png,image/jpeg,image/jpg,image/bmp';
    
    input.onchange = async (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        setIsLoadingTemplates(true);
        try {
          const newTemplates: {name: string, data: string}[] = [];
          
          // 读取每个文件并转换为Base64
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            
            await new Promise<void>((resolve, reject) => {
              reader.onload = () => {
                if (reader.result) {
                  const base64Data = (reader.result as string).split(',')[1]; // 移除data URL前缀
                  newTemplates.push({
                    name: file.name,
                    data: base64Data
                  });
                }
                resolve();
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }
          
          setTemplateFiles(prev => [...prev, ...newTemplates]);
          toast({
            title: "模板选择成功",
            description: `已选择 ${newTemplates.length} 个模板文件`,
            variant: "default",
          });
        } catch (error) {
          toast({
            title: "处理文件失败",
            description: String(error),
            variant: "destructive",
          });
        } finally {
          setIsLoadingTemplates(false);
        }
      }
    };
    
    input.click();
  };

  // 删除模板
  const removeTemplate = (index: number) => {
    setTemplateFiles(prev => prev.filter((_, i) => i !== index));
    toast({
      title: "模板已删除",
      description: "模板文件已从列表中移除",
      variant: "default",
    });
  };

  // 清空所有模板
  const clearAllTemplates = () => {
    setTemplateFiles([]);
    toast({
      title: "模板已清空",
      description: "所有模板文件已清除",
      variant: "default",
    });
  };

  // 开始视觉检测
  const startVisualDetection = async () => {
    console.log("startVisualDetection 被调用");
    console.log("模板文件数量:", templateFiles.length);
    
    if (templateFiles.length === 0) {
      console.log("没有模板文件，显示错误提示");
      toast({
        title: "启动失败",
        description: "请先选择至少一个模板图像",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log("准备启动视觉检测...");
      // 使用Base64数据启动检测
      const templateData = templateFiles.map(template => [template.name, template.data]);
      console.log("模板数据准备完成，数量:", templateData.length);
      console.log("ROI数据:", roi);
      console.log("处理后的ROI:", roi ? roi.map(val => Math.round(val)) : undefined);
      
      await invoke('start_visual_wake_detection_with_data', {
        templateData,
        roi: roi ? roi.map(val => Math.round(val)) : undefined
      });
      
      console.log("Tauri 命令调用成功");
      setIsDetecting(true);
      setIsCapturing(true);
      
      toast({
        title: "检测已启动",
        description: "视觉检测已成功启动",
        variant: "default",
      });
    } catch (error) {
      console.error("启动视觉检测失败:", error);
      toast({
        title: "启动视觉检测失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  // 停止视觉检测
  const stopVisualDetection = async () => {
    try {
      await invoke('stop_visual_wake_detection');
      setIsDetecting(false);
      setIsCapturing(false);
    } catch (error) {
      toast({
        title: "停止视觉检测失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  // 校准视觉检测
  const calibrateVisualDetection = async () => {
    try {
      setIsCalibrating(true);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (videoRef.current && ctx) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
        });
        
        const arrayBuffer = await blob.arrayBuffer();
        const imageData = new Uint8Array(arrayBuffer);
        
        await invoke('calibrate_visual_detection', {
          frameData: Array.from(imageData)
        });
      }
    } catch (error) {
      setIsCalibrating(false);
      toast({
        title: "校准失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  // 鼠标事件处理
  const getMousePos = useCallback((canvasElement: HTMLCanvasElement, event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasElement.getBoundingClientRect();
    const scaleX = canvasElement.width / rect.width;
    const scaleY = canvasElement.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelectingROI) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const pos = getMousePos(canvas, event);
    setRoiStartPoint(pos);
    setIsDrawing(pos);
  }, [isSelectingROI, getMousePos]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelectingROI || !roiStartPoint) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const pos = getMousePos(canvas, event);
    setIsDrawing(pos);
  }, [isSelectingROI, roiStartPoint, getMousePos]);

  const handleMouseUp = useCallback(() => {
    if (!isSelectingROI || !roiStartPoint || !isDrawing) return;
    
    const x = Math.min(roiStartPoint.x, isDrawing.x);
    const y = Math.min(roiStartPoint.y, isDrawing.y);
    const width = Math.abs(isDrawing.x - roiStartPoint.x);
    const height = Math.abs(isDrawing.y - roiStartPoint.y);
    
    if (width > 10 && height > 10) {
      setRoi([Math.round(x), Math.round(y), Math.round(width), Math.round(height)]);
      toast({
        title: "ROI设置成功",
        description: `区域大小: ${Math.round(width)}x${Math.round(height)}`,
        variant: "default",
      });
    }
    
    setIsSelectingROI(false);
    setRoiStartPoint(null);
    setIsDrawing(null);
  }, [isSelectingROI, roiStartPoint, isDrawing, toast]);

  // 绘制ROI
  const drawROI = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.paused || video.ended || video.videoWidth === 0) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 确保画布尺寸与视频匹配
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制已确定的ROI
    if (roi) {
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(roi[0], roi[1], roi[2], roi[3]);
      
      // 添加ROI标签
      ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
      ctx.font = "16px Arial";
      ctx.fillText("ROI", roi[0] + 5, roi[1] + 20);
    }

    // 绘制正在选择的ROI
    if (isSelectingROI && roiStartPoint && isDrawing) {
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      const x = Math.min(roiStartPoint.x, isDrawing.x);
      const y = Math.min(roiStartPoint.y, isDrawing.y);
      const width = Math.abs(isDrawing.x - roiStartPoint.x);
      const height = Math.abs(isDrawing.y - roiStartPoint.y);
      
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);
    }
  }, [roi, isSelectingROI, roiStartPoint, isDrawing]);

  // 视频帧捕获和推送
  useEffect(() => {
    let animationFrameId: number;
    let lastFrameTime = 0;
    const frameInterval = 100; // 10 FPS

    const captureAndSendFrame = async () => {
      if (!isCapturing || !videoRef.current || videoRef.current.paused) {
        return;
      }

      const now = performance.now();
      if (now - lastFrameTime < frameInterval) {
        return;
      }
      lastFrameTime = now;

      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;

        // 应用ROI裁剪
        if (roi && roi[2] > 0 && roi[3] > 0) {
          // 验证ROI边界
          const videoWidth = videoRef.current.videoWidth;
          const videoHeight = videoRef.current.videoHeight;
          
          console.log(`视频尺寸: ${videoWidth}x${videoHeight}, ROI: [${roi[0]}, ${roi[1]}, ${roi[2]}, ${roi[3]}]`);
          
          // 确保ROI不超出视频边界
          const clampedX = Math.max(0, Math.min(roi[0], videoWidth - 1));
          const clampedY = Math.max(0, Math.min(roi[1], videoHeight - 1));
          const clampedWidth = Math.min(roi[2], videoWidth - clampedX);
          const clampedHeight = Math.min(roi[3], videoHeight - clampedY);
          
          if (clampedWidth > 0 && clampedHeight > 0) {
            canvas.width = clampedWidth;
            canvas.height = clampedHeight;
            ctx.drawImage(
              videoRef.current,
              clampedX, clampedY, clampedWidth, clampedHeight,
              0, 0, clampedWidth, clampedHeight
            );
            console.log(`成功裁剪ROI: [${clampedX}, ${clampedY}, ${clampedWidth}, ${clampedHeight}]`);
          } else {
            console.warn("ROI区域无效，使用完整图像");
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          }
        } else {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
        });

        const arrayBuffer = await blob.arrayBuffer();
        const imageData = new Uint8Array(arrayBuffer);

        await invoke('push_video_frame_visual', {
          imageData: Array.from(imageData),
          timestamp: Date.now(),
          width: canvas.width,
          height: canvas.height,
        });
      } catch (error) {
        console.error('推送视频帧失败:', error);
      }
    };

    const animationLoop = () => {
      drawROI();
      captureAndSendFrame();
      animationFrameId = requestAnimationFrame(animationLoop);
    };

    if (isCapturing || isSelectingROI) {
      animationFrameId = requestAnimationFrame(animationLoop);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isCapturing, isSelectingROI, roi, drawROI]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左侧：视频显示和控制 */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            视频监控
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 摄像头选择器 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">选择摄像头设备</label>
            <Select 
              value={selectedDevice} 
              onValueChange={setSelectedDevice}
              disabled={isInitializing || !devicesLoaded}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={
                  isInitializing 
                    ? "正在初始化..." 
                    : !devicesLoaded 
                      ? "加载设备中..." 
                      : "请选择摄像头设备"
                } />
              </SelectTrigger>
              <SelectContent>
                {videoDevices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `摄像头 ${device.deviceId.slice(0, 8)}...`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 控制按钮 */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setIsSelectingROI(!isSelectingROI)}
              variant={isSelectingROI ? "destructive" : "outline"}
              size="sm"
            >
              <Target className="h-4 w-4 mr-1" />
              {isSelectingROI ? "取消选择" : "选择ROI"}
            </Button>
            
            {roi && (
              <Button
                onClick={() => setRoi(null)}
                variant="outline"
                size="sm"
              >
                <XCircle className="h-4 w-4 mr-1" />
                清除ROI
              </Button>
            )}
            
            <Button
              onClick={calibrateVisualDetection}
              disabled={isCalibrating || templateFiles.length === 0}
              variant="outline"
              size="sm"
            >
              {isCalibrating ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Settings className="h-4 w-4 mr-1" />
              )}
              {isCalibrating ? "校准中..." : "校准阈值"}
            </Button>
            
            <Button
              onClick={isDetecting ? stopVisualDetection : startVisualDetection}
              disabled={isCalibrating || (templateFiles.length === 0 && !isDetecting)}
              variant={isDetecting ? "destructive" : "default"}
              size="sm"
            >
              {isDetecting ? (
                <Square className="h-4 w-4 mr-1" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {isDetecting ? "停止检测" : "开始检测"}
            </Button>
          </div>

          {/* 视频显示区域 */}
          <div className="relative bg-gray-900 rounded-lg overflow-hidden">
            {isInitializing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                <div className="flex items-center gap-2 text-white">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  初始化摄像头...
                </div>
              </div>
            )}
            
            <video
              ref={videoRef}
              className="w-full h-auto"
              playsInline
              autoPlay
              muted
            />
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-auto cursor-crosshair"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            />
            
            {isSelectingROI && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 p-2 bg-black/70 rounded-md text-yellow-400 text-sm z-10">
                点击并拖动鼠标，选择要检测的区域
              </div>
            )}
          </div>

          {/* 状态信息 */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={isDetecting ? "default" : "secondary"}>
                {isDetecting ? "检测中" : "未检测"}
              </Badge>
              {roi && (
                <Badge variant="outline">
                  ROI: {Math.round(roi[2])}x{Math.round(roi[3])}
                </Badge>
              )}
              <Badge variant="outline">
                模板: {templateFiles.length}
              </Badge>
            </div>
            
            {lastDetection && (
              <div className="flex items-center gap-2">
                {lastDetection.success ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className={lastDetection.success ? "text-green-600" : "text-red-600"}>
                  {lastDetection.confidence?.toFixed(3) || "N/A"}
                </span>
                <span className="text-xs text-gray-400">
                  (阈值: 0.3)
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 右侧：模板管理和检测结果 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            模板管理与检测结果
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* 模板管理 */}
          <div className="mb-6">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <FileImage className="h-5 w-5" />
              模板管理
            </h4>
            <div className="flex flex-wrap gap-2 mb-3">
              <Button 
                onClick={selectTemplateImages} 
                disabled={isLoadingTemplates} 
                variant="outline" 
                size="sm"
              >
                {isLoadingTemplates ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                选择模板
              </Button>
              {templateFiles.length > 0 && (
                <Button 
                  onClick={clearAllTemplates} 
                  variant="outline" 
                  size="sm"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  清空所有
                </Button>
              )}
            </div>
            
            {/* 模板列表 */}
            {templateFiles.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {templateFiles.map((template, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                    <div className="flex items-center gap-2 text-sm">
                      <FileImage className="h-4 w-4 text-blue-500" />
                      <span className="truncate" title={template.name}>
                        {template.name}
                      </span>
                    </div>
                    <Button
                      onClick={() => removeTemplate(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FileImage className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">尚未选择模板图像</p>
                <p className="text-xs text-gray-400">点击"选择模板"按钮添加模板</p>
              </div>
            )}
          </div>

          <Separator className="my-4" />

          {/* 检测结果 */}
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              检测结果
            </h4>
            
            {/* 最新结果 */}
            {lastDetection && (
              <div className={`p-3 rounded-md mb-3 ${
                lastDetection.success 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {lastDetection.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className={`font-medium ${
                    lastDetection.success ? 'text-green-700' : 'text-red-700'
                  }`}>
                    最新检测
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  匹配度: {lastDetection.confidence?.toFixed(3) || 'N/A'}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(lastDetection.timestamp).toLocaleTimeString()}
                </p>
              </div>
            )}

            {/* 历史结果 */}
            {detectionResults.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <h5 className="text-sm font-medium text-gray-700">历史记录</h5>
                {detectionResults.map((result, index) => (
                  <div 
                    key={index} 
                    className={`flex items-center justify-between p-2 rounded text-sm ${
                      result.success 
                        ? 'bg-green-50 text-green-700' 
                        : 'bg-gray-50 text-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-400" />
                      )}
                      <span>{result.confidence?.toFixed(3) || 'N/A'}</span>
                    </div>
                    <span className="text-xs">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">暂无检测结果</p>
                <p className="text-xs text-gray-400">
                  {templateFiles.length === 0 
                    ? "请先选择模板图像" 
                    : "点击开始检测开始监控"}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 