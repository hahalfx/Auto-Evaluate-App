"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap, MessageCircle, Play, CheckCircle, AlertCircle } from "lucide-react";
import type { TimingData } from "@/types/api";

interface TimingDataDisplayProps {
  timingData: Record<number, TimingData>;
  samples: Array<{ id: number; text: string }>;
}

export function TimingDataDisplay({ timingData, samples }: TimingDataDisplayProps) {
  const formatTime = (timeStr?: string | null) => {
    if (!timeStr) return "未记录";
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString('zh-CN', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });
    } catch {
      return "格式错误";
    }
  };

  const formatDuration = (ms?: number | null) => {
    if (ms === null || ms === undefined) return "未记录";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusColor = (timing: TimingData) => {
    const hasData = timing.voiceRecognitionTimeMs !== null || 
                   timing.interactionResponseTimeMs !== null || 
                   timing.ttsResponseTimeMs !== null;
    return hasData ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800";
  };

  const getStatusText = (timing: TimingData) => {
    const isComplete = timing.voiceRecognitionTimeMs !== null && 
                      timing.interactionResponseTimeMs !== null && 
                      timing.ttsResponseTimeMs !== null;
    return isComplete ? "完整" : "部分";
  };

  const calculateAverageTimes = () => {
    const timings = Object.values(timingData);
    if (timings.length === 0) return null;

    const validTimings = {
      voiceRecognition: timings.filter(t => t.voiceRecognitionTimeMs !== null && t.voiceRecognitionTimeMs !== undefined),
      interactionResponse: timings.filter(t => t.interactionResponseTimeMs !== null && t.interactionResponseTimeMs !== undefined),
      ttsResponse: timings.filter(t => t.ttsResponseTimeMs !== null && t.ttsResponseTimeMs !== undefined),
    };

    return {
      voiceRecognition: validTimings.voiceRecognition.length > 0 
        ? validTimings.voiceRecognition.reduce((sum, t) => sum + (t.voiceRecognitionTimeMs || 0), 0) / validTimings.voiceRecognition.length 
        : null,
      interactionResponse: validTimings.interactionResponse.length > 0
        ? validTimings.interactionResponse.reduce((sum, t) => sum + (t.interactionResponseTimeMs || 0), 0) / validTimings.interactionResponse.length
        : null,
      ttsResponse: validTimings.ttsResponse.length > 0
        ? validTimings.ttsResponse.reduce((sum, t) => sum + (t.ttsResponseTimeMs || 0), 0) / validTimings.ttsResponse.length
        : null,
    };
  };

  const averages = calculateAverageTimes();

  return (
    <div className="space-y-6">
      {/* 概览卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            时间参数概览
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {averages?.voiceRecognition ? formatDuration(averages.voiceRecognition) : "N/A"}
              </div>
              <div className="text-sm text-blue-800">平均语音识别时间</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {averages?.interactionResponse ? formatDuration(averages.interactionResponse) : "N/A"}
              </div>
              <div className="text-sm text-green-800">平均交互响应时间</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {averages?.ttsResponse ? formatDuration(averages.ttsResponse) : "N/A"}
              </div>
              <div className="text-sm text-purple-800">平均TTS响应时间</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 详细时间数据 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            详细时间数据
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {samples.map((sample) => {
              const timing = timingData[sample.id];
              if (!timing) return null;

              return (
                <div key={sample.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{sample.text}</h4>
                    <Badge className={getStatusColor(timing)}>
                      {getStatusText(timing)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    {/* 关键时间指标 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Play className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">语音识别时间</span>
                      </div>
                      <div className="text-lg font-mono">
                        {formatDuration(timing.voiceRecognitionTimeMs)}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-green-500" />
                        <span className="font-medium">交互响应时间</span>
                      </div>
                      <div className="text-lg font-mono">
                        {formatDuration(timing.interactionResponseTimeMs)}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-purple-500" />
                        <span className="font-medium">TTS响应时间</span>
                      </div>
                      <div className="text-lg font-mono">
                        {formatDuration(timing.ttsResponseTimeMs)}
                      </div>
                    </div>

                    {/* 详细时间戳 */}
                    <div className="col-span-full mt-4 pt-4 border-t">
                      <h5 className="font-medium mb-2 text-sm text-gray-600">详细时间戳</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500">语音指令开始:</span>
                          <span className="ml-2 font-mono">{formatTime(timing.voiceCommandStartTime)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">首字上屏:</span>
                          <span className="ml-2 font-mono">{formatTime(timing.firstCharAppearTime)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">语音指令结束:</span>
                          <span className="ml-2 font-mono">{formatTime(timing.voiceCommandEndTime)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">完整文本上屏:</span>
                          <span className="ml-2 font-mono">{formatTime(timing.fullTextAppearTime)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">动作开始:</span>
                          <span className="ml-2 font-mono">{formatTime(timing.actionStartTime)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">TTS第一帧:</span>
                          <span className="ml-2 font-mono">{formatTime(timing.ttsFirstFrameTime)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {Object.keys(timingData).length === 0 && (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">暂无时间参数数据</p>
              <p className="text-sm text-gray-400 mt-2">请确保测试任务已完成并生成了时间数据</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
