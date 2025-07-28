"use client";

import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

interface MachineResponseProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (overrideResponse?: string) => void;
  isAnalyzing: boolean;
  currentSampleText?: string;
}

// Export component methods interface
export interface MachineResponseHandle {
  startRecording: () => Promise<void>;
  isRecording: boolean;
}

export const MachineResponse = forwardRef<
  MachineResponseHandle,
  MachineResponseProps
>(function MachineResponse(
  { value, onChange, onSubmit, isAnalyzing, currentSampleText },
  ref
) {

  // // Use custom hooks for voice recognition and audio playback
  // const { isRecording, error, startRecording, stopRecording } =
  //   useVoiceRecognition({
  //     onRecognitionResult: (text) => {
  //       onChange(text);
  //     },
  //     onRecognitionStable: (text) => {
  //       if (text.trim() && currentSampleText) {

  //         toast.toast({
  //           title: "识别结果已稳定",
  //           description: "自动停止录音并提交分析",
  //           variant: "default",
  //         });
  //         console.log("语音识别结果自动停止录音并提交分析:", text);
  //         onSubmit(text);
  //       }
  //     },
  //     onError: (errorMsg) => {
  //       toast.toast({
  //         title: "语音识别错误",
  //         description: errorMsg,
  //         variant: "destructive",
  //       });
  //     },
  //   });

  const [backendMessage, setBackendMessage] = useState("");
  const [asrEvent, setAsrEvent] = useState("");
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let unlistenevent: UnlistenFn | undefined;
    const setupListeners = async () => {
      try {
        unlisten = await listen("asr_intermediate_result", (event) => {
          console.log(
            "React Component 收到 asr_intermediate_result",
            event.payload
          );
          const text = event.payload as string;

          setBackendMessage(text);
        });
        unlistenevent = await listen("asr_event", (event) => {
          console.log("React Component 收到 asr_event:", event.payload);
          setAsrEvent(
            typeof event.payload === "string"
              ? event.payload
              : JSON.stringify(event.payload)
          );
        });
      } catch (error) {
        console.error("监听失败:", error);
      }

      return () => {
        if (unlisten) {
          try {
            unlisten();
            console.log("已取消监听");
          } catch (error) {
            console.error("取消监听失败:", error);
          }
        }
        if (unlistenevent) {
          try {
            unlistenevent();
            console.log("已取消监听event");
          } catch (error) {
            console.error("取消监听event失败:", error);
          }
        }
      };
    };

    setupListeners();
  }, []);

  return (
    <>
      <Card className="shadow-sm rounded-lg h-full flex flex-col max-h-full overflow-hidden">
        <CardHeader className="rounded-lg bg-white p-3 flex-col space-y-2 border-b flex-shrink-0">
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">车机响应</h3>
              {/* 小的录音状态图标 */}
              {asrEvent === "started" && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-muted-foreground">录音中</span>
                </div>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              {currentSampleText || "等待测试指令..."}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 flex-1 flex flex-col min-h-0 max-h-full">
          <div className="flex-1 min-h-0">
            {/* 显示识别结果 */}
            <div className="w-full h-full">
              {backendMessage ? (
                <div className="p-4 bg-gray-50 rounded-md border">
                  <p className="text-sm text-gray-600 mb-1">识别结果：</p>
                  <p className="text-base font-medium">{backendMessage}</p>
                </div>
              ) : asrEvent === "started" ? (
                <div className="p-4 bg-blue-50 rounded-md border border-blue-200">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                    <p className="text-sm text-blue-600">正在识别语音...</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-gray-50 rounded-md border border-dashed">
                  <p className="text-sm text-gray-500 text-center">
                    等待车机响应识别结果...
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
});
