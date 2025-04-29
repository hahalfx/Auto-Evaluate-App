"use client"

import { useState } from "react"
import {
  Bell,
  Brush,
  Check,
  ChevronRight,
  Cloud,
  Cog,
  Database,
  Globe,
  HardDrive,
  Key,
  LayoutGrid,
  Lock,
  Moon,
  Palette,
  Save,
  Shield,
  Sun,
  TestTubeIcon,
  User,
  Volume2,
  Wand2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/use-toast"
import { Slider } from "@/components/ui/slider"

export default function SettingsView() {
  const [theme, setTheme] = useState("system")
  const [accentColor, setAccentColor] = useState("blue")
  const [language, setLanguage] = useState("zh-CN")
  const [notifications, setNotifications] = useState(true)
  const [autoSave, setAutoSave] = useState(true)
  const [dataStorage, setDataStorage] = useState("local")
  const [speechThreshold, setSpeechThreshold] = useState(85)
  const [languageThreshold, setLanguageThreshold] = useState(80)
  const [interactionThreshold, setInteractionThreshold] = useState(80)
  const [safetyThreshold, setSafetyThreshold] = useState(90)
  const [noiseLevel, setNoiseLevel] = useState(30)
  const [apiKey, setApiKey] = useState("••••••••••••••••••••••••••••••")

  const handleSaveSettings = () => {
    toast({
      title: "设置已保存",
      description: "您的设置已成功保存",
    })
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground">配置应用程序和测试参数</p>
      </div>

      <Tabs defaultValue="appearance" className="w-full">
        <div className="flex flex-col md:flex-row gap-6">
          <Card className="md:w-64 h-fit">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-base">设置菜单</CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-0">
              <TabsList className="flex flex-col h-auto bg-transparent space-y-1">
                <TabsTrigger value="appearance" className="justify-start w-full px-2">
                  <Palette className="h-4 w-4 mr-2" />
                  <span>外观</span>
                </TabsTrigger>
                <TabsTrigger value="test" className="justify-start w-full px-2">
                  <TestTubeIcon className="h-4 w-4 mr-2" />
                  <span>测试设置</span>
                </TabsTrigger>
                <TabsTrigger value="account" className="justify-start w-full px-2">
                  <User className="h-4 w-4 mr-2" />
                  <span>账户</span>
                </TabsTrigger>
                <TabsTrigger value="data" className="justify-start w-full px-2">
                  <Database className="h-4 w-4 mr-2" />
                  <span>数据管理</span>
                </TabsTrigger>
                <TabsTrigger value="integration" className="justify-start w-full px-2">
                  <Cloud className="h-4 w-4 mr-2" />
                  <span>集成</span>
                </TabsTrigger>
                <TabsTrigger value="advanced" className="justify-start w-full px-2">
                  <Cog className="h-4 w-4 mr-2" />
                  <span>高级设置</span>
                </TabsTrigger>
              </TabsList>
            </CardContent>
          </Card>

          <div className="flex-1">
            <TabsContent value="appearance" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Brush className="h-5 w-5 mr-2" />
                    外观设置
                  </CardTitle>
                  <CardDescription>自定义应用程序的外观和感觉</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>主题</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <div
                        className={`flex flex-col items-center justify-center p-3 border rounded-md cursor-pointer hover:border-primary ${theme === "light" ? "border-primary bg-primary/10" : ""}`}
                        onClick={() => setTheme("light")}
                      >
                        <Sun className="h-6 w-6 mb-2" />
                        <span>浅色</span>
                        {theme === "light" && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <div
                        className={`flex flex-col items-center justify-center p-3 border rounded-md cursor-pointer hover:border-primary ${theme === "dark" ? "border-primary bg-primary/10" : ""}`}
                        onClick={() => setTheme("dark")}
                      >
                        <Moon className="h-6 w-6 mb-2" />
                        <span>深色</span>
                        {theme === "dark" && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <div
                        className={`flex flex-col items-center justify-center p-3 border rounded-md cursor-pointer hover:border-primary ${theme === "system" ? "border-primary bg-primary/10" : ""}`}
                        onClick={() => setTheme("system")}
                      >
                        <LayoutGrid className="h-6 w-6 mb-2" />
                        <span>系统</span>
                        {theme === "system" && <Check className="h-4 w-4 text-primary" />}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>强调色</Label>
                    <div className="grid grid-cols-6 gap-2">
                      {["blue", "purple", "green", "orange", "red", "gray"].map((color) => (
                        <TooltipProvider key={color}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className={`relative w-full aspect-square rounded-full ${
                                  color === "blue"
                                    ? "bg-blue-500"
                                    : color === "purple"
                                      ? "bg-purple-500"
                                      : color === "green"
                                        ? "bg-green-500"
                                        : color === "orange"
                                          ? "bg-orange-500"
                                          : color === "red"
                                            ? "bg-red-500"
                                            : "bg-gray-500"
                                } ${accentColor === color ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                                onClick={() => setAccentColor(color)}
                              >
                                {accentColor === color && (
                                  <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="capitalize">{color}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>语言</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh-CN">简体中文</SelectItem>
                        <SelectItem value="en-US">English (US)</SelectItem>
                        <SelectItem value="ja-JP">日本語</SelectItem>
                        <SelectItem value="ko-KR">한국어</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>通知</Label>
                      <p className="text-sm text-muted-foreground">接收测试完成和系统更新通知</p>
                    </div>
                    <Switch checked={notifications} onCheckedChange={setNotifications} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>自动保存</Label>
                      <p className="text-sm text-muted-foreground">自动保存测试结果和设置更改</p>
                    </div>
                    <Switch checked={autoSave} onCheckedChange={setAutoSave} />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={handleSaveSettings}>保存设置</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="test" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TestTubeIcon className="h-5 w-5 mr-2" />
                    测试设置
                  </CardTitle>
                  <CardDescription>配置测试参数和阈值</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <Label>评估阈值设置</Label>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">语音识别准确率阈值</span>
                          <span className="text-sm font-medium">{speechThreshold}%</span>
                        </div>
                        <Slider
                          value={[speechThreshold]}
                          min={50}
                          max={100}
                          step={1}
                          onValueChange={(value) => setSpeechThreshold(value[0])}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">语言理解得分阈值</span>
                          <span className="text-sm font-medium">{languageThreshold}%</span>
                        </div>
                        <Slider
                          value={[languageThreshold]}
                          min={50}
                          max={100}
                          step={1}
                          onValueChange={(value) => setLanguageThreshold(value[0])}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">交互体验评分阈值</span>
                          <span className="text-sm font-medium">{interactionThreshold}%</span>
                        </div>
                        <Slider
                          value={[interactionThreshold]}
                          min={50}
                          max={100}
                          step={1}
                          onValueChange={(value) => setInteractionThreshold(value[0])}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">安全可靠性阈值</span>
                          <span className="text-sm font-medium">{safetyThreshold}%</span>
                        </div>
                        <Slider
                          value={[safetyThreshold]}
                          min={50}
                          max={100}
                          step={1}
                          onValueChange={(value) => setSafetyThreshold(value[0])}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>测试环境设置</Label>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">默认噪音强度</span>
                          <span className="text-sm font-medium">{noiseLevel} dB</span>
                        </div>
                        <Slider
                          value={[noiseLevel]}
                          min={0}
                          max={90}
                          step={1}
                          onValueChange={(value) => setNoiseLevel(value[0])}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>默认测试模式</Label>
                          <Select defaultValue="lab">
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lab">实验室模式</SelectItem>
                              <SelectItem value="road">路测模式</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>默认测试场景</Label>
                          <Select defaultValue="daily">
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="daily">日常使用场景</SelectItem>
                              <SelectItem value="navigation">导航场景</SelectItem>
                              <SelectItem value="entertainment">娱乐场景</SelectItem>
                              <SelectItem value="vehicle">车辆控制场景</SelectItem>
                              <SelectItem value="complex">复杂混合场景</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>自动化测试设置</Label>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">启用定时测试</span>
                          <p className="text-sm text-muted-foreground">按计划自动运行测试</p>
                        </div>
                        <Switch defaultChecked={false} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">测试失败自动重试</span>
                          <p className="text-sm text-muted-foreground">测试失败时自动重试</p>
                        </div>
                        <Switch defaultChecked={true} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">测试完成通知</span>
                          <p className="text-sm text-muted-foreground">测试完成时发送通知</p>
                        </div>
                        <Switch defaultChecked={true} />
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={handleSaveSettings}>保存设置</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="account" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <User className="h-5 w-5 mr-2" />
                    账户设置
                  </CardTitle>
                  <CardDescription>管理您的账户信息和权限</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">测试工程师</h3>
                        <p className="text-sm text-muted-foreground">engineer@example.com</p>
                      </div>
                      <Button variant="outline" size="sm" className="ml-auto">
                        更改头像
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="font-medium">个人信息</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">姓名</Label>
                        <Input id="name" defaultValue="测试工程师" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">电子邮件</Label>
                        <Input id="email" defaultValue="engineer@example.com" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">电话</Label>
                        <Input id="phone" defaultValue="138****1234" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="department">部门</Label>
                        <Input id="department" defaultValue="质量测试部" />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="font-medium">权限设置</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">管理员权限</span>
                          <p className="text-sm text-muted-foreground">可以管理所有系统设置和用户</p>
                        </div>
                        <Switch defaultChecked={false} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">测试执行权限</span>
                          <p className="text-sm text-muted-foreground">可以执行测试和查看结果</p>
                        </div>
                        <Switch defaultChecked={true} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">报告导出权限</span>
                          <p className="text-sm text-muted-foreground">可以导出和分享测试报告</p>
                        </div>
                        <Switch defaultChecked={true} />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="font-medium">安全设置</h3>
                    <Button variant="outline" className="w-full justify-start">
                      <Lock className="mr-2 h-4 w-4" />
                      更改密码
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <Shield className="mr-2 h-4 w-4" />
                      两步验证
                    </Button>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={handleSaveSettings}>保存设置</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="data" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Database className="h-5 w-5 mr-2" />
                    数据管理
                  </CardTitle>
                  <CardDescription>管理测试数据的存储和备份</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <Label>数据存储位置</Label>
                    <RadioGroup value={dataStorage} onValueChange={setDataStorage} className="flex flex-col space-y-3">
                      <div className="flex items-center space-x-3 space-y-0">
                        <RadioGroupItem value="local" id="local" />
                        <Label htmlFor="local" className="flex items-center">
                          <HardDrive className="mr-2 h-4 w-4" />
                          本地存储
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 space-y-0">
                        <RadioGroupItem value="cloud" id="cloud" />
                        <Label htmlFor="cloud" className="flex items-center">
                          <Cloud className="mr-2 h-4 w-4" />
                          云端存储
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 space-y-0">
                        <RadioGroupItem value="hybrid" id="hybrid" />
                        <Label htmlFor="hybrid" className="flex items-center">
                          <Globe className="mr-2 h-4 w-4" />
                          混合存储
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>数据保留策略</Label>
                    <Select defaultValue="90days">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30days">保留30天</SelectItem>
                        <SelectItem value="90days">保留90天</SelectItem>
                        <SelectItem value="180days">保留180天</SelectItem>
                        <SelectItem value="1year">保留1年</SelectItem>
                        <SelectItem value="forever">永久保留</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>自动备份设置</Label>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">启用自动备份</span>
                          <p className="text-sm text-muted-foreground">定期备份所有测试数据</p>
                        </div>
                        <Switch defaultChecked={true} />
                      </div>

                      <div className="space-y-2">
                        <Label>备份频率</Label>
                        <Select defaultValue="weekly">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">每天</SelectItem>
                            <SelectItem value="weekly">每周</SelectItem>
                            <SelectItem value="monthly">每月</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>数据操作</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <Button variant="outline" className="justify-start">
                        <Save className="mr-2 h-4 w-4" />
                        导出所有数据
                      </Button>
                      <Button variant="outline" className="justify-start">
                        <Wand2 className="mr-2 h-4 w-4" />
                        数据清理
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={handleSaveSettings}>保存设置</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="integration" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Cloud className="h-5 w-5 mr-2" />
                    集成设置
                  </CardTitle>
                  <CardDescription>管理与其他系统的集成</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <Label>API 设置</Label>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="api-key">API 密钥</Label>
                        <div className="flex gap-2">
                          <Input id="api-key" value={apiKey} readOnly className="font-mono" />
                          <Button variant="outline">重新生成</Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">启用 API 访问</span>
                          <p className="text-sm text-muted-foreground">允许通过 API 访问测试数据</p>
                        </div>
                        <Switch defaultChecked={true} />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>第三方集成</Label>
                    <div className="space-y-4">
                      <div className="flex items-center p-3 border rounded-md">
                        <div className="h-10 w-10 rounded-md bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                          <Cloud className="h-5 w-5" />
                        </div>
                        <div className="ml-4 flex-1">
                          <h4 className="font-medium">云存储服务</h4>
                          <p className="text-sm text-muted-foreground">已连接</p>
                        </div>
                        <Button variant="ghost" size="sm">
                          配置
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex items-center p-3 border rounded-md">
                        <div className="h-10 w-10 rounded-md bg-green-100 dark:bg-green-900/20 flex items-center justify-center text-green-600 dark:text-green-400">
                          <Bell className="h-5 w-5" />
                        </div>
                        <div className="ml-4 flex-1">
                          <h4 className="font-medium">通知服务</h4>
                          <p className="text-sm text-muted-foreground">已连接</p>
                        </div>
                        <Button variant="ghost" size="sm">
                          配置
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex items-center p-3 border rounded-md">
                        <div className="h-10 w-10 rounded-md bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                          <Volume2 className="h-5 w-5" />
                        </div>
                        <div className="ml-4 flex-1">
                          <h4 className="font-medium">语音分析服务</h4>
                          <p className="text-sm text-muted-foreground">未连接</p>
                        </div>
                        <Button variant="ghost" size="sm">
                          连接
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>

                      <Button variant="outline" className="w-full">
                        添加更多集成
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>Webhook 设置</Label>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">启用 Webhook</span>
                          <p className="text-sm text-muted-foreground">在测试完成时发送 Webhook 通知</p>
                        </div>
                        <Switch defaultChecked={false} />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="webhook-url">Webhook URL</Label>
                        <Input id="webhook-url" placeholder="https://example.com/webhook" />
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={handleSaveSettings}>保存设置</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="advanced" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Cog className="h-5 w-5 mr-2" />
                    高级设置
                  </CardTitle>
                  <CardDescription>配置高级系统参数</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <Label>系统性能</Label>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">高性能模式</span>
                          <p className="text-sm text-muted-foreground">使用更多系统资源以提高性能</p>
                        </div>
                        <Switch defaultChecked={false} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">并行测试</span>
                          <p className="text-sm text-muted-foreground">同时运行多个测试</p>
                        </div>
                        <Switch defaultChecked={true} />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>最大并行测试数</Label>
                          <span className="text-sm font-medium">4</span>
                        </div>
                        <Slider defaultValue={[4]} min={1} max={8} step={1} />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>日志设置</Label>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>日志级别</Label>
                        <Select defaultValue="info">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="debug">调试</SelectItem>
                            <SelectItem value="info">信息</SelectItem>
                            <SelectItem value="warning">警告</SelectItem>
                            <SelectItem value="error">错误</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">详细日志</span>
                          <p className="text-sm text-muted-foreground">记录更详细的系统日志</p>
                        </div>
                        <Switch defaultChecked={false} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">性能指标日志</span>
                          <p className="text-sm text-muted-foreground">记录系统性能指标</p>
                        </div>
                        <Switch defaultChecked={true} />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>开发者选项</Label>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">开发者模式</span>
                          <p className="text-sm text-muted-foreground">启用开发者工具和调试功能</p>
                        </div>
                        <Switch defaultChecked={false} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">实验性功能</span>
                          <p className="text-sm text-muted-foreground">启用实验性功能</p>
                        </div>
                        <Switch defaultChecked={false} />
                      </div>

                      <Button variant="outline" className="w-full justify-start">
                        <Key className="mr-2 h-4 w-4" />
                        导出开发者配置
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={handleSaveSettings}>保存设置</Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  )
}
