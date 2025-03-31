"use client"

import { useState } from "react"
import { Mic, Send, Loader2 } from "lucide-react"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { checkMachineConnection, recognizeSpeech } from "@/services/api"
import { cn } from "@/lib/utils"

interface MachineResponseProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isAnalyzing: boolean
}

export function MachineResponse({ value, onChange, onSubmit, isAnalyzing }: MachineResponseProps) {
  const [isRecording, setIsRecording] = useState(false)

  const handleVoiceRecognition = async () => {
    try {
      setIsRecording(true)
      const text = await recognizeSpeech()
      onChange(text)
    } catch (error) {
      console.error("语音识别失败:", error)
    } finally {
      setIsRecording(false)
    }
  }

  return (
    <Card className="shadow-sm rounded-lg h-dvh">
      <CardHeader className="bg-background p-3 flex-row items-center justify-between space-y-0 border-b">
        <h3 className="font-semibold text-foreground">被测车机响应</h3>
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
              )}
              onClick={handleVoiceRecognition}
              disabled={isRecording}
            >
              {isRecording ? (
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
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end p-3 border-t">
        <Button onClick={onSubmit} disabled={!value.trim() || isAnalyzing} className="gap-2">
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          测评
        </Button>
      </CardFooter>
    </Card>
  )
}
