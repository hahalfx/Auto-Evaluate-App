"use client";

import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Mic, Send, Loader2, AlertCircle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useVoiceRecognition } from "@/hooks/useVoiceRecognition";
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
  const toast = useToast();

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

  // // Handle voice recognition button click
  // const handleVoiceRecognition = () => {
  //   if (!isRecording) {
  //     onChange(""); // Clear UI text
  //     startRecording();
  //   } else {
  //     stopRecording();
  //   }
  // };

  // // Expose methods to parent component
  // useImperativeHandle(ref, () => ({
  //   startRecording: async () => {
  //     startRecording();
  //   },
  //   isRecording,
  // }));

  return (
    <>
      <Card className="shadow-sm rounded-lg h-full">
        <CardHeader className="rounded-lg bg-white p-3 flex-col space-y-2 border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">被测车机响应</h3>
          </div>
          <div className="flex items-center">
            <Badge variant="outline" className="bg-muted">
              当前测试指令
            </Badge>
            <span className="ml-2 text-sm font-medium">
              {currentSampleText}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="flex">
            <div className="flex-shrink-0 mr-5 self-start mt-1">
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center",
                  asrEvent == "started" && "bg-primary/10 border-primary"
                  //error && "border-destructive"
                )}
                // onClick={handleVoiceRecognition}
              >
                {asrEvent == "started" ? (
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                ) : (
                  <Mic className="h-8 w-8 text-primary" />
                )}
              </Button>
            </div>
            <div className="flex-1">
              <Textarea
                placeholder="输入车机响应内容或点击麦克风按钮进行语音识别..."
                className="min-h-[120px] resize-none"
                value={backendMessage}
                onChange={(e) => onChange(e.target.value)}
              />

              {/* {error && (
              <div className="mt-2 text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                <span>语音识别错误: {error}</span>
              </div>
            )} */}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end pb-5">
          <Button
            onClick={() => onSubmit()}
            disabled={!value.trim() || isAnalyzing}
            className="gap-2"
          >
            {isAnalyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            测评
          </Button>
        </CardFooter>
      </Card>
      {backendMessage == "finished" &&
        toast.toast({
          title: "识别结果已稳定",
          description: "自动停止录音并提交分析",
          variant: "default",
        })}
    </>
  );
});
