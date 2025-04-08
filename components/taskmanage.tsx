import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { SidebarTrigger } from "./ui/sidebar";
import { ChartComponent } from "./chartsample";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ellipsis } from "lucide-react";

export default function TaskManage() {
  // 静态演示数据
  const stats = {
    totalVerifications: 1248,
    successRate: 82,
    averageSimilarity: 76,
    recentResults: [
      {
        id: 1,
        similarity: 89,
        status: "success",
        timestamp: "2023-11-15 09:23",
      },
      {
        id: 2,
        similarity: 64,
        status: "failed",
        timestamp: "2023-11-15 09:17",
      },
      {
        id: 3,
        similarity: 92,
        status: "success",
        timestamp: "2023-11-15 09:12",
      },
      {
        id: 4,
        similarity: 78,
        status: "success",
        timestamp: "2023-11-15 09:05",
      },
    ],
  };

  return (
    <div>
      <div className="flex items-center fixed top-0 w-full bg-white">
        <SidebarTrigger className="mx-6 my-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">主页</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/taskmanage">测试任务管理</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="min-h-screen bg-white p-6">
        <div className="pt-8 w-full mx-auto">
          <h1 className="text-3xl font-bold mb-6">测试任务管理</h1>

          {/* 核心指标卡片组 */}
          <div className="w-full mb-6">
            <ChartComponent />
          </div>

          {/* 最近验证任务 */}
          <Card>
            <CardHeader>
              <CardTitle>最近验证任务</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.recentResults.map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center space-x-4">
                      <div
                        className={`h-3 w-3 rounded-full ${
                          result.status === "success"
                            ? "bg-green-500"
                            : "bg-red-500"
                        }`}
                      />
                      <div>
                        <p className="font-medium">验证 #{result.id}</p>
                        <p className="text-sm text-muted-foreground">
                          {result.timestamp}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="font-mono">{result.similarity}%</p>
                        <p className="text-xs text-muted-foreground">成功率</p>
                      </div>
                      <div
                        className={`px-3 py-1 rounded-full text-sm ${
                          result.status === "success"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {result.status === "success" ? "通过" : "失败"}
                      </div>
                      <div>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="justify-items-center hover:bg-gray-100">
                            <Ellipsis className="p-1"/>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuLabel>更多</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>Profile</DropdownMenuItem>
                            <DropdownMenuItem>Billing</DropdownMenuItem>
                            <DropdownMenuItem>Team</DropdownMenuItem>
                            <DropdownMenuItem>Subscription</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 系统状态 */}
          <div className="grid gap-6 mt-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>系统状态</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>语音识别引擎</span>
                    <span className="text-green-600">运行正常</span>
                  </div>
                  <div className="flex justify-between">
                    <span>数据库连接</span>
                    <span className="text-green-600">活跃</span>
                  </div>
                  <div className="flex justify-between">
                    <span>API响应时间</span>
                    <span>127ms</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>今日概览</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>验证次数</span>
                    <span>48</span>
                  </div>
                  <div className="flex justify-between">
                    <span>成功验证</span>
                    <span>39 (81%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>平均处理时间</span>
                    <span>2.4s</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
