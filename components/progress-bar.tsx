import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";

interface ProgressBarProps {
  progress: { 
    value: number;
    current: number;
    total: number;
  };
  samplelength: number;
  onStartAutomatedTest: () => void;
  isPlaying: boolean;
  isRecording: boolean;
  isAnalyzing: boolean;
  disabled: boolean;
}

export function ProgressBar({
  progress, 
  samplelength,
  onStartAutomatedTest,
  isPlaying,
  isRecording,
  isAnalyzing,
  disabled
}: ProgressBarProps) {
  return (
    <Card className="shadow-sm rounded-lg h-full">
      <CardHeader className="bg-background p-3 flex-row items-center justify-between space-y-0 border-b">
        <h3 className="font-semibold text-foreground">测试进度</h3>
      </CardHeader>
      <CardContent className="p-4">
        <p className="text-sm justify-start text-muted-foreground py-1">
          测试进度
        </p>
        <Progress value={progress.value} />
        <div className="flex justify-between">
          <p className="text-sm text-muted-foreground py-1">{progress.value}%</p>
          <p className="text-sm text-muted-foreground py-1">
            {progress.total > 0 
              ? `正在测试第${progress.current}条，共${progress.total}条` 
              : `已选择${samplelength}条待测试`}
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-center px-3 pb-3">
        <Button 
          onClick={onStartAutomatedTest} 
          disabled={disabled || isPlaying || isRecording || isAnalyzing || samplelength === 0} 
          className="gap-2 bg-blue-700 hover:bg-blue-500 w-full"
          variant="default"
        >
          {isPlaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          开始自动化测试
        </Button>
      </CardFooter>
    </Card>
  );
}
