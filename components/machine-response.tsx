"use client"

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react"
import { Mic, Send, Loader2, AlertCircle, Play } from "lucide-react"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { checkMachineConnection } from "@/services/api"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"

// 讯飞语音听写API配置
interface XunfeiConfig {
  url: string;
  appId: string;
}

interface MachineResponseProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (overrideResponse?: string) => void
  isAnalyzing: boolean
  currentSampleText?: string
}

// 导出组件方法的接口
export interface MachineResponseHandle {
  playCurrentSampleAudio: () => Promise<void>;
  isPlaying: boolean;
  isRecording: boolean;
}

export const MachineResponse = forwardRef<MachineResponseHandle, MachineResponseProps>(
  function MachineResponse({ value, onChange, onSubmit, isAnalyzing, currentSampleText }, ref) {
    const [isRecording, setIsRecording] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const wsRef = useRef<WebSocket | null>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const resultTextRef = useRef<string>("")
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const recognitionStableTimerRef = useRef<NodeJS.Timeout | null>(null)
    const lastRecognitionTextRef = useRef<string>("")
    const stabilityCheckCountRef = useRef<number>(0)
    const { toast } = useToast()

    useEffect(() => {
      return () => {
        stopRecording()
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
        if (recognitionStableTimerRef.current) {
          clearTimeout(recognitionStableTimerRef.current)
        }
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current = null
        }
      }
    }, [])

    const [xunfeiConfig, setXunfeiConfig] = useState<XunfeiConfig | null>(null)
    
    // 获取讯飞API鉴权URL
    const getXunfeiAuthUrl = async (): Promise<XunfeiConfig | null> => {
      try {
        const response = await fetch('/api/xunfei-asr')
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('获取讯飞API鉴权URL失败:', response.status, errorData);
          throw new Error(`获取讯飞API鉴权URL失败: ${response.status} ${errorData.error || ''}`)
        }
        const data = await response.json();
        console.log('获取讯飞API鉴权URL成功');
        return data;
      } catch (error) {
        console.error('获取讯飞API鉴权URL失败:', error)
        return null
      }
    }

    // 创建音频上下文和处理器
    const createAudioProcessor = (stream: MediaStream): { context: AudioContext, processor: ScriptProcessorNode } => {
      // 创建音频上下文
      const audioContext = new AudioContext({
        sampleRate: 16000, // 设置采样率为16kHz
      });
      
      // 创建音频源
      const source = audioContext.createMediaStreamSource(stream);
      
      // 创建脚本处理器，用于处理音频数据
      // 缓冲区大小设为4096，单声道输入，单声道输出
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      // 连接音频处理链
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      return { context: audioContext, processor };
    };

    // 开始录音
    const startRecording = async () => {
      try {
        // 指定音频约束，确保采样率为16kHz，单声道
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          }
        });
        
        // 创建音频处理器
        const { context, processor } = createAudioProcessor(stream);
        
        // 存储音频流和上下文，以便后续清理
        audioChunksRef.current = [];
        
        // 处理音频数据
        processor.onaudioprocess = (e) => {
          // 获取输入缓冲区的第一个通道数据
          const inputData = e.inputBuffer.getChannelData(0);
          
          // 将Float32Array转换为Int16Array (16位PCM)
          const pcmData = convertFloat32ToInt16(inputData);
          
          // 将PCM数据转换为Base64并发送
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const base64Audio = arrayBufferToBase64(pcmData.buffer);
            
            // 发送音频数据
            const audioFrame = JSON.stringify({
              data: {
                status: 1, // 中间帧
                format: "audio/L16;rate=16000",
                encoding: "raw",
                audio: base64Audio
              }
            });
            
            wsRef.current.send(audioFrame);
          }
        };
        
        // 保存引用以便后续清理
        mediaRecorderRef.current = { 
          stream, 
          context, 
          processor,
          stop: () => {
            // 自定义stop方法
            processor.disconnect();
            context.close();
            stream.getTracks().forEach(track => track.stop());
          }
        } as any;
        
        setIsRecording(true);
        
        // 连接讯飞WebSocket
        connectToXunfeiWebSocket();
      } catch (error) {
        console.error("获取麦克风权限失败:", error);
        setError("获取麦克风权限失败: " + (error instanceof Error ? error.message : String(error)));
        setIsRecording(false);
      }
    };
    
    // 将Float32Array转换为Int16Array (16位PCM)
    const convertFloat32ToInt16 = (float32Array: Float32Array): Int16Array => {
      const int16Array = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        // 将-1.0 ~ 1.0的浮点数转换为-32768 ~ 32767的整数
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return int16Array;
    };

    // 停止录音
    const stopRecording = () => {
      // 停止音频处理
      if (mediaRecorderRef.current) {
        try {
          // 使用自定义stop方法
          if (typeof mediaRecorderRef.current.stop === 'function') {
            mediaRecorderRef.current.stop();
          }
        } catch (error) {
          console.error("停止录音失败:", error);
        }
        mediaRecorderRef.current = null;
      }
      
      // 发送结束帧并关闭WebSocket连接
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          // 发送结束帧
          const endFrame = JSON.stringify({
            data: {
              status: 2
            }
          });
          wsRef.current.send(endFrame);
          
          // 给服务器一些时间处理最后的数据，然后关闭连接
          setTimeout(() => {
            if (wsRef.current) {
              wsRef.current.close();
              wsRef.current = null;
            }
          }, 1000);
        } catch (error) {
          console.error("发送结束帧失败:", error);
          if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
          }
        }
      }
      
      // 清除定时器
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      setIsRecording(false);
    };

    // 连接到讯飞WebSocket
    const connectToXunfeiWebSocket = async () => {
      try {
        setError(null)
        
        // 获取鉴权URL
        const config = await getXunfeiAuthUrl()
        if (!config) {
          const errorMsg = '获取讯飞API鉴权URL失败，请检查网络连接或API配置';
          setError(errorMsg);
          toast({
            title: "语音识别初始化失败",
            description: errorMsg,
            variant: "destructive",
          });
          throw new Error(errorMsg);
        }
        
        setXunfeiConfig(config);
        
        try {
          wsRef.current = new WebSocket(config.url);
        } catch (wsError) {
          const errorMsg = '无法连接到讯飞WebSocket服务';
          setError(errorMsg);
          toast({
            title: "语音识别连接失败",
            description: errorMsg,
            variant: "destructive",
          });
          throw wsError;
        }
        
        wsRef.current.onopen = () => {
          // 发送第一帧，包含公共参数和业务参数
          const firstFrame = JSON.stringify({
            common: {
              app_id: config.appId
            },
            business: {
              language: "zh_cn",
              domain: "iat",
              accent: "mandarin",
              vad_eos: 3000,
              dwa: "wpgs" // 开启动态修正功能
            },
            data: {
              status: 0, // 第一帧音频
              format: "audio/L16;rate=16000",
              encoding: "raw",
              audio: "" // 第一帧可以不发送音频数据
            }
          });
          
          wsRef.current?.send(firstFrame);
          
          // 设置定时器，定期发送音频数据
          intervalRef.current = setInterval(sendAudioData, 40);
        };
        
        wsRef.current.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);
            
            if (response.code !== 0) {
              const errorMsg = `讯飞识别错误: ${response.code}, ${response.message}`;
              console.error(errorMsg);
              setError(errorMsg);
              return;
            }
            
            // 处理识别结果
            processRecognitionResult(response);
          } catch (parseError) {
            console.error("解析讯飞响应失败:", parseError);
          }
        };
        
        wsRef.current.onerror = (error) => {
          const errorMsg = "讯飞WebSocket连接错误";
          console.error(errorMsg, error);
          setError(errorMsg);
          toast({
            title: "语音识别错误",
            description: errorMsg,
            variant: "destructive",
          });
          stopRecording();
        };
        
        wsRef.current.onclose = () => {
          stopRecording();
        };
      } catch (error) {
        const errorMsg = typeof error === 'object' && error !== null && 'message' in error 
          ? (error as Error).message 
          : "连接讯飞WebSocket失败";
        console.error("连接讯飞WebSocket失败:", error);
        setError(errorMsg);
        stopRecording();
      }
    };

    // 发送音频数据
    const sendAudioData = async () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || audioChunksRef.current.length === 0) {
        return
      }
      
      try {
        // 获取最新的音频数据
        const audioBlob = audioChunksRef.current.shift()
        if (!audioBlob) return
        
        // 将Blob转换为ArrayBuffer
        const arrayBuffer = await audioBlob.arrayBuffer()
        
        // 将ArrayBuffer转换为Base64
        const base64Audio = arrayBufferToBase64(arrayBuffer)
        
        // 发送音频数据
        const audioFrame = JSON.stringify({
          data: {
            status: 1, // 中间帧
            format: "audio/L16;rate=16000",
            encoding: "raw",
            audio: base64Audio
          }
        })
        
        // 检查WebSocket连接状态
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(audioFrame);
        }
      } catch (error) {
        console.error("发送音频数据失败:", error);
      }
    }

    // 将ArrayBuffer转换为Base64
    const arrayBufferToBase64 = (buffer: ArrayBufferLike): string => {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      return btoa(binary)
    }

    // 处理识别结果
    const processRecognitionResult = (response: any) => {
      if (!response.data || !response.data.result) {
        return;
      }
      
      // 提取识别文本
      let text = "";
      
      // 检查是否有听写结果
      if (response.data.result.ws && Array.isArray(response.data.result.ws)) {
        // 遍历所有词
        for (const word of response.data.result.ws) {
          if (word.cw && Array.isArray(word.cw)) {
            for (const cw of word.cw) {
              if (cw.w) {
                text += cw.w;
              }
            }
          }
        }
        
        // 检查是否有动态修正
        const pgs = response.data.result.pgs;
        
        if (pgs === 'rpl') {
          // 替换模式
          const rg = response.data.result.rg;
          if (rg && Array.isArray(rg) && rg.length === 2) {
            // 在替换模式下，清空当前结果，使用新的文本
            resultTextRef.current = text;
          } else {
            // 如果没有明确的替换范围，也清空并使用新文本
            resultTextRef.current = text;
          }
        } else if (pgs === 'apd' || !pgs) {
          // 追加模式或无pgs字段
          if (text) {
            resultTextRef.current += text;
          }
        }
        
        // 将识别结果显示在文本框中
        if (resultTextRef.current) {
          onChange(resultTextRef.current);
          
          // 每次文本更新时，重置稳定性检查计时器
          if (recognitionStableTimerRef.current) {
            clearTimeout(recognitionStableTimerRef.current);
          }
          
          // 启动新的稳定性检查
          startStabilityCheck();
        }
      }
    }
    
    // 启动稳定性检查
    const startStabilityCheck = () => {
      // 保存当前文本
      const currentText = resultTextRef.current;
      console.log("启动稳定性检查，当前文本:", currentText);
      
      // 设置定时器，3秒后检查文本是否变化
      recognitionStableTimerRef.current = setTimeout(() => {
        // 如果3秒后文本没有变化，且不为空，认为识别结果已稳定
        if (currentText === resultTextRef.current && currentText.trim() !== "") {
          console.log("语音识别结果已稳定，3秒内无变化:", currentText);
          // 停止录音
          stopRecording();
          // 确保UI中的文本已更新
          onChange(currentText);
          // 自动提交分析
          if (currentSampleText && currentText) {
            console.log("自动提交分析:", { sample: currentSampleText, response: currentText });
            toast({
              title: "识别结果已稳定",
              description: "自动停止录音并提交分析",
              variant: "default",
            });
            // 直接将识别结果传递给onSubmit函数
            onSubmit(currentText);
          }
        }
      }, 3000); // 3秒检查一次
    }

    const handleVoiceRecognition = async () => {
      if (!isRecording) {
        // 清除之前的定时器
        if (recognitionStableTimerRef.current) {
          clearTimeout(recognitionStableTimerRef.current);
        }
        
        resultTextRef.current = "" // 清空之前的结果
        lastRecognitionTextRef.current = "" // 清空上一次的识别结果
        stabilityCheckCountRef.current = 0 // 重置稳定性计数
        onChange(""); // 清空UI显示的文本
        startRecording()
      } else {
        stopRecording()
      }
    }
    
  // 暴露方法和状态给父组件
  useImperativeHandle(ref, () => ({
    playCurrentSampleAudio: async () => {
      await playCurrentSampleAudio();
    },
    isPlaying,
    isRecording
  }));

  // 当状态变化时，通知父组件
  useEffect(() => {
    if (ref && typeof ref === 'object' && ref.current) {
      (ref.current as any).isPlaying = isPlaying;
      (ref.current as any).isRecording = isRecording;
    }
  }, [isPlaying, isRecording]);

    // 播放当前测试样本对应的音频
    const playCurrentSampleAudio = async () => {
      if (!currentSampleText || isPlaying) return;
      
      try {
        setIsPlaying(true);
        
        // 获取音频文件列表
        const response = await fetch('/api/audio-files');
        const data = await response.json();
        const audioFiles = data.files;
        
        // 找到包含语料内容的文件名（忽略前面的数字）
        const matchedFile = audioFiles.find(
          (file: string) => file.includes(currentSampleText) && /^\d+/.test(file)
        );
        
        if (matchedFile) {
          // 创建音频元素
          const audio = new Audio(`/audio/${matchedFile}`);
          audioRef.current = audio;
          
          // 监听音频播放结束事件
          audio.onended = () => {
            console.log("音频播放结束，开始语音识别");
            setIsPlaying(false);
            // 音频播放结束后自动开始语音识别
            handleVoiceRecognition();
          };
          
          // 播放音频
          await audio.play();
        } else {
          console.warn(`未找到匹配的音频文件: ${currentSampleText}`);
          setIsPlaying(false);
          toast({
            title: "播放失败",
            description: `未找到匹配的音频文件: ${currentSampleText}`,
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("播放音频失败:", error);
        setIsPlaying(false);
        toast({
          title: "播放失败",
          description: "播放音频文件时出错",
          variant: "destructive",
        });
      }
    }

    return (
      <Card className="shadow-sm rounded-lg h-full">
        <CardHeader className="bg-background p-3 flex-col space-y-2 border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">被测车机响应</h3>
          </div>
          {currentSampleText && (
            <div className="flex items-center">
              <Badge variant="outline" className="bg-muted">当前测试指令</Badge>
              <span className="ml-2 text-sm font-medium">{currentSampleText}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-5">
          <div className="flex">
            <div className="flex-shrink-0 mr-5 self-start mt-1">
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center",
                  isRecording && "bg-primary/10 border-primary",
                  error && "border-destructive",
                )}
                onClick={handleVoiceRecognition}
              >
                {isRecording ? (
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                ) : error ? (
                  <AlertCircle className="h-8 w-8 text-destructive" />
                ) : (
                  <Mic className="h-8 w-8 text-primary" />
                )}
              </Button>
            </div>
            <div className="flex-1">
              <Textarea
                placeholder="输入车机响应内容或点击麦克风按钮进行语音识别..."
                className="min-h-[120px] resize-none"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              
              {error && (
                <div className="mt-2 text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  <span>语音识别错误: {error}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end p-3 border-t">
          <Button onClick={() => onSubmit()} disabled={!value.trim() || isAnalyzing} className="gap-2">
            {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            测评
          </Button>
        </CardFooter>
      </Card>
    )
  }
);
