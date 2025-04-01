"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { ThemeToggle } from "./theme-toggle"
import { NavTabs } from "./nav-tabs"
import { TestSamples } from "./test-samples"
import { AnalysisResults } from "./analysis-results"
import { MachineResponse } from "./machine-response"
import { submitForAnalysis, fetchTestSamples } from "@/services/api"
import type { AnalysisResult, TestSample } from "@/types/api"
import { useToast } from "@/components/ui/use-toast"

export function LLMAnalysisInterface() {
  const [samples, setSamples] = useState<TestSample[]>([])
  const [selectedSample, setSelectedSample] = useState<number | undefined>(undefined)
  const [machineResponse, setMachineResponse] = useState("")
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    // 加载测试样本
    const loadSamples = async () => {
      const data = await fetchTestSamples()
      setSamples(data)
    }
    loadSamples()
  }, [])

  const handleAnalysis = async () => {
    if (!machineResponse.trim()) {
      toast({
        title: "请输入车机响应",
        description: "车机响应不能为空",
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)
      setError(null)
      const sample = samples.find(s => s.id === selectedSample)
      if (!sample) {
        throw new Error("未找到选中的测试样本")
      }
      const result = await submitForAnalysis(sample.text, machineResponse)
      setAnalysisResult(result)

      // 使用新的结果格式显示通知
      toast({
        title: "分析完成",
        description: `测评结果: ${result.assessment.valid ? "通过" : "不通过"} (${Math.round(result.assessment.overall_score * 100)}%)`,
        variant: result.assessment.valid ? "default" : "destructive",
      })
    } catch (err) {
      setError("分析失败，请重试")
      toast({
        title: "分析失败",
        description: "无法获取分析结果，请重试",
        variant: "destructive",
      })
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // 当选择新的测试样本时，重置分析结果
  useEffect(() => {
    setAnalysisResult(null)
    setError(null)
  }, [selectedSample])

  return (
    <div className="flex flex-col w-full max-h-screen">
      {/* Header with logo and title */}
      <header className="bg-background p-3 flex items-center justify-between shadow-sm">
        <div className="flex-1"></div>
        <div className="flex items-center space-x-3">
          <div className="h-8 relative">
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WechatIMG141.jpg-5GyOuwpCpXccaTWId1io6GfGROhdlY.png"
              alt="CNTARC Logo"
              width={200}
              height={32}
              className="object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-wide text-primary drop-shadow-sm">语音交互大模型分析</h1>
        </div>
        <div className="flex-1 flex justify-end pr-4">
          <ThemeToggle />
        </div>
      </header>

      {/* Navigation */}
      <NavTabs />

      {/* Main content */}
      <div className="flex flex-auto p-4 gap-4 h-dvh">
        <div className="flex flex-col w-1/2 gap-4 h-full">
          <div className="flex-auto">
          <TestSamples 
            samples={samples} 
            onSamples={setSamples} 
            selectedSample={selectedSample ?? -1} // Provide a default value when undefined
            onSelectSample={setSelectedSample}
            onDeleteSample={(id) => setSamples(samples.filter(s => s.id !== id))}
          />
          </div>
          <div className="flex-auto h-full">
          <MachineResponse
            value={machineResponse}
            onChange={setMachineResponse}
            onSubmit={handleAnalysis}
            isAnalyzing={loading}
          />
          </div>
        </div>
        <div className="w-1/2 flex-auto">
          <AnalysisResults result={analysisResult} loading={loading} error={error} />
        </div>
      </div>
    </div>
  )
}
