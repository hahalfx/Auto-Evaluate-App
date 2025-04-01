import {
  Card,
  CardHeader,
  CardContent,
} from "@/components/ui/card";

import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  progress: { 
    value: number;
    current: number;
    total: number;
  };
  samplelength: number; 
}

export function ProgressBar({
  progress, 
  samplelength
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
    </Card>
  );
}
