import { NextResponse } from "next/server"
import type { TestSample } from "@/types/api"

// 模拟数据
const testSamples: TestSample[] = [
  { id: 1, text: "我想听周杰伦的歌" },
  { id: 2, text: "今天真冷" },
  { id: 3, text: "太烦了，生活没意思" },
  { id: 4, text: "温度太高了" },
  { id: 5, text: "帮我查一下武汉到天津的航班" },
  { id: 6, text: "雨刮真没用" },
]

export async function GET() {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 500))

  return NextResponse.json(testSamples)
}

