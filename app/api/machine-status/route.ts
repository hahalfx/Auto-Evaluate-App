import { NextResponse } from "next/server"

export async function GET() {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 300))

  // 模拟连接状态，90%的概率是已连接
  const connected = Math.random() > 0.1

  return NextResponse.json({ connected })
}

