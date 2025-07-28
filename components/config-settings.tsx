"use client"

import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Save, RotateCcw, Upload, Download, Settings } from 'lucide-react'

interface ConfigData {
  xunfei: {
    appid: string
    api_key: string
    api_secret: string
  }
  openrouter: {
    api_key: string
    base_url: string
  }
  app: {
    log_level: string
    max_concurrent_tasks: number
    timeout_seconds: number
  }
}

interface ConfigResponse {
  success: boolean
  message: string
  data?: any
}

export function ConfigSettings() {
  const [config, setConfig] = useState<ConfigData>({
    xunfei: {
      appid: '',
      api_key: '',
      api_secret: '',
    },
    openrouter: {
      api_key: '',
      base_url: '',
    },
    app: {
      log_level: '',
      max_concurrent_tasks: 0,
      timeout_seconds: 0,
    },
  })
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [configDir, setConfigDir] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  useEffect(() => {
    loadConfig()
    loadConfigDirectory()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const data = await invoke<ConfigData>('get_app_config')
      setConfig(data)
      await validateConfig()
    } catch (error) {
      console.error('Failed to load config:', error)
      console.error('Toast not available, showing alert instead')
      alert('加载配置失败: 无法加载应用配置文件')
    } finally {
      setLoading(false)
    }
  }

  const loadConfigDirectory = async () => {
    try {
      const dir = await invoke<string>('get_config_directory')
      setConfigDir(dir)
    } catch (error) {
      console.error('Failed to get config directory:', error)
    }
  }

  const validateConfig = async () => {
    try {
      const response = await invoke<ConfigResponse>('validate_config')
      if (response.success) {
        setValidationErrors([])
      } else {
        setValidationErrors(response.data || [])
      }
    } catch (error) {
      console.error('Failed to validate config:', error)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      
      const updates = [
        { section: 'xunfei', key: 'appid', value: config.xunfei.appid },
        { section: 'xunfei', key: 'api_key', value: config.xunfei.api_key },
        { section: 'xunfei', key: 'api_secret', value: config.xunfei.api_secret },
        { section: 'openrouter', key: 'api_key', value: config.openrouter.api_key },
        { section: 'openrouter', key: 'base_url', value: config.openrouter.base_url },
        { section: 'app', key: 'log_level', value: config.app.log_level },
        { section: 'app', key: 'max_concurrent_tasks', value: config.app.max_concurrent_tasks },
        { section: 'app', key: 'timeout_seconds', value: config.app.timeout_seconds },
      ]
      
      await invoke<ConfigResponse>('update_app_config', { updates })
      await validateConfig()
      
      console.log('配置已保存')
    } catch (error) {
      console.error('Failed to save config:', error)
      console.error('保存失败: 无法保存配置更改')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    try {
      await invoke<ConfigResponse>('reset_app_config')
      await loadConfig()
      console.log('配置已重置')
    } catch (error) {
      console.error('Failed to reset config:', error)
      console.error('重置失败: 无法重置配置')
    }
  }

  const handleMigrateFromEnv = async () => {
    try {
      const response = await invoke<ConfigResponse>('migrate_from_env')
      if (response.success) {
        await loadConfig()
        console.log('迁移成功')
      } else {
        console.log('无需迁移')
      }
    } catch (error) {
      console.error('Failed to migrate from env:', error)
      console.error('迁移失败')
    }
  }

  const handleExport = async () => {
    try {
      const configJson = await invoke<string>('export_config')
      const blob = new Blob([configJson], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'automation-validator-config.json'
      a.click()
      URL.revokeObjectURL(url)
      
      console.log('导出成功')
    } catch (error) {
      console.error('Failed to export config:', error)
      console.error('导出失败')
    }
  }

  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      await invoke<ConfigResponse>('import_config', { configJson: text })
      await loadConfig()
      console.log('导入成功')
    } catch (error) {
      console.error('Failed to import config:', error)
      console.error('导入失败')
    }
  }

  const handleConfigChange = (section: string, key: string, value: string | number) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof ConfigData],
        [key]: value,
      },
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">应用配置</h2>
          <p className="text-muted-foreground">
            管理讯飞语音识别和 OpenRouter API 的配置
          </p>
        </div>
        {configDir && (
          <div className="text-sm text-muted-foreground">
            配置文件目录: {configDir}
          </div>
        )}
      </div>

      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <div className="font-medium mb-2">配置验证错误:</div>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="xunfei" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="xunfei">讯飞配置</TabsTrigger>
          <TabsTrigger value="openrouter">OpenRouter</TabsTrigger>
          <TabsTrigger value="app">应用设置</TabsTrigger>
        </TabsList>

        <TabsContent value="xunfei">
          <Card>
            <CardHeader>
              <CardTitle>讯飞语音识别配置</CardTitle>
              <CardDescription>
                配置讯飞语音识别的 API 凭证
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="xunfei-appid">APPID</Label>
                <Input
                  id="xunfei-appid"
                  value={config.xunfei.appid}
                  onChange={(e) => handleConfigChange('xunfei', 'appid', e.target.value)}
                  placeholder="讯飞 APPID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="xunfei-api-key">API Key</Label>
                <Input
                  id="xunfei-api-key"
                  value={config.xunfei.api_key}
                  onChange={(e) => handleConfigChange('xunfei', 'api_key', e.target.value)}
                  placeholder="讯飞 API Key"
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="xunfei-api-secret">API Secret</Label>
                <Input
                  id="xunfei-api-secret"
                  value={config.xunfei.api_secret}
                  onChange={(e) => handleConfigChange('xunfei', 'api_secret', e.target.value)}
                  placeholder="讯飞 API Secret"
                  type="password"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="openrouter">
          <Card>
            <CardHeader>
              <CardTitle>OpenRouter 配置</CardTitle>
              <CardDescription>
                配置 OpenRouter API 用于 LLM 分析
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openrouter-api-key">API Key</Label>
                <Input
                  id="openrouter-api-key"
                  value={config.openrouter.api_key}
                  onChange={(e) => handleConfigChange('openrouter', 'api_key', e.target.value)}
                  placeholder="OpenRouter API Key"
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openrouter-base-url">Base URL</Label>
                <Input
                  id="openrouter-base-url"
                  value={config.openrouter.base_url}
                  onChange={(e) => handleConfigChange('openrouter', 'base_url', e.target.value)}
                  placeholder="https://openrouter.ai/api/v1"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="app">
          <Card>
            <CardHeader>
              <CardTitle>应用设置</CardTitle>
              <CardDescription>
                配置应用的行为参数
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="log-level">日志级别</Label>
                <select
                  id="log-level"
                  value={config.app.log_level}
                  onChange={(e) => handleConfigChange('app', 'log_level', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">请选择日志级别</option>
                  <option value="error">Error</option>
                  <option value="warn">Warn</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                  <option value="trace">Trace</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-concurrent-tasks">最大并发任务数</Label>
                <Input
                  id="max-concurrent-tasks"
                  type="number"
                  min="1"
                  max="10"
                  value={config.app.max_concurrent_tasks}
                  onChange={(e) => handleConfigChange('app', 'max_concurrent_tasks', parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout-seconds">超时时间（秒）</Label>
                <Input
                  id="timeout-seconds"
                  type="number"
                  min="10"
                  max="300"
                  value={config.app.timeout_seconds}
                  onChange={(e) => handleConfigChange('app', 'timeout_seconds', parseInt(e.target.value))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between space-x-4">
        <div className="flex space-x-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                保存配置
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            重置为默认值
          </Button>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handleMigrateFromEnv}>
            从环境变量迁移
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            导出配置
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.json'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) handleImport(file)
              }
              input.click()
            }}
          >
            <Upload className="mr-2 h-4 w-4" />
            导入配置
          </Button>
        </div>
      </div>
    </div>
  )
}