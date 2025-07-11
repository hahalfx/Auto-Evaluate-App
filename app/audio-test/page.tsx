'use client'

import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AudioTestPage() {
  const [testResult, setTestResult] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const runAudioTest = async () => {
    setIsLoading(true)
    setTestResult('')
    
    try {
      const result = await invoke<string>('test_audio_permissions')
      setTestResult(result)
    } catch (error) {
      setTestResult(`测试失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>音频权限测试</CardTitle>
          <CardDescription>
            测试系统音频设备和权限配置
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={runAudioTest} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? '测试中...' : '开始音频权限测试'}
          </Button>
          
          {testResult && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">测试结果:</h3>
              <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-sm whitespace-pre-wrap overflow-auto max-h-96">
                {testResult}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
