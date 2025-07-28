"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
    Play,
    Square,
    Pause,
    Settings,
    Camera,
    Target,
    CheckCircle,
    XCircle,
    AlertCircle,
    Loader2,
    Upload,
    Trash2,
    FileImage,
    ImagePlus,
    Mic,
    Eye,
    Clock,
    BarChart3
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface WakeWord {
    id: number;
    text: string;
    audio_file?: string;
}

interface WakeDetectionResult {
    test_index: number;
    wake_word_id: number;
    wake_word_text: string;
    wake_task_completed: boolean;
    active_task_completed: boolean;
    asr_result?: string;
    success: boolean;
    confidence?: number;
    timestamp: number;
    duration_ms: number;
}

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

interface TaskProgress {
    value: number;
    current_sample: number;
    current_stage?: string;
    total: number;
}

interface WorkflowStats {
    total_tests: number;
    success_count: number;
    success_rate: number;
    total_duration_ms: number;
    avg_duration_ms: number;
    results: WakeDetectionResult[];
}

// 任务状态枚举
enum TaskStatus {
    PENDING = "pending",
    RUNNING = "running",
    COMPLETED = "completed",
    FAILED = "failed"
}

// 子任务状态
interface SubTaskStatus {
    wake_task: TaskStatus;
    active_task: TaskStatus;
    middle_task: TaskStatus;
}

// 模板预览组件
interface TemplatePreviewProps {
    filename: string;
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({ filename }) => {
    const [imageData, setImageData] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>("");

    useEffect(() => {
        const loadImage = async () => {
            try {
                setIsLoading(true);
                setError("");
                const base64Data = await invoke<string>('load_template_from_folder', { filename });
                setImageData(base64Data);
            } catch (err) {
                setError("加载失败");
                console.error("加载模板预览失败:", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadImage();
    }, [filename]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center w-full h-full">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (error || !imageData) {
        return (
            <div className="flex items-center justify-center w-full h-full">
                <FileImage className="h-8 w-8 text-gray-300" />
            </div>
        );
    }

    return (
        <img
            src={`data:image/png;base64,${imageData}`}
            alt={filename}
            className="w-full h-full object-contain max-w-full max-h-full"
        />
    );
};

export function WakeDetectionWorkflowComponent() {
    // Refs
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const activeStreamRef = useRef<MediaStream | null>(null);

    // 基础状态
    const [isInitializing, setIsInitializing] = useState(false);
    const [devicesLoaded, setDevicesLoaded] = useState(false);
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<string>("");
    const [selectedFrameRate, setSelectedFrameRate] = useState<number>(10);

    // ROI相关状态
    const [isSelectingROI, setIsSelectingROI] = useState<boolean>(false);
    const [roi, setRoi] = useState<[number, number, number, number] | null>(null);
    const [roiStartPoint, setRoiStartPoint] = useState<{ x: number; y: number } | null>(null);
    const [isDrawing, setIsDrawing] = useState<{ x: number; y: number } | null>(null);
    const [isCalibrating, setIsCalibrating] = useState<boolean>(false);

    // OCR子任务相关
    const [isCapturing, setIsCapturing] = useState<boolean>(false);
    const [isDetecting, setIsDetecting] = useState<boolean>(false);




    // 工作流状态
    const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);
    const [isWorkflowPaused, setIsWorkflowPaused] = useState(false);
    const [workflowProgress, setWorkflowProgress] = useState<TaskProgress>({
        value: 0,
        current_sample: 0,
        total: 0
    });

    // 子任务状态
    const [subTaskStatus, setSubTaskStatus] = useState<SubTaskStatus>({
        wake_task: TaskStatus.PENDING,
        active_task: TaskStatus.PENDING,
        middle_task: TaskStatus.PENDING
    });

    // 配置状态
    const [templateFiles, setTemplateFiles] = useState<{ name: string, data: string }[]>([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

    // 使用 ref 来存储最新的状态，避免闭包问题
    const templateFilesRef = useRef<{ name: string, data: string }[]>([]);
    const roiRef = useRef<[number, number, number, number] | null>(null);

    // 更新 ref 值
    useEffect(() => {
        templateFilesRef.current = templateFiles;
    }, [templateFiles]);

    useEffect(() => {
        roiRef.current = roi;
    }, [roi]);

    // 模板管理相关状态
    const [isCapturingTemplate, setIsCapturingTemplate] = useState(false);
    const [showNamingDialog, setShowNamingDialog] = useState(false);
    const [capturedImageData, setCapturedImageData] = useState<string>("");
    const [templateName, setTemplateName] = useState("");
    const [showTemplateSelector, setShowTemplateSelector] = useState(false);
    const [availableTemplates, setAvailableTemplates] = useState<string[]>([]);
    const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());

    // 结果状态
    const [testResults, setTestResults] = useState<WakeDetectionResult[]>([]);
    const [workflowStats, setWorkflowStats] = useState<WorkflowStats | null>(null);
    const [workflowMessages, setWorkflowMessages] = useState<string[]>([]);
    const [currentTaskInfo, setCurrentTaskInfo] = useState<{ name: string; wake_word_count: number } | null>(null);

    // 覆盖确认对话框状态
    const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
    const [overwriteAction, setOverwriteAction] = useState<'cancel' | 'overwrite' | 'append' | null>(null);

    const { toast } = useToast();

    // 初始化摄像头
    useEffect(() => {
        let isCancelled = false;

        const setupCamera = async () => {
            setIsInitializing(true);

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

    // 加载唤醒词
    useEffect(() => {
        const loadWakeWords = async () => {
            try {
                const fetchedWakeWords = await invoke<WakeWord[]>('get_all_wake_words');
                // 不再需要设置唤醒词状态，因为现在从数据库任务中获取
            } catch (err) {
                console.error("Failed to fetch wake words:", err);
                toast({
                    variant: "destructive",
                    title: "获取唤醒词失败",
                    description: "无法从后端加载唤醒词列表。",
                });
            }
        };
        loadWakeWords();
    }, [toast]);

    // 获取当前任务信息
    useEffect(() => {
        const loadCurrentTaskInfo = async () => {
            try {
                const task = await invoke<{ name: string; wake_word_ids: number[] }>('get_current_task');
                if (task) {
                    setCurrentTaskInfo({
                        name: task.name,
                        wake_word_count: task.wake_word_ids.length
                    });
                } else {
                    setCurrentTaskInfo(null);
                }
            } catch (err) {
                console.error("Failed to fetch current task:", err);
                setCurrentTaskInfo(null);
            }
        };
        loadCurrentTaskInfo();
    }, []);

    // 开始视觉检测
    const startVisualDetection = useCallback(async () => {
        console.log("startVisualDetection 被调用");
        console.log("模板文件数量:", templateFilesRef.current.length);
        console.log("模板文件详情:", templateFilesRef.current);

        if (templateFilesRef.current.length === 0) {
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
            const templateData = templateFilesRef.current.map(template => [template.name, template.data]);
            console.log("模板数据准备完成，数量:", templateData.length);
            console.log("ROI数据:", roiRef.current);
            console.log("处理后的ROI:", roiRef.current ? roiRef.current.map(val => Math.round(val)) : undefined);


            await invoke('start_visual_wake_detection_with_data', {
                templateData,
                roi: roiRef.current ? roiRef.current.map(val => Math.round(val)) : undefined
            });

            console.log("Tauri 命令调用成功");
            // 不再 setIsCapturing(true) 由事件控制
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
    }, [toast]);

    // 停止视觉检测
    const stopVisualDetection = useCallback(async () => {
        try {
            await invoke('stop_visual_wake_detection');
            // 不再 setIsCapturing(false) 由事件控制
        } catch (error) {
            toast({
                title: "停止视觉检测失败",
                description: String(error),
                variant: "destructive",
            });
        }
    }, [toast]);

    // 监听工作流事件
    useEffect(() => {
        let unlistenMetaUpdate: (() => void) | null = null;
        let unlistenProgress: (() => void) | null = null;
        let unlistenTestResult: (() => void) | null = null;
        let unlistenFinalStats: (() => void) | null = null;
        let unlistenError: (() => void) | null = null;

        //唤醒子任务相关
        let unlistenVisualWake: (() => void) | null = null;
        let unlistenVisualStatus: (() => void) | null = null;
        let unlistenWakeTask: (() => void) | null = null;

        let unlistenTaskCompleted: (() => void) | null = null;

        // 添加一个标志来跟踪组件是否已卸载
        let isComponentMounted = true;

        const setupListeners = async () => {
            try {
                // 监听元任务更新
                unlistenMetaUpdate = await listen<string>('wake_detection_meta_update', (event) => {
                    if (!isComponentMounted) return;
                    const message = event.payload;
                    setWorkflowMessages(prev => [message, ...prev.slice(0, 9)]); // 保留最近10条消息
                    console.log('工作流更新:', message);
                });

                // 监听进度更新
                unlistenProgress = await listen<TaskProgress>('wake_detection_progress', (event) => {
                    if (!isComponentMounted) return;
                    setWorkflowProgress(event.payload);
                    console.log('进度更新:', event.payload);
                });

                // 监听测试结果
                unlistenTestResult = await listen<WakeDetectionResult>('wake_detection_test_result', (event) => {
                    if (!isComponentMounted) return;
                    setTestResults(prev => [event.payload, ...prev]);
                    console.log('测试结果:', event.payload);
                });

                // 监听最终统计
                unlistenFinalStats = await listen<WorkflowStats>('wake_detection_final_stats', (event) => {
                    if (!isComponentMounted) return;
                    setWorkflowStats(event.payload);
                    setIsWorkflowRunning(false);
                    setIsWorkflowPaused(false);
                    setSubTaskStatus(prev => {
                        const newStatus = { ...prev };
                        newStatus.wake_task = TaskStatus.COMPLETED;
                        newStatus.active_task = TaskStatus.COMPLETED;
                        newStatus.middle_task = TaskStatus.COMPLETED;
                        return newStatus;
                    });
                    console.log('最终统计:', event.payload);

                    toast({
                        title: "工作流完成",
                        description: `成功率: ${(event.payload.success_rate * 100).toFixed(1)}%`,
                        variant: "default",
                    });
                });

                // 监听错误
                unlistenError = await listen<string>('wake_detection_meta_error', (event) => {
                    if (!isComponentMounted) return;
                    const error = event.payload;
                    setWorkflowMessages(prev => [`错误: ${error}`, ...prev.slice(0, 9)]);
                    setIsWorkflowRunning(false);
                    setIsWorkflowPaused(false);
                    console.error('工作流错误:', error);

                    toast({
                        title: "工作流错误",
                        description: error,
                        variant: "destructive",
                    });
                });

                unlistenVisualWake = await listen<VisualWakeEvent>('visual_wake_event', (event) => {
                    if (!isComponentMounted) return;
                    const { event_type, confidence, timestamp, message } = event.payload;

                    const result: DetectionResult = {
                        success: event_type === 'wake_detected',
                        confidence,
                        timestamp,
                        message: message || event_type,
                    };

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
                    if (!isComponentMounted) return;
                    const status = event.payload;
                    console.log('视觉检测状态:', status);

                    if (status === 'started') {
                        setIsDetecting(true);
                        setIsCapturing(true); // 启动推流
                        toast({
                            title: "视觉检测已启动",
                            description: "正在监控唤醒UI",
                            variant: "default",
                        });
                    } else if (status === 'stopped') {
                        setIsDetecting(false);
                        setIsCapturing(false); // 停止推流
                        toast({
                            title: "视觉检测已停止",
                            description: "停止监控唤醒UI",
                            variant: "default",
                        });
                    } else if (status === 'paused') {
                        setIsDetecting(false);
                        setIsCapturing(false); // 暂停推流
                        toast({
                            title: "视觉检测已暂停",
                            description: "已暂停监控唤醒UI",
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

                //监听active_task子任务的信息
                unlistenWakeTask = await listen<string>('active_task_info', (event) => {
                    if (!isComponentMounted) return;
                    const status = event.payload;
                    if (status === 'started') {
                        console.log("收到 active_task_info started 事件");
                        startVisualDetection();
                    } else if (status === 'stopped') {
                        console.log("收到 active_task_info stopped 事件");
                        stopVisualDetection();
                    } else if (status === 'timeout') {
                        console.log("收到 active_task_info timeout 事件");
                        stopVisualDetection();
                    }
                });

                // 监听任务完成事件
                unlistenTaskCompleted = await listen<string>('task_completed', (event) => {
                    if (!isComponentMounted) return;
                    const taskType = event.payload;
                    console.log('任务完成:', taskType);

                    setSubTaskStatus(prev => {
                        const newStatus = { ...prev };
                        switch (taskType) {
                            case "wake_task_completed":
                                newStatus.wake_task = TaskStatus.COMPLETED;
                                break;
                            case "active_task_timeout":
                                newStatus.active_task = TaskStatus.FAILED;
                                break;
                            case "active_task_completed":
                                newStatus.active_task = TaskStatus.COMPLETED;
                                break;
                            case "middle_task_completed":
                                newStatus.middle_task = TaskStatus.COMPLETED;
                                break;
                            default:
                                break;
                        }

                        // 如果两个任务都完成，中间任务开始运行
                        if ((newStatus.wake_task === TaskStatus.COMPLETED || newStatus.wake_task === TaskStatus.FAILED) &&
                            newStatus.active_task === TaskStatus.COMPLETED) {
                            newStatus.middle_task = TaskStatus.RUNNING;
                        }

                        if (newStatus.middle_task === TaskStatus.COMPLETED) {
                            newStatus.active_task = TaskStatus.RUNNING;
                            newStatus.active_task = TaskStatus.RUNNING;
                        }

                        return newStatus;
                    });
                });
            } catch (error) {
                console.error('设置事件监听器失败:', error);
            }
        };

        setupListeners();

        return () => {
            // 标记组件已卸载
            isComponentMounted = false;

            // 直接清理事件监听器，模仿 visual-wake-detection 的方式
            if (unlistenMetaUpdate) {
                unlistenMetaUpdate();
            }
            if (unlistenProgress) {
                unlistenProgress();
            }
            if (unlistenTestResult) {
                unlistenTestResult();
            }
            if (unlistenFinalStats) {
                unlistenFinalStats();
            }
            if (unlistenError) {
                unlistenError();
            }
            if (unlistenVisualWake) {
                unlistenVisualWake();
            }
            if (unlistenVisualStatus) {
                unlistenVisualStatus();
            }
            if (unlistenWakeTask) {
                unlistenWakeTask();
            }
            if (unlistenTaskCompleted) {
                unlistenTaskCompleted();
            }
        };
    }, [toast]);

    // 选择模板图像
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
                    const newTemplates: { name: string, data: string }[] = [];

                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const reader = new FileReader();

                        await new Promise<void>((resolve, reject) => {
                            reader.onload = () => {
                                if (reader.result) {
                                    const base64Data = (reader.result as string).split(',')[1];
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

                    setTemplateFiles(prev => {
                        const newState = [...prev, ...newTemplates];
                        console.log("模板文件状态更新 - selectTemplateImages:", newState.length);
                        return newState;
                    });
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
    };

    // 清空所有模板
    const clearAllTemplates = () => {
        setTemplateFiles([]);
    };

    // 从当前视频帧截取模板
    const captureTemplate = async () => {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.videoWidth === 0) {
            toast({
                title: "截图失败",
                description: "请确保视频正在播放",
                variant: "destructive",
            });
            return;
        }

        setIsCapturingTemplate(true);

        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error("无法创建Canvas上下文");
            }

            const video = videoRef.current;

            // 根据是否有ROI来决定截取区域
            if (roi && roi[2] > 0 && roi[3] > 0) {
                // 验证ROI边界 - 使用视频原始尺寸
                const videoWidth = video.videoWidth;
                const videoHeight = video.videoHeight;

                // console.log('视频原始尺寸:', videoWidth, 'x', videoHeight);
                // console.log('ROI原始坐标:', roi);

                const clampedX = Math.max(0, Math.min(roi[0], videoWidth - 1));
                const clampedY = Math.max(0, Math.min(roi[1], videoHeight - 1));
                const clampedWidth = Math.min(roi[2], videoWidth - clampedX);
                const clampedHeight = Math.min(roi[3], videoHeight - clampedY);

                //console.log('裁剪后ROI:', clampedX, clampedY, clampedWidth, clampedHeight);

                if (clampedWidth > 0 && clampedHeight > 0) {
                    canvas.width = clampedWidth;
                    canvas.height = clampedHeight;

                    // 只截取ROI区域
                    ctx.drawImage(
                        video,
                        clampedX, clampedY, clampedWidth, clampedHeight,
                        0, 0, clampedWidth, clampedHeight
                    );
                } else {
                    throw new Error("ROI区域无效");
                }
            } else {
                // 截取完整视频帧
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }

            // 转换为Blob
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error("无法生成图像"));
                    }
                }, 'image/png', 1.0);
            });

            // 转换为Base64
            const arrayBuffer = await blob.arrayBuffer();
            const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

            // 暂存图片数据并显示命名弹窗
            setCapturedImageData(base64Data);
            setTemplateName(""); // 清空之前的名称
            setShowNamingDialog(true);

        } catch (error) {
            console.error("截取模板失败:", error);
            toast({
                title: "截取模板失败",
                description: String(error),
                variant: "destructive",
            });
        } finally {
            setIsCapturingTemplate(false);
        }
    };

    // 保存已命名的模板
    const saveTemplateWithName = async () => {
        if (!templateName.trim()) {
            toast({
                title: "保存失败",
                description: "请输入模板名称",
                variant: "destructive",
            });
            return;
        }

        if (!capturedImageData) {
            toast({
                title: "保存失败",
                description: "没有可保存的图片数据",
                variant: "destructive",
            });
            return;
        }

        try {
            // 确保文件名以.png结尾
            const filename = templateName.trim().endsWith('.png')
                ? templateName.trim()
                : `${templateName.trim()}.png`;

            // 保存文件到templates文件夹
            await invoke('save_template_image', {
                filename,
                imageData: capturedImageData
            });

            // 添加到模板列表
            const newTemplate = {
                name: filename,
                data: capturedImageData
            };

            setTemplateFiles(prev => {
                const newState = [...prev, newTemplate];
                console.log("模板文件状态更新 - saveTemplateWithName:", newState.length);
                return newState;
            });

            toast({
                title: "模板保存成功",
                description: `已保存为 ${filename}`,
                variant: "default",
            });

            // 关闭弹窗并清理状态
            setShowNamingDialog(false);
            setCapturedImageData("");
            setTemplateName("");

        } catch (error) {
            console.error("保存模板失败:", error);
            toast({
                title: "保存模板失败",
                description: String(error),
                variant: "destructive",
            });
        }
    };

    // 取消保存模板
    const cancelTemplateNaming = () => {
        setShowNamingDialog(false);
        setCapturedImageData("");
        setTemplateName("");
    };

    // 从templates文件夹选择模板
    const selectTemplatesFromFolder = async () => {
        try {
            setIsLoadingTemplates(true);
            const templateFiles = await invoke<string[]>('get_templates_from_folder');
            setAvailableTemplates(templateFiles);
            setShowTemplateSelector(true);
        } catch (error) {
            toast({
                title: "获取模板列表失败",
                description: String(error),
                variant: "destructive",
            });
        } finally {
            setIsLoadingTemplates(false);
        }
    };

    // 加载选中的模板文件
    const loadSelectedTemplate = async (filename: string) => {
        try {
            const base64Data = await invoke<string>('load_template_from_folder', { filename });

            // 检查是否已经存在同名模板
            const existingIndex = templateFiles.findIndex(t => t.name === filename);

            const newTemplate = {
                name: filename,
                data: base64Data
            };

            if (existingIndex >= 0) {
                // 更新现有模板
                setTemplateFiles(prev => prev.map((template, index) =>
                    index === existingIndex ? newTemplate : template
                ));
                toast({
                    title: "模板已更新",
                    description: `已更新模板: ${filename}`,
                    variant: "default",
                });
            } else {
                // 添加新模板
                setTemplateFiles(prev => {
                    const newState = [...prev, newTemplate];
                    console.log("模板文件状态更新 - loadSelectedTemplate:", newState.length);
                    return newState;
                });
                toast({
                    title: "模板加载成功",
                    description: `已加载模板: ${filename}`,
                    variant: "default",
                });
            }

            // 自动关闭选择器
            closeTemplateSelector();
        } catch (error) {
            toast({
                title: "加载模板失败",
                description: String(error),
                variant: "destructive",
            });
        }
    };

    // 关闭模板选择器
    const closeTemplateSelector = () => {
        setShowTemplateSelector(false);
        setAvailableTemplates([]);
        setSelectedTemplates(new Set());
    };

    // 切换模板选择状态
    const toggleTemplateSelection = (filename: string) => {
        const newSelected = new Set(selectedTemplates);
        if (newSelected.has(filename)) {
            newSelected.delete(filename);
        } else {
            newSelected.add(filename);
        }
        setSelectedTemplates(newSelected);
    };

    // 加载选中的多个模板
    const loadSelectedTemplates = async () => {
        if (selectedTemplates.size === 0) {
            toast({
                title: "请选择模板",
                description: "请至少选择一个模板",
                variant: "destructive",
            });
            return;
        }

        try {
            let loadedCount = 0;
            let updatedCount = 0;

            for (const filename of selectedTemplates) {
                const base64Data = await invoke<string>('load_template_from_folder', { filename });

                const existingIndex = templateFiles.findIndex(t => t.name === filename);
                const newTemplate = { name: filename, data: base64Data };

                if (existingIndex >= 0) {
                    setTemplateFiles(prev => prev.map((template, index) =>
                        index === existingIndex ? newTemplate : template
                    ));
                    updatedCount++;
                } else {
                    setTemplateFiles(prev => {
                        const newState = [...prev, newTemplate];
                        console.log("模板文件状态更新 - loadSelectedTemplates:", newState.length);
                        return newState;
                    });
                    loadedCount++;
                }
            }

            toast({
                title: "模板加载完成",
                description: `新增 ${loadedCount} 个，更新 ${updatedCount} 个模板`,
                variant: "default",
            });

            closeTemplateSelector();
        } catch (error) {
            toast({
                title: "加载模板失败",
                description: String(error),
                variant: "destructive",
            });
        }
    };

    // 删除已保存的模板
    const handleDeleteTemplateFromFolder = async (filename: string, event: React.MouseEvent) => {
        event.stopPropagation(); // 阻止触发父元素的点击事件

        try {
            await invoke('delete_template_from_folder', { filename });

            // 更新可用模板列表
            setAvailableTemplates(prev => prev.filter(f => f !== filename));

            // 如果已选择，则从选择列表中移除
            if (selectedTemplates.has(filename)) {
                setSelectedTemplates(prev => {
                    const newSelected = new Set(prev);
                    newSelected.delete(filename);
                    return newSelected;
                });
            }

            // 从当前工作流的模板列表中移除
            setTemplateFiles(prev => prev.filter(t => t.name !== filename));

            toast({
                title: "模板已删除",
                description: `${filename} 已被永久删除。`,
                variant: "default",
            });
        } catch (error) {
            toast({
                title: "删除模板失败",
                description: String(error),
                variant: "destructive",
            });
        }
    };

    // 开始工作流
    const startWorkflow = async () => {
        if (templateFiles.length === 0) {
            toast({
                title: "请选择模板",
                description: "请先选择至少一个模板图像",
                variant: "destructive",
            });
            return;
        }

        try {
            // 检查当前任务是否已有唤醒检测结果
            const currentTask = await invoke<{ id: number; name: string; wake_word_ids: number[] }>('get_current_task');
            if (!currentTask) {
                toast({
                    title: "没有当前任务",
                    description: "请先选择一个任务",
                    variant: "destructive",
                });
                return;
            }

            const hasExistingResults = await invoke<boolean>('check_wake_detection_results_exist', {
                taskId: currentTask.id
            });

            if (hasExistingResults) {
                // 显示覆盖确认对话框
                setShowOverwriteDialog(true);
                return;
            }

            // 没有现有结果，直接开始工作流
            await startWorkflowInternal();
        } catch (error) {
            console.error("启动工作流失败:", error);
            toast({
                title: "启动工作流失败",
                description: String(error),
                variant: "destructive",
            });
        }
    };

    // 内部开始工作流方法
    const startWorkflowInternal = async (shouldOverwrite: boolean = false) => {
        try {
            const currentTask = await invoke<{ id: number; name: string; wake_word_ids: number[] }>('get_current_task');
            if (!currentTask) {
                toast({
                    title: "没有当前任务",
                    description: "请先选择一个任务",
                    variant: "destructive",
                });
                return;
            }

            // 如果需要覆盖，先删除现有结果
            if (shouldOverwrite) {
                await invoke('delete_wake_detection_results_by_task', {
                    taskId: currentTask.id
                });
                toast({
                    title: "已删除现有结果",
                    description: "将开始新的唤醒检测测试",
                    variant: "default",
                });
            }

            // 重置状态
            setTestResults([]);
            setWorkflowStats(null);
            setWorkflowMessages([]);
            setWorkflowProgress({
                value: 0,
                current_sample: 0,
                total: 0 // 总数将在工作流启动后从数据库获取
            });
            setSubTaskStatus({
                wake_task: TaskStatus.PENDING,
                active_task: TaskStatus.PENDING,
                middle_task: TaskStatus.PENDING
            });

            // 准备模板数据
            const templateData = templateFiles.map(template => [template.name, template.data]);

            // 启动工作流
            await invoke('start_wake_detection_workflow', {
                templateData: templateData,
                frameRate: selectedFrameRate,
                threshold: 0.5
            });

            setIsWorkflowRunning(true);
            setIsWorkflowPaused(false);

            // 设置子任务为运行状态
            setSubTaskStatus({
                wake_task: TaskStatus.RUNNING,
                active_task: TaskStatus.RUNNING,
                middle_task: TaskStatus.PENDING
            });

            toast({
                title: "工作流已启动",
                description: shouldOverwrite ? "开始新的唤醒检测测试" : "开始执行唤醒检测测试",
                variant: "default",
            });
        } catch (error) {
            console.error("启动工作流失败:", error);
            toast({
                title: "启动工作流失败",
                description: String(error),
                variant: "destructive",
            });
        }
    };

    // 处理覆盖选择
    const handleOverwriteChoice = async (choice: 'cancel' | 'overwrite' | 'append') => {
        setShowOverwriteDialog(false);
        setOverwriteAction(choice);

        if (choice === 'cancel') {
            return;
        }

        if (choice === 'overwrite') {
            await startWorkflowInternal(true);
        } else if (choice === 'append') {
            await startWorkflowInternal(false);
        }
    };

    // 暂停工作流
    const pauseWorkflow = async () => {
        try {
            await invoke('pause_workflow');
            setIsWorkflowPaused(true);
            toast({
                title: "工作流已暂停",
                description: "工作流已暂停，可以随时恢复",
                variant: "default",
            });
        } catch (error) {
            toast({
                title: "暂停工作流失败",
                description: String(error),
                variant: "destructive",
            });
        }
    };

    // 恢复工作流
    const resumeWorkflow = async () => {
        try {
            await invoke('resume_workflow');
            setIsWorkflowPaused(false);
            toast({
                title: "工作流已恢复",
                description: "工作流已恢复执行",
                variant: "default",
            });
        } catch (error) {
            toast({
                title: "恢复工作流失败",
                description: String(error),
                variant: "destructive",
            });
        }
    };

    // 停止工作流
    const stopWorkflow = async () => {
        try {
            await invoke('stop_workflow');
            setIsWorkflowRunning(false);
            setIsWorkflowPaused(false);
            setSubTaskStatus({
                wake_task: TaskStatus.PENDING,
                active_task: TaskStatus.PENDING,
                middle_task: TaskStatus.PENDING
            });
            toast({
                title: "工作流已停止",
                description: "工作流已停止执行",
                variant: "default",
            });
        } catch (error) {
            toast({
                title: "停止工作流失败",
                description: String(error),
                variant: "destructive",
            });
        }
    };

    // 获取任务状态图标
    const getTaskStatusIcon = (status: TaskStatus) => {
        switch (status) {
            case TaskStatus.PENDING:
                return <Clock className="h-4 w-4 text-gray-400" />;
            case TaskStatus.RUNNING:
                return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
            case TaskStatus.COMPLETED:
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case TaskStatus.FAILED:
                return <XCircle className="h-4 w-4 text-red-500" />;
        }
    };

    // 获取任务状态文本
    const getTaskStatusText = (status: TaskStatus) => {
        switch (status) {
            case TaskStatus.PENDING:
                return "等待中";
            case TaskStatus.RUNNING:
                return "执行中";
            case TaskStatus.COMPLETED:
                return "已完成";
            case TaskStatus.FAILED:
                return "失败";
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

                toast({
                    title: "校准成功",
                    description: "视觉检测阈值已校准",
                    variant: "default",
                });
            }
        } catch (error) {
            toast({
                title: "校准失败",
                description: String(error),
                variant: "destructive",
            });
        } finally {
            setIsCalibrating(false);
        }
    };

    // 清空测试结果
    const clearTestResults = () => {
        setTestResults([]);
        setWorkflowStats(null);
        setWorkflowMessages([]);
        setWorkflowProgress({
            value: 0,
            current_sample: 0,
            total: 0
        });
        setSubTaskStatus({
            wake_task: TaskStatus.PENDING,
            active_task: TaskStatus.PENDING,
            middle_task: TaskStatus.PENDING
        });

        toast({
            title: "已清空测试结果",
            description: "所有测试结果和统计数据已清除",
            variant: "default",
        });
    };

    // 鼠标事件处理 - 用于ROI坐标转换
    const getMousePos = useCallback((canvasElement: HTMLCanvasElement, event: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasElement.getBoundingClientRect();
        const video = videoRef.current;
        if (!video) return { x: 0, y: 0 };

        // 计算从显示坐标到视频原始坐标的转换
        const scaleX = video.videoWidth / rect.width;
        const scaleY = video.videoHeight / rect.height;

        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
        };
    }, []);

    const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isSelectingROI) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        // 获取容器尺寸并计算视频显示区域
        const containerRect = canvas.parentElement?.getBoundingClientRect();
        if (!containerRect) return;

        const canvasRect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - canvasRect.left;
        const mouseY = event.clientY - canvasRect.top;

        // 直接使用鼠标坐标，后续在drawROI中处理坐标转换
        const pos = { x: mouseX, y: mouseY };
        setRoiStartPoint(pos);
        setIsDrawing(pos);
    }, [isSelectingROI]);

    const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isSelectingROI || !roiStartPoint) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const canvasRect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - canvasRect.left;
        const mouseY = event.clientY - canvasRect.top;

        const pos = { x: mouseX, y: mouseY };
        setIsDrawing(pos);
    }, [isSelectingROI, roiStartPoint]);

    const handleMouseUp = useCallback(() => {
        if (!isSelectingROI || !roiStartPoint || !isDrawing) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        // 获取容器尺寸
        const containerRect = canvas.parentElement?.getBoundingClientRect();
        if (!containerRect) return;

        const canvasWidth = containerRect.width;
        const canvasHeight = containerRect.height;

        // 计算视频显示区域（考虑object-fit: contain）
        const containerAspect = canvasWidth / canvasHeight;
        const videoAspect = video.videoWidth / video.videoHeight;

        let displayWidth, displayHeight, offsetX = 0, offsetY = 0;

        if (containerAspect > videoAspect) {
            displayHeight = canvasHeight;
            displayWidth = (video.videoWidth / video.videoHeight) * displayHeight;
            offsetX = (canvasWidth - displayWidth) / 2;
        } else {
            displayWidth = canvasWidth;
            displayHeight = (video.videoHeight / video.videoWidth) * displayWidth;
            offsetY = (canvasHeight - displayHeight) / 2;
        }

        const scaleX = video.videoWidth / displayWidth;
        const scaleY = video.videoHeight / displayHeight;

        // 计算ROI在视频原始坐标系中的位置
        const roiX1 = Math.max(0, Math.min((Math.min(roiStartPoint.x, isDrawing.x) - offsetX) * scaleX, video.videoWidth));
        const roiY1 = Math.max(0, Math.min((Math.min(roiStartPoint.y, isDrawing.y) - offsetY) * scaleY, video.videoHeight));
        const roiX2 = Math.max(0, Math.min((Math.max(roiStartPoint.x, isDrawing.x) - offsetX) * scaleX, video.videoWidth));
        const roiY2 = Math.max(0, Math.min((Math.max(roiStartPoint.y, isDrawing.y) - offsetY) * scaleY, video.videoHeight));

        const roiWidth = roiX2 - roiX1;
        const roiHeight = roiY2 - roiY1;

        if (roiWidth > 10 && roiHeight > 10) {
            // 确保ROI不超出视频边界
            const clampedX = Math.max(0, Math.min(roiX1, video.videoWidth - 1));
            const clampedY = Math.max(0, Math.min(roiY1, video.videoHeight - 1));
            const clampedWidth = Math.min(roiWidth, video.videoWidth - clampedX);
            const clampedHeight = Math.min(roiHeight, video.videoHeight - clampedY);

            if (clampedWidth > 0 && clampedHeight > 0) {
                setRoi([Math.round(clampedX), Math.round(clampedY), Math.round(clampedWidth), Math.round(clampedHeight)]);
                toast({
                    title: "ROI设置成功",
                    description: `区域大小: ${Math.round(clampedWidth)}x${Math.round(clampedHeight)}`,
                    variant: "default",
                });
            }
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

        // 获取容器尺寸
        const containerRect = canvas.parentElement?.getBoundingClientRect();
        if (!containerRect) return;

        // 确保canvas尺寸与显示尺寸匹配
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

        // 绘制已确定的ROI（缩放到显示尺寸）
        if (roi) {
            const displayX = offsetX + (roi[0] * scaleX);
            const displayY = offsetY + (roi[1] * scaleY);
            const displayWidth = roi[2] * scaleX;
            const displayHeight = roi[3] * scaleY;

            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(displayX, displayY, displayWidth, displayHeight);

            // 添加ROI标签
            ctx.fillStyle = "rgba(0, 255, 128, 0.8)";
            ctx.font = "12px Arial";
            ctx.fillText("ROI", displayX + 5, displayY + 15);
        }

        // 绘制正在选择的ROI（考虑视频实际显示区域）
        if (isSelectingROI && roiStartPoint && isDrawing) {
            // 将鼠标坐标转换到视频实际显示区域
            const mouseToVideoX = (x: number) => Math.max(0, Math.min((x - offsetX) / scaleX, video.videoWidth));
            const mouseToVideoY = (y: number) => Math.max(0, Math.min((y - offsetY) / scaleY, video.videoHeight));

            // 计算ROI的原始坐标
            const videoX1 = mouseToVideoX(Math.min(roiStartPoint.x, isDrawing.x));
            const videoY1 = mouseToVideoY(Math.min(roiStartPoint.y, isDrawing.y));
            const videoX2 = mouseToVideoX(Math.max(roiStartPoint.x, isDrawing.x));
            const videoY2 = mouseToVideoY(Math.max(roiStartPoint.y, isDrawing.y));

            const videoWidth = videoX2 - videoX1;
            const videoHeight = videoY2 - videoY1;

            if (videoWidth > 0 && videoHeight > 0) {
                const displayX = offsetX + (videoX1 * scaleX);
                const displayY = offsetY + (videoY1 * scaleY);
                const displayWidth = videoWidth * scaleX;
                const displayHeight = videoHeight * scaleY;

                ctx.strokeStyle = "#ffff00";
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(displayX, displayY, displayWidth, displayHeight);
                ctx.setLineDash([]);
            }
        }
    }, [roi, isSelectingROI, roiStartPoint, isDrawing]);

    // 视频帧绘制
    useEffect(() => {
        let animationFrameId: number;

        const animationLoop = () => {
            drawROI();
            animationFrameId = requestAnimationFrame(animationLoop);
        };

        if (isSelectingROI || roi) {
            animationFrameId = requestAnimationFrame(animationLoop);
        }

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [isSelectingROI, roi, drawROI]);

    // 视频帧捕获和推送
    useEffect(() => {
        let animationFrameId: number;
        let lastFrameTime = 0;
        const frameInterval = 1000 / selectedFrameRate; // 根据选择的帧率计算间隔

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

                // 应用ROI裁剪 - 使用视频原始坐标
                if (roi && roi[2] > 0 && roi[3] > 0) {
                    const videoWidth = videoRef.current.videoWidth;
                    const videoHeight = videoRef.current.videoHeight;

                    //console.log('视频原始尺寸:', videoWidth, 'x', videoHeight);
                    //console.log('ROI原始坐标:', roi);

                    // 直接使用ROI的原始坐标，不需要缩放转换
                    const clampedX = Math.max(0, Math.min(roi[0], videoWidth - 1));
                    const clampedY = Math.max(0, Math.min(roi[1], videoHeight - 1));
                    const clampedWidth = Math.min(roi[2], videoWidth - clampedX);
                    const clampedHeight = Math.min(roi[3], videoHeight - clampedY);

                    if (clampedWidth > 0 && clampedHeight > 0) {
                        canvas.width = clampedWidth;
                        canvas.height = clampedHeight;

                        // 直接从视频原始坐标裁剪
                        ctx.drawImage(
                            videoRef.current,
                            clampedX, clampedY, clampedWidth, clampedHeight,
                            0, 0, clampedWidth, clampedHeight
                        );
                        //console.log('成功裁剪ROI:', clampedX, clampedY, clampedWidth, clampedHeight);
                    } else {
                        console.warn("ROI区域无效，使用完整图像");
                        canvas.width = videoWidth;
                        canvas.height = videoHeight;
                        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                    }
                } else {
                    // 没有ROI，使用完整视频帧
                    canvas.width = videoRef.current.videoWidth;
                    canvas.height = videoRef.current.videoHeight;
                    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                }

                const blob = await new Promise<Blob>((resolve) => {
                    canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
                });

                const arrayBuffer = await blob.arrayBuffer();
                const imageData = new Uint8Array(arrayBuffer);

                try {
                    await invoke('push_video_frame_visual', {
                        imageData: Array.from(imageData),
                        timestamp: Date.now(),
                        width: canvas.width,
                        height: canvas.height,
                    });
                } catch (error) {
                    console.error('推送视频帧失败:', error);
                    // 如果检测器被禁用，停止捕获
                    if (String(error).includes('视觉检测未启动') || String(error).includes('视觉检测失败')) {
                        setIsCapturing(false);
                        toast({
                            title: "视觉检测已停止",
                            description: "检测器已被禁用，停止视频捕获",
                            variant: "default",
                        });
                    }
                }
            } catch (error) {
                console.error('处理视频帧失败:', error);
            }
        };


        //调用captureAndSendFrame();进行发送的循环
        const animationLoop = () => {
            drawROI();
            captureAndSendFrame();
            animationFrameId = requestAnimationFrame(animationLoop);
        };

        if (isCapturing || isSelectingROI) {
            animationFrameId = requestAnimationFrame(animationLoop);
        }
        //启动条件: if (isCapturing || isSelectingROI)。只有当 isCapturing (正在捕获) 或 isSelectingROI (正在选择ROI) 为 true 时，才会启动这个循环。

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [isCapturing, isSelectingROI, roi, drawROI, selectedFrameRate, toast]);

    return (
        <>
            <div className="flex flex-row gap-6 w-full h-full flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
                {/* 左侧：视频显示和控制 */}
                <Card className="w-3/5 flex flex-col h-full max-h-full overflow-hidden" style={{ width: '70%', height: '100%' }}>
                    <CardHeader className="flex-shrink-0">
                        <CardTitle className="flex items-center gap-2">
                            <Camera className="h-5 w-5" />
                            视频监控
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col space-y-4 min-h-0">

                        {/* 控制按钮 */}
                        <div className="flex flex-wrap gap-2">
                            <Button
                                onClick={() => setIsSelectingROI(!isSelectingROI)}
                                variant={isSelectingROI ? "destructive" : "outline"}
                                size="sm"
                                disabled={isWorkflowRunning}
                            >
                                <Target className="h-4 w-4 mr-1" />
                                {isSelectingROI ? "取消选择" : "选择ROI"}
                            </Button>

                            {roi && (
                                <Button
                                    onClick={() => {
                                        setRoi(null);
                                        // 强制清除画布上的ROI框
                                        const canvas = canvasRef.current;
                                        if (canvas) {
                                            const ctx = canvas.getContext('2d');
                                            if (ctx) {
                                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                            }
                                        }
                                    }}
                                    variant="outline"
                                    size="sm"
                                    disabled={isWorkflowRunning}
                                >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    清除ROI
                                </Button>
                            )}

                            <Button
                                onClick={calibrateVisualDetection}
                                disabled={isCalibrating || isWorkflowRunning}
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

                            <Tooltip>
                                <TooltipTrigger asChild><Button
                                    onClick={captureTemplate}
                                    disabled={isCapturingTemplate || isInitializing || !videoRef.current || isWorkflowRunning}
                                    variant="outline"
                                    size="sm"
                                >
                                    {isCapturingTemplate ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                        <ImagePlus className="h-4 w-4 mr-1" />
                                    )}
                                    截取模版
                                </Button></TooltipTrigger>
                                <TooltipContent>
                                    <p>截取当前画面为模版并保存到templates文件夹中</p>
                                </TooltipContent>
                            </Tooltip>

                            {/* 摄像头选择器 */}
                            <div>
                                <Select
                                    value={selectedDevice}
                                    onValueChange={setSelectedDevice}
                                    disabled={isInitializing || !devicesLoaded || isWorkflowRunning}
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

                            {/* 帧率选择器 */}
                            <div>
                                <Select
                                    value={selectedFrameRate.toString()}
                                    onValueChange={(value) => setSelectedFrameRate(Number(value))}
                                    disabled={isWorkflowRunning}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="选择帧率" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">1 FPS</SelectItem>
                                        <SelectItem value="5">5 FPS</SelectItem>
                                        <SelectItem value="10">10 FPS</SelectItem>
                                        <SelectItem value="15">15 FPS</SelectItem>
                                        <SelectItem value="20">20 FPS</SelectItem>
                                        <SelectItem value="30">30 FPS</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* 视频显示区域 */}
                        <div className="relative bg-gray-900 rounded-lg overflow-hidden flex-1" style={{ minHeight: '300px' }}>
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
                                className="w-full h-full object-contain"
                                playsInline
                                autoPlay
                                muted
                            />
                            <canvas
                                ref={canvasRef}
                                className="absolute top-0 left-0 w-full h-full pointer-events-auto cursor-red-cross"
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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
                                <Badge variant={isWorkflowRunning ? "default" : "secondary"}>
                                    {isWorkflowRunning ? "工作流运行中" : "未运行"}
                                </Badge>
                                {currentTaskInfo && (
                                    <Badge variant="outline">
                                        任务: {currentTaskInfo.name} ({currentTaskInfo.wake_word_count}个唤醒词)
                                    </Badge>
                                )}
                                {roi && (
                                    <Badge variant="outline">
                                        ROI: {Math.round(roi[2])}x{Math.round(roi[3])}
                                    </Badge>
                                )}
                                <Badge variant="outline">
                                    模板: {templateFiles.length}
                                </Badge>
                                <Badge variant="outline">
                                    帧率: {selectedFrameRate} FPS
                                </Badge>
                            </div>

                            {workflowStats && (
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                    <span className="text-green-600">
                                        成功率: {(workflowStats.success_rate * 100).toFixed(1)}%
                                    </span>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 右侧：配置、状态和结果 */}
                <Card className="w-2/5 flex flex-col h-full overflow-hidden max-h-full" style={{ width: '30%', height: '100%' }}>
                    <CardHeader className="flex-shrink-0">
                        <CardTitle className="flex items-center gap-2">
                            {currentTaskInfo ? (
                                <>
                                    {currentTaskInfo.name}
                                </>
                            ) : (
                                <span className="text-gray-400">无任务信息</span>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col overflow-y-auto">

                        {/* 工作流配置 */}
                        <div className="flex flex-col space-y-4">
                            <h4 className="font-medium flex items-center gap-2">
                                <Settings className="h-5 w-5" />
                                工作流配置
                            </h4>

                            {/* 模板管理 - Popover按钮 */}
                            <div className="space-y-2">
                                <Label>模板管理</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between"
                                            disabled={isWorkflowRunning}
                                        >
                                            <div className="flex items-center gap-2">
                                                <FileImage className="h-4 w-4" />
                                                <span>模板 ({templateFiles.length})</span>
                                            </div>
                                            <Badge variant="secondary" className="ml-2">
                                                {templateFiles.length > 0 ? "已配置" : "未配置"}
                                            </Badge>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80" align="start">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-medium">模板管理</h4>
                                                <div className="flex gap-2">
                                                    {templateFiles.length > 0 && (
                                                        <Button
                                                            onClick={clearAllTemplates}
                                                            disabled={isWorkflowRunning}
                                                            variant="outline"
                                                            size="sm"
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-1" />
                                                            清空
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="text-xs text-gray-600 p-2 bg-blue-50 rounded-md">
                                                💡 您可以通过"上传模板"上传图片文件，点击"选择已保存"以画廊方式浏览templates文件夹中的模板（支持多选），或点击"截取画面"从当前视频帧截取模板。
                                                {roi && "当前有ROI区域，截图将只保存ROI区域内容。"}
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    onClick={selectTemplateImages}
                                                    disabled={isLoadingTemplates || isWorkflowRunning}
                                                    variant="outline"
                                                    size="sm"
                                                >
                                                    {isLoadingTemplates ? (
                                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                    ) : (
                                                        <Upload className="h-4 w-4 mr-1" />
                                                    )}
                                                    上传模板
                                                </Button>
                                                <Button
                                                    onClick={selectTemplatesFromFolder}
                                                    disabled={isLoadingTemplates || isWorkflowRunning}
                                                    variant="outline"
                                                    size="sm"
                                                >
                                                    {isLoadingTemplates ? (
                                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                    ) : (
                                                        <FileImage className="h-4 w-4 mr-1" />
                                                    )}
                                                    选择已保存
                                                </Button>
                                                <Button
                                                    onClick={captureTemplate}
                                                    disabled={isCapturingTemplate || isInitializing || !videoRef.current || isWorkflowRunning}
                                                    variant="outline"
                                                    size="sm"
                                                >
                                                    {isCapturingTemplate ? (
                                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                    ) : (
                                                        <ImagePlus className="h-4 w-4 mr-1" />
                                                    )}
                                                    {roi ? "截取ROI" : "截取画面"}
                                                </Button>
                                            </div>

                                            {/* 模板列表 */}
                                            {templateFiles.length > 0 ? (
                                                <div className="space-y-2 max-h-48 overflow-y-auto">
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
                                                                disabled={isWorkflowRunning}
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
                                                <div className="text-center py-4 text-gray-500">
                                                    <FileImage className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                                    <p className="text-sm">尚未选择模板图像</p>
                                                    <p className="text-xs text-gray-400">点击"上传"按钮添加模板</p>
                                                </div>
                                            )}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* 工作流控制 */}
                            <div className="space-y-2">
                                <Label>工作流控制</Label>
                                <div className="flex gap-2">
                                    {!isWorkflowRunning ? (
                                        <Button
                                            onClick={startWorkflow}
                                            disabled={!currentTaskInfo || templateFiles.length === 0}
                                            className="flex-1"
                                        >
                                            <Play className="h-4 w-4 mr-1" />
                                            开始工作流
                                        </Button>
                                    ) : (
                                        <>
                                            {!isWorkflowPaused ? (
                                                <Button
                                                    onClick={pauseWorkflow}
                                                    variant="outline"
                                                    className="flex-1"
                                                >
                                                    <Pause className="h-4 w-4 mr-1" />
                                                    暂停
                                                </Button>
                                            ) : (
                                                <Button
                                                    onClick={resumeWorkflow}
                                                    variant="outline"
                                                    className="flex-1"
                                                >
                                                    <Play className="h-4 w-4 mr-1" />
                                                    恢复
                                                </Button>
                                            )}
                                            <Button
                                                onClick={stopWorkflow}
                                                variant="destructive"
                                                className="flex-1"
                                            >
                                                <Square className="h-4 w-4 mr-1" />
                                                停止
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* 进度显示 */}
                            {isWorkflowRunning && (
                                <div className="space-y-2">
                                    <Label>执行进度</Label>
                                    <Progress value={workflowProgress.value} className="w-full" />
                                    <div className="text-sm text-gray-600">
                                        {workflowProgress.current_stage || `${workflowProgress.current_sample}/${workflowProgress.total}`}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 子任务状态
                        <div className="mt-4 space-y-4">

                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                                    <div className="flex items-center gap-2">
                                        <Mic className="h-4 w-4 text-blue-500" />
                                        <span className="text-sm font-medium">唤醒任务</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {getTaskStatusIcon(subTaskStatus.wake_task)}
                                        <span className="text-xs">{getTaskStatusText(subTaskStatus.wake_task)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                                    <div className="flex items-center gap-2">
                                        <Eye className="h-4 w-4 text-green-500" />
                                        <span className="text-sm font-medium">视觉检测任务</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {getTaskStatusIcon(subTaskStatus.active_task)}
                                        <span className="text-xs">{getTaskStatusText(subTaskStatus.active_task)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                                    <div className="flex items-center gap-2">
                                        <Target className="h-4 w-4 text-purple-500" />
                                        <span className="text-sm font-medium">聚合任务</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {getTaskStatusIcon(subTaskStatus.middle_task)}
                                        <span className="text-xs">{getTaskStatusText(subTaskStatus.middle_task)}</span>
                                    </div>
                                </div>
                            </div>
                        </div> */}

                        {/* 工作流消息 */}
                        {workflowMessages.length > 0 && (
                            <div className="mt-4 space-y-2">
                                <h4 className="font-medium flex items-center gap-2">
                                    <AlertCircle className="h-5 w-5" />
                                    工作流消息
                                </h4>
                                <div className="space-y-1 max-h-12 overflow-y-auto">
                                    {workflowMessages.map((message, index) => (
                                        <div
                                            key={index}
                                            className="p-2 bg-blue-50 rounded-md text-sm text-blue-700"
                                        >
                                            {message}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 测试结果 */}
                        <div className="mt-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium flex items-center gap-2">
                                    <BarChart3 className="h-5 w-5" />
                                    测试结果
                                </h4>
                                {(testResults.length > 0 || workflowStats) && (
                                    <Button
                                        onClick={clearTestResults}
                                        variant="outline"
                                        size="sm"
                                        disabled={isWorkflowRunning}
                                    >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        清空结果
                                    </Button>
                                )}
                            </div>

                            {/* 统计信息 */}
                            {workflowStats && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="p-2 bg-green-50 rounded-md text-center">
                                        <div className="text-lg font-bold text-green-600">
                                            {workflowStats.success_count}
                                        </div>
                                        <div className="text-xs text-green-600">成功次数</div>
                                    </div>
                                    <div className="p-2 bg-blue-50 rounded-md text-center">
                                        <div className="text-lg font-bold text-blue-600">
                                            {(workflowStats.success_rate * 100).toFixed(1)}%
                                        </div>
                                        <div className="text-xs text-blue-600">成功率</div>
                                    </div>
                                </div>
                            )}

                            {/* 测试结果列表 */}
                            {testResults.length > 0 ? (
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {testResults.map((result, index) => (
                                        <div
                                            key={index}
                                            className={`flex items-center justify-between p-2 rounded text-sm ${result.success
                                                ? 'bg-green-50 text-green-700 border border-green-200'
                                                : 'bg-red-50 text-red-700 border border-red-200'
                                                }`}
                                            style={{
                                                backgroundColor: result.success ? '#f0fdf4' : '#fef2f2',
                                                color: result.success ? '#15803d' : '#dc2626'
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                {result.success ? (
                                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                                ) : (
                                                    <XCircle className="h-4 w-4 text-red-500" />
                                                )}
                                                <span>测试 {result.test_index}: {result.wake_word_text}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span>{result.duration_ms}ms</span>
                                                {result.confidence && (
                                                    <span>({result.confidence.toFixed(3)})</span>
                                                )}
                                            </div>
                                            {/* 显示识别成功的判定依据 */}
                                            {result.success && (
                                                <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                                                    {result.asr_result && result.active_task_completed ? (
                                                        <div className="space-y-1">
                                                            <div>ASR: "{result.asr_result}"</div>
                                                            <div>视觉检测成功</div>
                                                        </div>
                                                    ) : result.asr_result ? (
                                                        <span>ASR: "{result.asr_result}"</span>
                                                    ) : result.active_task_completed ? (
                                                        <span>视觉检测成功</span>
                                                    ) : (
                                                        <span>未知成功原因</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-gray-500">
                                    <BarChart3 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                    <p className="text-sm">暂无测试结果</p>
                                    <p className="text-xs text-gray-400">
                                        {templateFiles.length === 0
                                            ? "请先选择模板图像"
                                            : "点击开始工作流开始测试"}
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* 模板命名对话框 */}
            <Dialog open={showNamingDialog} onOpenChange={setShowNamingDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>为模板命名</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="templateName">模板名称</Label>
                            <Input
                                id="templateName"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="输入模板名称..."
                                className="mt-1"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        saveTemplateWithName();
                                    }
                                }}
                            />
                        </div>
                        {capturedImageData && (
                            <div className="text-center">
                                <p className="text-sm text-gray-600 mb-2">预览图像:</p>
                                <img
                                    src={`data:image/png;base64,${capturedImageData}`}
                                    alt="截取的模板"
                                    className="max-w-full max-h-48 mx-auto border rounded"
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={cancelTemplateNaming}>
                            取消
                        </Button>
                        <Button onClick={saveTemplateWithName} disabled={!templateName.trim()}>
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 模板选择弹窗 */}
            <Dialog open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
                <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                    <DialogHeader className="flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <DialogTitle>选择模板</DialogTitle>
                            {selectedTemplates.size > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                    已选择 {selectedTemplates.size} 个
                                </Badge>
                            )}
                        </div>
                    </DialogHeader>

                    <div className="flex-1 min-h-0">
                        {availableTemplates.length > 0 ? (
                            <div className="h-full overflow-y-auto pr-2">
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                                    {availableTemplates.map((filename) => {
                                        const isSelected = selectedTemplates.has(filename);
                                        return (
                                            <div
                                                key={filename}
                                                className={`group relative border rounded-md overflow-hidden hover:shadow-md transition-all cursor-pointer bg-white ${isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-300'
                                                    }`}
                                                onClick={() => toggleTemplateSelection(filename)}
                                            >
                                                <Button
                                                    variant="destructive"
                                                    size="icon"
                                                    className="absolute top-1 right-1 h-5 w-5 z-20 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0"
                                                    onClick={(e) => handleDeleteTemplateFromFolder(filename, e)}
                                                    title={`删除 ${filename}`}
                                                >
                                                    <XCircle className="h-4 w-4" />
                                                </Button>

                                                <div className="aspect-square bg-gray-50 flex items-center justify-center relative">
                                                    <TemplatePreview filename={filename} />

                                                    {/* 悬停效果 */}
                                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                            {/* <div className="bg-gray-100 rounded px-2 py-1 text-xs font-medium text-gray-700 shadow-sm">
                                {isSelected ? '取消选择' : '选择'}
                              </div> */}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="p-1 bg-white border-t">
                                                    <p className="text-xs text-gray-700 truncate text-center" title={filename}>
                                                        {filename}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-48 text-gray-500">
                                <div className="text-center">
                                    <FileImage className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                                    <p className="text-sm">templates文件夹中没有找到模板文件</p>
                                    <p className="text-xs text-gray-400 mt-1">请先截取一些模板或上传模板文件</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex-shrink-0 pt-3 border-t">
                        <div className="flex items-center justify-between w-full">
                            <div className="text-xs text-gray-500">
                                {selectedTemplates.size > 0
                                    ? `已选择 ${selectedTemplates.size} 个模板`
                                    : "点击模板卡片选择模板"
                                }
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={closeTemplateSelector}>
                                    取消
                                </Button>
                                <Button
                                    onClick={loadSelectedTemplates}
                                    disabled={selectedTemplates.size === 0}
                                >
                                    加载选中 ({selectedTemplates.size})
                                </Button>
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 覆盖确认对话框 */}
            <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                            发现现有测试结果
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="text-sm text-gray-600">
                            <p>当前任务已经执行过唤醒检测测试，数据库中已存在测试结果。</p>
                            <p className="mt-2">请选择如何处理：</p>
                        </div>

                        <div className="space-y-3">
                            <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                                <h4 className="font-medium text-gray-900 mb-1">开始并覆盖以前的任务</h4>
                                <p className="text-xs text-gray-600">
                                    删除现有的测试结果，重新执行测试。这将完全替换之前的结果。
                                </p>
                            </div>

                            <div className="p-3 border border-gray-200 rounded-lg bg-blue-50">
                                <h4 className="font-medium text-blue-900 mb-1">开始但不覆盖以前的任务</h4>
                                <p className="text-xs text-blue-600">
                                    保留现有结果，添加新的测试结果。可能会产生重复的唤醒词测试记录。
                                </p>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => handleOverwriteChoice('cancel')}
                        >
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => handleOverwriteChoice('overwrite')}
                        >
                            覆盖现有结果
                        </Button>
                        <Button
                            variant="default"
                            onClick={() => handleOverwriteChoice('append')}
                        >
                            追加新结果
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
} 