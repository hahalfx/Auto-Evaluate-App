import { NextResponse } from "next/server"

export async function POST() {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // 模拟语音识别结果
  const responses = [
    "生活的乐趣是自己发觉的",
    "每天都有新的可能",
    "我理解你的感受，要不要听点轻松的音乐？",
    "人生总有起起落落，保持积极的心态很重要",
    "我可以为你播放一些欢快的音乐来改善心情",
  ]

  const randomResponse = responses[Math.floor(Math.random() * responses.length)]

  return NextResponse.json({ text: randomResponse })
}

