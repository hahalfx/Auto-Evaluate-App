import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// 讯飞语音听写API配置 - 从环境变量或硬编码的备用值获取
const API_CONFIG = {
  // 尝试从多个可能的环境变量名称获取，如果都不存在则使用.env.local中的值
  APPID: process.env.XUN_FEI_APPID || process.env.XUNFEI_APPID || '36c3045b',
  API_SECRET: process.env.XUN_FEI_API_SECRET || process.env.XUNFEI_API_SECRET || 'ZmE3NGRlNjFhMTQ3OWM0NmM2NzI2MTli',
  API_KEY: process.env.XUN_FEI_API_KEY || process.env.XUNFEI_API_KEY || '19f1a5b85b8e210775d2ffecefcf9c0e',
  HOST: 'wss://iat-api.xfyun.cn/v2/iat', // 中英文推荐使用
};

// 生成RFC1123格式的日期
function getDate(): string {
  return new Date().toUTCString();
}

// 生成鉴权url
function getAuthUrl(date: string): string {
  const host = 'iat-api.xfyun.cn';
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`;
  
  // 使用 HMAC-SHA256 计算签名
  const signature = crypto
    .createHmac('sha256', API_CONFIG.API_SECRET)
    .update(signatureOrigin)
    .digest('base64');

  const authorizationOrigin = `api_key="${API_CONFIG.API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  
  // 使用 Base64 编码
  const authorization = Buffer.from(authorizationOrigin).toString('base64');
  
  return `${API_CONFIG.HOST}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;
}

// 获取鉴权URL的API路由
export async function GET(request: NextRequest) {
  try {
    // 检查API配置是否完整
    console.log('API配置:', {
      APPID: API_CONFIG.APPID ? '已设置' : '未设置',
      API_SECRET: API_CONFIG.API_SECRET ? '已设置' : '未设置',
      API_KEY: API_CONFIG.API_KEY ? '已设置' : '未设置',
    });
    
    if (!API_CONFIG.APPID || !API_CONFIG.API_SECRET || !API_CONFIG.API_KEY) {
      console.error('讯飞API配置不完整，环境变量未正确设置');
      return NextResponse.json(
        { error: '讯飞API配置不完整，请检查环境变量' },
        { status: 500 }
      );
    }

    const date = getDate();
    const authUrl = getAuthUrl(date);
    
    console.log('生成鉴权URL成功');
    
    return NextResponse.json({
      url: authUrl,
      appId: API_CONFIG.APPID,
    });
  } catch (error) {
    console.error('生成讯飞鉴权URL失败:', error);
    return NextResponse.json(
      { error: '生成鉴权URL失败' },
      { status: 500 }
    );
  }
}
