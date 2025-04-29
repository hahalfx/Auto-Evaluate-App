import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Play, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { DialogTrigger } from "@radix-ui/react-dialog";
import TaskList from "./custom/task-list";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentTask } from "@/store/taskSlice";
import { useState } from "react";

interface ProgressBarProps {
  progress: {
    value: number;
    current: number;
    total: number;
  };
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
  progress,
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <Card className="shadow-sm rounded-lg h-full">
      <CardHeader className="bg-white p-3 rounded-lg flex-row items-center justify-between space-y-0 border-b">
        <h3 className="font-semibold text-foreground">测试进度</h3>
      </CardHeader>
      <CardContent className="p-4">
        <p className="text-sm justify-start text-muted-foreground py-1">
          当前测试任务：{currentTask?.name}
        </p>
        <Progress value={progress.value} />
        <div className="flex justify-between">
          <p className="text-sm text-muted-foreground py-1">
            {progress.value}%
          </p>
          <p className="text-sm text-muted-foreground py-1">
            {progress.total > 0
              ? `正在测试第${progress.current}条，共${progress.total}条`
              : `已选择${samplelength}条待测试`}
          </p>
        </div>
      </CardContent>
      <CardFooter className="grid grid-cols-5 gap-2 justify-between px-3 pb-3">
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
          onClick={() => (onStartAutomatedTest(), setIsDialogOpen(false))}
          disabled={currentTask === null}
          className="col-span-2 col-start-4 gap-2 bg-blue-700 hover:bg-blue-500 w-full"
          variant="default"
        >
          {isPlaying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          开始自动化测试任务
        </Button>
      </CardFooter>
    </Card>
  );
}
