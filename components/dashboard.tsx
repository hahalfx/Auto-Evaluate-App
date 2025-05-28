import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
//import { SidebarTrigger } from "./ui/sidebar";

export default function DashBoard() {
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
    <div className="w-full">
      <div className="min-h-screen bg-background p-6">
        <div className="w-full mx-auto">
          <h1 className="text-3xl font-bold mb-6">
            语音验证数据看板
          </h1>

          {/* 核心指标卡片组 */}
          <div className="grid gap-6 md:grid-cols-3 mb-8">
            {/* 总验证次数 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">总验证次数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">
                  {stats.totalVerifications}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  过去30天数据
                </p>
              </CardContent>
            </Card>

            {/* 验证成功率 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">验证成功率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{stats.successRate}%</div>
                <Progress value={stats.successRate} className="h-2 mt-3" />
                <p className="text-sm text-muted-foreground mt-2">较上月 ↑2%</p>
              </CardContent>
            </Card>

            {/* 平均相似度 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">平均成功率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">
                  {stats.averageSimilarity}%
                </div>
                <Progress
                  value={stats.averageSimilarity}
                  className="h-2 mt-3"
                />
                <p className="text-sm text-muted-foreground mt-2">
                  行业基准: 70%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 最近验证记录 */}
          <Card>
            <CardHeader>
              <CardTitle>最近验证记录</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.recentResults.map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center justify-between p-3 border rounded-lg h-20"
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
