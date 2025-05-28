"use client";
import { LLMAnalysisInterface } from "@/components/llm-analysis-interface";
import { useParams } from "next/navigation";

// export async function generateStaticParams() {
//   // 对于完全客户端驱动的动态内容，且不需要预渲染任何特定 ID，
//   // 返回一个空数组。这告诉 Next.js 不需要为这个动态段预生成任何 HTML 页面，
//   // 但路由模式仍然存在，并将由客户端 JavaScript 处理。
//   return [];
// }
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
