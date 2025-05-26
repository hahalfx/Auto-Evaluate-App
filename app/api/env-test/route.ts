import { NextRequest, NextResponse } from 'next/server';


export const dynamic = "force-static";
export async function GET(request: NextRequest) {
  // 不返回实际的密钥值，只返回是否设置了环境变量
  return NextResponse.json({
    XUN_FEI_APPID: process.env.XUN_FEI_APPID ? '已设置' : '未设置',
    XUN_FEI_API_SECRET: process.env.XUN_FEI_API_SECRET ? '已设置' : '未设置',
    XUN_FEI_API_KEY: process.env.XUN_FEI_API_KEY ? '已设置' : '未设置',
    // 检查其他可能的环境变量名称
    XUNFEI_APPID: process.env.XUNFEI_APPID ? '已设置' : '未设置',
    XUNFEI_API_SECRET: process.env.XUNFEI_API_SECRET ? '已设置' : '未设置',
    XUNFEI_API_KEY: process.env.XUNFEI_API_KEY ? '已设置' : '未设置',
    // 检查NODE_ENV
    NODE_ENV: process.env.NODE_ENV || '未设置',
  });
}
