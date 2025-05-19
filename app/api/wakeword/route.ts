export const dynamic = "force-static"

import { NextResponse } from "next/server"
import type { WakeWord } from "@/types/api"
import path from "path";
import fs from "fs/promises";

const filePath = path.join(process.cwd(), "public", "mock", "wakewords.json");
// 模拟数据
const wakeWords: WakeWord[] = [
  { id: 1, text: "小艺小艺"},
  { id: 2, text: "小欧小"},
  { id: 3, text: "你好奕派"}
]

export async function GET() {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    console.error("Error reading wakewords.json:", error);
    return NextResponse.json(wakeWords)
  }
}
