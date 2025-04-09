// hooks/useVoiceRecognition.ts
import { useState, useRef, useEffect } from 'react';


interface XunfeiConfig {
  url: string;
  appId: string;
}

interface UseVoiceRecognitionProps {
  onRecognitionResult: (text: string) => void;
  onRecognitionStable: (text: string) => void;
  onError: (error: string) => void;
}

export function useVoiceRecognition({ onRecognitionResult, onRecognitionStable,onError }: UseVoiceRecognitionProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const resultTextRef = useRef<string>("");
  const recognitionStableTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSubmittingRef = useRef<boolean>(false);

  // Cleanup function
  useEffect(() => {
    return () => {
      stopRecording();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (recognitionStableTimerRef.current) {
        clearTimeout(recognitionStableTimerRef.current);
      }
    };
  }, []);

  // Get Xunfei API auth URL
  const getXunfeiAuthUrl = async (): Promise<XunfeiConfig | null> => {
    try {
      const response = await fetch('/api/xunfei-asr');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('获取讯飞API鉴权URL失败:', response.status, errorData);
        throw new Error(`获取讯飞API鉴权URL失败: ${response.status} ${errorData.error || ''}`);
      }
      const data = await response.json();
      console.log('获取讯飞API鉴权URL成功');
      return data;
    } catch (error) {
      console.error('获取讯飞API鉴权URL失败:', error);
      return null;
    }
  };

  // Create audio processor
  const createAudioProcessor = (stream: MediaStream): { context: AudioContext, processor: ScriptProcessorNode } => {
    const audioContext = new AudioContext({
      sampleRate: 16000,
    });
    
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    return { context: audioContext, processor };
  };

  // Convert Float32Array to Int16Array
  const convertFloat32ToInt16 = (float32Array: Float32Array): Int16Array => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  };

  // Convert ArrayBuffer to Base64
  const arrayBufferToBase64 = (buffer: ArrayBufferLike): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Connect to Xunfei WebSocket
  const connectToXunfeiWebSocket = async () => {
    try {
      setError(null);
      
      // Get auth URL
      const config = await getXunfeiAuthUrl();
      if (!config) {
        const errorMsg = '获取讯飞API鉴权URL失败，请检查网络连接或API配置';
        setError(errorMsg);
        onError(errorMsg);
        throw new Error(errorMsg);
      }
      
      try {
        wsRef.current = new WebSocket(config.url);
      } catch (wsError) {
        const errorMsg = '无法连接到讯飞WebSocket服务';
        setError(errorMsg);
        onError(errorMsg);
        throw wsError;
      }
      
      wsRef.current.onopen = () => {
        // Send first frame with parameters
        const firstFrame = JSON.stringify({
          common: {
            app_id: config.appId
          },
          business: {
            language: "zh_cn",
            domain: "iat",
            accent: "mandarin",
            vad_eos: 3000,
            dwa: "wpgs" // Enable dynamic correction
          },
          data: {
            status: 0, // First frame
            format: "audio/L16;rate=16000",
            encoding: "raw",
            audio: "" // No audio data in first frame
          }
        });
        
        wsRef.current?.send(firstFrame);
        
        // Set timer to send audio data periodically
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
          
          // Process recognition result
          processRecognitionResult(response);
        } catch (parseError) {
          console.error("解析讯飞响应失败:", parseError);
        }
      };
      
      wsRef.current.onerror = (error) => {
        const errorMsg = "讯飞WebSocket连接错误";
        console.error(errorMsg, error);
        setError(errorMsg);
        onError(errorMsg);
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
  
  // Process recognition result
  const processRecognitionResult = (response: any) => {
    if (!response.data || !response.data.result) {
      return;
    }
    
    // Extract recognition text
    let text = "";
    
    // Check if there are recognition results
    if (response.data.result.ws && Array.isArray(response.data.result.ws)) {
      // Iterate through all words
      for (const word of response.data.result.ws) {
        if (word.cw && Array.isArray(word.cw)) {
          for (const cw of word.cw) {
            if (cw.w) {
              text += cw.w;
            }
          }
        }
      }
      
      // Check for dynamic correction
      const pgs = response.data.result.pgs;
      
      if (pgs === 'rpl') {
        // Replace mode
        resultTextRef.current = text;
      } else if (pgs === 'apd' || !pgs) {
        // Append mode or no pgs field
        if (text) {
          resultTextRef.current += text;
        }
      }
      
      // Display recognition result in text box
      if (resultTextRef.current) {
        onRecognitionResult(resultTextRef.current);
        
        // Reset stability check timer on text update
        if (recognitionStableTimerRef.current) {
          clearTimeout(recognitionStableTimerRef.current);
        }
        
        // Start new stability check
        startStabilityCheck();
      }
    }
  };
  
  // Start stability check
  const startStabilityCheck = () => {
    // If already submitting, don't start new stability check
    if (isSubmittingRef.current) {
      return;
    }
    
    // Save current text
    const currentText = resultTextRef.current;
    console.log("启动稳定性检查，当前文本:", currentText);
    
    // Clear previous timer
    if (recognitionStableTimerRef.current) {
      clearTimeout(recognitionStableTimerRef.current);
    }
    
    // Set timer to check if text changes after 2 seconds
    recognitionStableTimerRef.current = setTimeout(() => {
      // If text hasn't changed after 2 seconds and isn't empty, consider result stable
      if (currentText === resultTextRef.current && currentText.trim() !== "" && !isSubmittingRef.current) {
        console.log("语音识别结果已稳定，2秒内无变化:", currentText);
        // Set submission flag to prevent duplicate submissions
        isSubmittingRef.current = true;
        
        // Stop recording
        stopRecording();
        
        
        // Make sure text is updated in UI
        onRecognitionStable(currentText);
        
        // Reset submission flag after delay
        setTimeout(() => {
          isSubmittingRef.current = false;
        }, 2000);
      }
    }, 2000); // Check every 2 seconds
  };
  
  // Send audio data
  const sendAudioData = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || audioChunksRef.current.length === 0) {
      return;
    }
    
    try {
      // Get latest audio data
      const audioBlob = audioChunksRef.current.shift();
      if (!audioBlob) return;
      
      // Convert Blob to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Convert ArrayBuffer to Base64
      const base64Audio = arrayBufferToBase64(arrayBuffer);
      
      // Send audio data
      const audioFrame = JSON.stringify({
        data: {
          status: 1, // Middle frame
          format: "audio/L16;rate=16000",
          encoding: "raw",
          audio: base64Audio
        }
      });
      
      // Check WebSocket connection status
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(audioFrame);
      }
    } catch (error) {
      console.error("发送音频数据失败:", error);
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      // Specify audio constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      // Create audio processor
      const { context, processor } = createAudioProcessor(stream);
      
      // Store audio stream and context for later cleanup
      audioChunksRef.current = [];
      
      // Process audio data
      processor.onaudioprocess = (e) => {
        // Get input buffer first channel data
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert Float32Array to Int16Array (16-bit PCM)
        const pcmData = convertFloat32ToInt16(inputData);
        
        // Convert PCM data to Base64 and send
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const base64Audio = arrayBufferToBase64(pcmData.buffer);
          
          // Send audio data
          const audioFrame = JSON.stringify({
            data: {
              status: 1, // Middle frame
              format: "audio/L16;rate=16000",
              encoding: "raw",
              audio: base64Audio
            }
          });
          
          wsRef.current.send(audioFrame);
        }
      };
      
      // Save reference for later cleanup
      mediaRecorderRef.current = { 
        stream, 
        context, 
        processor,
        stop: () => {
          // Custom stop method
          processor.disconnect();
          context.close();
          stream.getTracks().forEach(track => track.stop());
        }
      };
      
      setIsRecording(true);
      
      // Connect to Xunfei WebSocket
      connectToXunfeiWebSocket();
    } catch (error) {
      console.error("获取麦克风权限失败:", error);
      setError("获取麦克风权限失败: " + (error instanceof Error ? error.message : String(error)));
      onError("获取麦克风权限失败");
      setIsRecording(false);
    }
  };

  // Stop recording
  const stopRecording = () => {
    // Stop audio processing
    if (mediaRecorderRef.current) {
      try {
        // Use custom stop method
        if (typeof mediaRecorderRef.current.stop === 'function') {
          mediaRecorderRef.current.stop();
        }
      } catch (error) {
        console.error("停止录音失败:", error);
      }
      mediaRecorderRef.current = null;
    }
    
    // Send end frame and close WebSocket connection
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        // Send end frame
        const endFrame = JSON.stringify({
          data: {
            status: 2
          }
        });
        wsRef.current.send(endFrame);
        
        // Give server time to process final data, then close connection
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
    
    // Clear timers
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setIsRecording(false);
  };

  // Reset for new recording
  const reset = () => {
    resultTextRef.current = ""; // Clear previous results
    if (recognitionStableTimerRef.current) {
      clearTimeout(recognitionStableTimerRef.current);
    }
    isSubmittingRef.current = false;
  };

  return {
    isRecording,
    error,
    startRecording: () => {
      reset();
      startRecording();
    },
    stopRecording,
  };
}