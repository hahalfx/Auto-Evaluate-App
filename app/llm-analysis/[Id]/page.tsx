"use client";
import { LLMAnalysisInterface } from "@/components/llm-analysis-interface";
import { useParams } from "next/navigation";

export default function LLMAnalysis() {
  // 动态路由获取任务ID
  const params = useParams();

  const Id = params.Id;

  return (
    <main className="h-dvh w-full bg-background">
      <LLMAnalysisInterface />
    </main>
  );
}
