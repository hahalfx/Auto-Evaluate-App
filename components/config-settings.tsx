"use client"

import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { 
  Loader2, 
  Save, 
  RotateCcw, 
  Upload, 
  Download, 
  Settings, 
  Key, 
  Cloud, 
  Cog,
  Shield,
  Database,
  Globe,
  Check,
  ChevronRight
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

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
  const [autoSave, setAutoSave] = useState(true)
  const [enableValidation, setEnableValidation] = useState(true)

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
      toast({
        title: "加载失败",
        description: "无法加载应用配置文件",
        variant: "destructive",
      })
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
      
      toast({
        title: "保存成功",
        description: "配置已成功保存",
      })
    } catch (error) {
      console.error('Failed to save config:', error)
      toast({
        title: "保存失败",
        description: "无法保存配置更改",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    try {
      await invoke<ConfigResponse>('reset_app_config')
      await loadConfig()
      toast({
        title: "重置成功",
        description: "配置已重置为默认值",
      })
    } catch (error) {
      console.error('Failed to reset config:', error)
      toast({
        title: "重置失败",
        description: "无法重置配置",
        variant: "destructive",
      })
    }
  }

  const handleMigrateFromEnv = async () => {
    try {
      const response = await invoke<ConfigResponse>('migrate_from_env')
      if (response.success) {
        await loadConfig()
        toast({
          title: "迁移成功",
          description: "已从环境变量迁移配置",
        })
      } else {
        toast({
          title: "无需迁移",
          description: "没有需要迁移的环境变量",
        })
      }
    } catch (error) {
      console.error('Failed to migrate from env:', error)
      toast({
        title: "迁移失败",
        description: "无法从环境变量迁移配置",
        variant: "destructive",
      })
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
      
      toast({
        title: "导出成功",
        description: "配置文件已导出",
      })
    } catch (error) {
      console.error('Failed to export config:', error)
      toast({
        title: "导出失败",
        description: "无法导出配置文件",
        variant: "destructive",
      })
    }
  }

  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      await invoke<ConfigResponse>('import_config', { configJson: text })
      await loadConfig()
      toast({
        title: "导入成功",
        description: "配置文件已导入",
      })
    } catch (error) {
      console.error('Failed to import config:', error)
      toast({
        title: "导入失败",
        description: "无法导入配置文件",
        variant: "destructive",
      })
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
    <div className="flex flex-col gap-6 p-2 bg-white">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">配置管理</h1>
        <p className="text-muted-foreground">管理系统配置和API设置</p>
      </div>

      {configDir && (
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span className="text-sm font-medium">配置文件目录</span>
          </div>
          <span className="text-sm text-muted-foreground">{configDir}</span>
        </div>
      )}

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
        <div className="flex flex-col md:flex-row gap-6">
          <Card className="md:w-64 h-fit">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-base">配置菜单</CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-0">
              <TabsList className="flex flex-col h-auto bg-transparent space-y-1">
                <TabsTrigger value="xunfei" className="justify-start w-full px-2">
                  <Cloud className="h-4 w-4 mr-2" />
                  <span>讯飞配置</span>
                </TabsTrigger>
                <TabsTrigger value="openrouter" className="justify-start w-full px-2">
                  <Key className="h-4 w-4 mr-2" />
                  <span>OpenRouter</span>
                </TabsTrigger>
                <TabsTrigger value="app" className="justify-start w-full px-2">
                  <Cog className="h-4 w-4 mr-2" />
                  <span>应用设置</span>
                </TabsTrigger>
              </TabsList>
            </CardContent>
          </Card>

          <div className="flex-1">
            <TabsContent value="xunfei" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Cloud className="h-5 w-5 mr-2" />
                    讯飞语音识别配置
                  </CardTitle>
                  <CardDescription>配置讯飞语音识别的 API 凭证</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
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
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>连接状态</Label>
                    <div className="flex items-center p-3 border rounded-md">
                      <div className="h-10 w-10 rounded-md bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <Cloud className="h-5 w-5" />
                      </div>
                      <div className="ml-4 flex-1">
                        <h4 className="font-medium">讯飞语音识别</h4>
                        <p className="text-sm text-muted-foreground">
                          {config.xunfei.appid ? "已配置" : "未配置"}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        测试连接
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
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
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="openrouter" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Key className="h-5 w-5 mr-2" />
                    OpenRouter 配置
                  </CardTitle>
                  <CardDescription>配置 OpenRouter API 用于 LLM 分析</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
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
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>连接状态</Label>
                    <div className="flex items-center p-3 border rounded-md">
                      <div className="h-10 w-10 rounded-md bg-green-100 dark:bg-green-900/20 flex items-center justify-center text-green-600 dark:text-green-400">
                        <Key className="h-5 w-5" />
                      </div>
                      <div className="ml-4 flex-1">
                        <h4 className="font-medium">OpenRouter API</h4>
                        <p className="text-sm text-muted-foreground">
                          {config.openrouter.api_key ? "已配置" : "未配置"}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        测试连接
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
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
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="app" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Cog className="h-5 w-5 mr-2" />
                    应用设置
                  </CardTitle>
                  <CardDescription>配置应用的行为参数</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <Label>基本设置</Label>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="log-level">日志级别</Label>
                        <Select value={config.app.log_level} onValueChange={(value) => handleConfigChange('app', 'log_level', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="请选择日志级别" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="error">Error</SelectItem>
                            <SelectItem value="warn">Warn</SelectItem>
                            <SelectItem value="info">Info</SelectItem>
                            <SelectItem value="debug">Debug</SelectItem>
                            <SelectItem value="trace">Trace</SelectItem>
                          </SelectContent>
                        </Select>
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
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>自动化设置</Label>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">自动保存</span>
                          <p className="text-sm text-muted-foreground">自动保存配置更改</p>
                        </div>
                        <Switch checked={autoSave} onCheckedChange={setAutoSave} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">启用配置验证</span>
                          <p className="text-sm text-muted-foreground">保存时自动验证配置</p>
                        </div>
                        <Switch checked={enableValidation} onCheckedChange={setEnableValidation} />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>配置操作</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <Button variant="outline" onClick={handleReset}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        重置为默认值
                      </Button>
                      <Button variant="outline" onClick={handleMigrateFromEnv}>
                        从环境变量迁移
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
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
                </CardFooter>
              </Card>
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          <span className="text-sm font-medium">配置管理</span>
        </div>
        <div className="flex space-x-2">
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