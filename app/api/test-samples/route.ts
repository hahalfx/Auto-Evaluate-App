import { NextResponse } from "next/server"
import type { TestSample } from "@/types/api"
import path from "path";
import fs from "fs/promises";

const filePath = path.join(process.cwd(), "public", "mock", "testsamples.json");

// 模拟数据
const testSamples: TestSample[] = [
  { id: 1, text: "播放周杰伦的歌曲", status: "Ready" },
  { id: 2, text: "我很冷", status: "Ready" },
  { id: 3, text: "太烦了，生活没意思", status: "Pending" },
  { id: 4, text: "我很热", status: "Ready" },
  { id: 5, text: "帮我查一下武汉到天津的航班", status: "Pending" },
  { id: 6, text: "你有什么功能", status: "Ready" },
  { id: 7, text: "打开热点", status: "Pending" },
  { id: 8, text: "打开蓝牙", status: "Ready" },
  { id: 9, text: "回到主界面", status: "Ready" },
  { id: 10, text: "打开设置", status: "Ready" },
]

export async function GET() {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    console.error("Error reading car-info.json:", error);
    return NextResponse.json(testSamples)
  }

}

