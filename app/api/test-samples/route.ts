import { NextResponse } from "next/server"
import type { TestSample } from "@/types/api"

// 模拟数据
const testSamples: TestSample[] = [
  { id: 1, text: "播放周杰伦的歌曲" },
  { id: 2, text: "我很冷" },
  { id: 3, text: "太烦了，生活没意思" },
  { id: 4, text: "我很热" },
  { id: 5, text: "帮我查一下武汉到天津的航班" },
  { id: 6, text: "你有什么功能" },
  { id: 7, text: "打开热点" },
  { id: 8, text: "打开蓝牙" },
  { id: 9, text: "回到主界面" },
]

export async function GET() {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 500))

  return NextResponse.json(testSamples)
}

