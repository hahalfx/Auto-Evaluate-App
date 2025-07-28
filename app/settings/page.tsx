"use client"

import { ConfigSettings } from "@/components/config-settings"

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">应用配置</h1>
            <p className="text-muted-foreground">
              管理讯飞语音识别和 OpenRouter API 的配置
            </p>
          </div>
          <ConfigSettings />
        </div>
      </div>
    </div>
  )
}