import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Play, Loader2, ChevronLeft, ChevronRight, Pause } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentTask } from "@/store/taskSlice";
import { use, useEffect, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  tauriPauseWorkflow,
  tauriResumeWorkflow,
} from "@/services/tauri-analysis-api";
import { TaskProgress } from "@/types/api";

interface ProgressBarProps {
  progressname: string;
  samplelength: number;
  onStartAutomatedTest: () => void;
  isPlaying: boolean;
  isRecording: boolean;
  isAnalyzing: boolean;
  disabled: boolean;
  goToPreviousResult: () => void;
  hasPreviousResult: () => boolean;
  goToNextResult: () => void;
  hasNextResult: () => boolean;
}

export function ProgressBar({
  progressname,
  samplelength,
  onStartAutomatedTest,
  isPlaying,
  isRecording,
  isAnalyzing,
  disabled,
  goToPreviousResult,
  hasPreviousResult,
  goToNextResult,
  hasNextResult,
}: ProgressBarProps) {
  const currentTask = useAppSelector(selectCurrentTask);
  const [testStatus, setTestStatus] = useState<
    "idle" | "running" | "paused" | "finished"
  >("idle");

  const [backendMessage, setBackendMessage] = useState("");
  const [detailedProgress, setDetailedProgress] = useState<TaskProgress>({
    value: 0,
    current_sample: 0,
    total: 0,
  });

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let unlistenprogress: UnlistenFn | undefined;
    const setupListeners = async () => {
      try {
        unlisten = await listen("workflow_event", (event) => {
          console.log("React Component 收到 workflow_event:", event.payload);
          setBackendMessage(
            typeof event.payload === "string"
              ? event.payload
              : JSON.stringify(event.payload)
          );
        });
      } catch (error) {
        console.error("监听 workflow_event 失败:", error);
      }
      try {
        unlistenprogress = await listen("progress_update", (event) => {
          console.log("React Component 收到 progress_update:", event.payload);
          if (
            typeof event.payload === "object" &&
            event.payload !== null &&
            "value" in event.payload &&
            "current_sample" in event.payload &&
            "total" in event.payload
          ) {
            setDetailedProgress(event.payload as TaskProgress);
          }
        });
      } catch (error) {
        console.error("监听 progress_update 失败:", error);
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
        if (unlistenprogress) {
          try {
            unlistenprogress();
            console.log("已取消监听");
          } catch (error) {
            console.error("取消监听失败:", error);
          }
        }
      };
    };

    setupListeners();
  }, []);

  useEffect(() => {
    if (backendMessage == "workflow finished") {
      setTestStatus("finished");
    }
  }, [backendMessage]);

  function handlePause() {
    // 暂停任务
    tauriPauseWorkflow();
  }

  function handleResume() {
    // 恢复任务
    tauriResumeWorkflow();
  }

  return (
    <Card className="shadow-sm rounded-lg h-full flex flex-col max-h-full overflow-hidden">
      <CardHeader className="bg-white p-4 rounded-t-lg flex justify-between space-y-0 border-b flex-shrink-0">
        <CardTitle className="text-2xl  font-semibold text-gray-800 dark:text-gray-100">
          {currentTask?.name
            ? currentTask?.name
            : "请在任务列表中选择一个测试任务"}
        </CardTitle>
        <CardDescription className="text-gray-500  dark:text-gray-400 pt-1">
          {currentTask?.name ? currentTask?.name : "当前没有被选中的测试任务"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 flex-1 flex flex-col min-h-0 max-h-full">
        <Progress value={detailedProgress.value} className="h-3" />
        <div className="flex justify-between">
          <p className="text-sm text-muted-foreground py-1">
            {detailedProgress.value}%
          </p>
          <p className="text-sm text-muted-foreground py-1">
            {detailedProgress.total > 0
              ? `正在测试${detailedProgress?.current_sample}，共${samplelength}条`
              : `已选择${samplelength}条待测试`}
          </p>
        </div>
        <div className="flex flex-1 flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPreviousResult}
            disabled={!hasPreviousResult()}
            className="col-span-1"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            上一条
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextResult}
            disabled={!hasNextResult()}
            className="col-span-1"
          >
            下一条
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            onClick={() => {
              if (testStatus === "running") {
                handlePause();
                setTestStatus("paused");
              } else if (testStatus === "paused") {
                handleResume();
                setTestStatus("running");
              } else {
                onStartAutomatedTest();
                setTestStatus("running");
              }
            }}
            disabled={testStatus === "finished" || currentTask === null}
            className="col-span-2 col-start-4 gap-2 bg-blue-700 hover:bg-blue-500 w-full"
            variant="default"
          >
            {testStatus === "running" ? (
              <>
                <Pause className="h-4 w-4" />
                暂停任务
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                {testStatus === "paused" ? "恢复任务" : "开始任务"}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
