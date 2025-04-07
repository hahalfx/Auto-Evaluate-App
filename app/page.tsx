import { LLMAnalysisInterface } from "@/components/llm-analysis-interface"
import DashBoard from "@/components/dashboard"

export default function Home() {
  return (
    <main className="h-dvh w-full bg-background">
      {/* <LLMAnalysisInterface /> */}
      <DashBoard />
    </main>
  )
}

