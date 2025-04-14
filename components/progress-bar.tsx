import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { DialogTrigger } from "@radix-ui/react-dialog";
import TaskList from "./custom/task-list";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentTask } from "@/store/taskSlice";

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
}: ProgressBarProps) {


  const currentTask = useAppSelector(selectCurrentTask);
  
  return (
    <Card className="shadow-sm rounded-lg h-full">
      <CardHeader className="bg-background p-3 rounded-lg flex-row items-center justify-between space-y-0 border-b">
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
      <CardFooter className="flex justify-center px-3 pb-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button
              className="gap-2 bg-blue-700 hover:bg-blue-500 w-full"
              variant="default"
              disabled={ isAnalyzing || isRecording || isPlaying}
            >
              选择自动化测试任务
            </Button>
          </DialogTrigger>
          <DialogContent className="min-w-[900px] max-h-[700px] flex flex-col">
            <DialogHeader>
              <DialogTitle>选择测试任务</DialogTitle>
            </DialogHeader>
            <div className="overflow-auto w-full ">
              <TaskList />
            </div>
            <DialogFooter>
              <Button
                onClick={onStartAutomatedTest}
                disabled={
                  currentTask === null
                }
                className="gap-2 bg-blue-700 hover:bg-blue-500 w-full"
                variant="default"
              >
                {isPlaying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                开始自动化测试任务
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
