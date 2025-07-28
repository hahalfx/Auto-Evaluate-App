"use client"

import { ConfigSettings } from "@/components/config-settings"

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6">
        <div className="w-full mx-auto space-y-6">
          <ConfigSettings />
        </div>
      </div>
    </div>
  )
}