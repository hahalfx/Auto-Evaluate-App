"use client";

import { VisualWakeDetectionComponent } from "@/components/visual-wake-detection";

export default function WakeDetectionPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">视觉唤醒检测</h1>
        <p className="text-gray-600 mt-2">
          通过摄像头实时检测车机语音唤醒UI，支持模板匹配和ROI区域设置
        </p>
      </div>
      
      <VisualWakeDetectionComponent />
    </div>
  );
} 