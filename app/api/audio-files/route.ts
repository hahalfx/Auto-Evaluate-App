import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const audioDir = path.join(process.cwd(), 'public', 'audio');
    const files = fs.readdirSync(audioDir)
      .filter(file => file.endsWith('.wav'));
    
    return NextResponse.json({ files });
  } catch (error) {
    console.error('获取音频文件列表失败:', error);
    return NextResponse.json(
      { error: '无法获取音频文件列表' },
      { status: 500 }
    );
  }
}
