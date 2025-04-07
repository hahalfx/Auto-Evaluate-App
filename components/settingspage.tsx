import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "./ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function SettingsPage() {
  // 静态设置数据（实际应用应该来自状态管理或API）
  const settings = {
    general: {
      language: "zh-CN",
      theme: "system",
      autoUpdate: true,
    },
    audio: {
      sampleRate: 44100,
      noiseReduction: true,
      playbackDevice: "default",
    },
    notifications: {
      emailAlerts: true,
      successAlerts: true,
      failureAlerts: false,
    },
  };

  return (
    <div>
      <div className="flex items-center fixed top-0 w-full bg-white">
        <SidebarTrigger className="mx-6 my-4"/>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">主页</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/settings">应用设置</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    <div className="min-h-screen bg-white p-6 pt-14">
      <div className="max-w-full mx-auto">
        <h1 className="text-3xl font-bold mb-6">应用设置</h1>

        {/* 标签页布局 */}
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">通用</TabsTrigger>
            <TabsTrigger value="audio">音频设置</TabsTrigger>
            <TabsTrigger value="notifications">通知</TabsTrigger>
          </TabsList>

          {/* 通用设置 */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>通用设置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="language">界面语言</Label>
                  <Select defaultValue={settings.general.language}>
                    <SelectTrigger id="language">
                      <SelectValue placeholder="选择语言" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh-CN">简体中文</SelectItem>
                      <SelectItem value="en-US">English</SelectItem>
                      <SelectItem value="ja-JP">日本語</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="theme">主题模式</Label>
                  <Select defaultValue={settings.general.theme}>
                    <SelectTrigger id="theme">
                      <SelectValue placeholder="选择主题" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">浅色模式</SelectItem>
                      <SelectItem value="dark">深色模式</SelectItem>
                      <SelectItem value="system">跟随系统</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between space-x-4">
                  <Label
                    htmlFor="auto-update"
                    className="flex flex-col space-y-1"
                  >
                    <span>自动更新</span>
                    <span className="font-normal text-muted-foreground">
                      保持应用为最新版本
                    </span>
                  </Label>
                  <Switch
                    id="auto-update"
                    defaultChecked={settings.general.autoUpdate}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button variant="outline">重置默认值</Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* 音频设置 */}
          <TabsContent value="audio">
            <Card>
              <CardHeader>
                <CardTitle>音频设置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="sample-rate">采样率 (Hz)</Label>
                  <Input
                    id="sample-rate"
                    type="number"
                    defaultValue={settings.audio.sampleRate}
                  />
                </div>

                <div className="flex items-center justify-between space-x-4">
                  <Label
                    htmlFor="noise-reduction"
                    className="flex flex-col space-y-1"
                  >
                    <span>降噪处理</span>
                    <span className="font-normal text-muted-foreground">
                      减少背景噪声干扰
                    </span>
                  </Label>
                  <Switch
                    id="noise-reduction"
                    defaultChecked={settings.audio.noiseReduction}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="playback-device">播放设备</Label>
                  <Select defaultValue={settings.audio.playbackDevice}>
                    <SelectTrigger id="playback-device">
                      <SelectValue placeholder="选择设备" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">系统默认</SelectItem>
                      <SelectItem value="headphones">耳机</SelectItem>
                      <SelectItem value="speakers">扬声器</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button variant="outline">重置默认值</Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* 通知设置 */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>通知设置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between space-x-4">
                  <Label
                    htmlFor="email-alerts"
                    className="flex flex-col space-y-1"
                  >
                    <span>邮件通知</span>
                    <span className="font-normal text-muted-foreground">
                      重要事件将通过邮件提醒
                    </span>
                  </Label>
                  <Switch
                    id="email-alerts"
                    defaultChecked={settings.notifications.emailAlerts}
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <Label>验证结果通知</Label>
                  <div className="flex items-center justify-between space-x-4">
                    <Label htmlFor="success-alerts">验证成功</Label>
                    <Switch
                      id="success-alerts"
                      defaultChecked={settings.notifications.successAlerts}
                    />
                  </div>
                  <div className="flex items-center justify-between space-x-4">
                    <Label htmlFor="failure-alerts">验证失败</Label>
                    <Switch
                      id="failure-alerts"
                      defaultChecked={settings.notifications.failureAlerts}
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button variant="outline">重置默认值</Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 全局操作按钮 */}
        <div className="mt-6 flex justify-end gap-4">
          <Button variant="outline">取消</Button>
          <Button>保存设置</Button>
        </div>
      </div>
    </div>
    </div>
  );
}
