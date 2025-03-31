import { cn } from "@/lib/utils"

interface ScoreDisplayProps {
  score: number
  label: string
  comment?: string
}

export function ScoreDisplay({ score, label, comment }: ScoreDisplayProps) {
  // 根据分数确定颜色
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "bg-green-500"
    if (score >= 0.5) return "bg-yellow-500"
    return "bg-red-500"
  }

  const scorePercentage = Math.round(score * 100)
  const scoreColor = getScoreColor(score)

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={cn(
            "text-sm font-medium",
            score >= 0.8 ? "text-green-600" : score >= 0.5 ? "text-yellow-600" : "text-red-600",
          )}
        >
          {scorePercentage}%
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-2.5">
        <div className={`h-2.5 rounded-full ${scoreColor}`} style={{ width: `${scorePercentage}%` }}></div>
      </div>
      {comment && <p className="text-xs text-muted-foreground mt-1">{comment}</p>}
    </div>
  )
}

