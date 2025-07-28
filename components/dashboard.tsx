"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { 
  Database, 
  FileText, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  TrendingUp,
  RefreshCw,
  BarChart3,
  Activity,
  Loader2,
  Settings,
  AlertTriangle
} from "lucide-react";
import { TauriApiService } from '@/services/tauri-api';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import type { Task, TestSample, WakeWord, AnalysisResult } from '@/types/api';
import type { ConfigData as AppConfigData } from '@/services/tauri-api';

export default function DashBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [samples, setSamples] = useState<TestSample[]>([]);
  const [wakeWords, setWakeWords] = useState<WakeWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<AppConfigData | null>(null);
  const [showConfigAlert, setShowConfigAlert] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const router = useRouter();
  
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    totalSamples: 0,
    totalWakeWords: 0,
    totalAnalysisResults: 0,
    averageOverallScore: 0,
    successRate: 0,
    averageRecognitionTime: 0,
    averageResponseTime: 0,
  });
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [recentResults, setRecentResults] = useState<Array<{
    taskId: number;
    taskName: string;
    sampleId: number;
    sampleText: string;
    overallScore: number;
    status: 'success' | 'failed';
    timestamp: string;
  }>>([]);
  
  const { toast } = useToast();

  // 在客户端mount后检查Tauri环境
  useEffect(() => {
    setMounted(true);
  }, []);

  // 检查是否在 Tauri 环境中 - 只在客户端执行
  const isTauri = mounted && typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

  // 加载配置
  const loadConfig = async () => {
    if (!isTauri) return;
    
    try {
      setConfigLoading(true);
      const configData = await TauriApiService.getAppConfig();
      setConfig(configData);
      
      // 检查必要的配置是否为空
      const hasXunfeiConfig = configData.xunfei.appid && configData.xunfei.api_key && configData.xunfei.api_secret;
      const hasOpenRouterConfig = configData.openrouter.api_key;
      
      if (!hasXunfeiConfig || !hasOpenRouterConfig) {
        setShowConfigAlert(true);
      } else {
        // 如果配置完整，关闭AlertDialog
        setShowConfigAlert(false);
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      // 如果无法加载配置，也显示提醒
      setShowConfigAlert(true);
    } finally {
      setConfigLoading(false);
    }
  };

  const loadData = async () => {
    if (!isTauri) return;
    
    setLoading(true);
    try {
      const [tasksData, samplesData, wakeWordsData] = await Promise.all([
        TauriApiService.getAllTasks(),
        TauriApiService.getAllSamples(),
        TauriApiService.getAllWakeWords(),
      ]);

      setTasks(tasksData);
      setSamples(samplesData);
      setWakeWords(wakeWordsData);

      // 计算统计数据
      const completedTasks = tasksData.filter(t => t.task_status === 'completed').length;
      const pendingTasks = tasksData.filter(t => t.task_status === 'pending').length;
      
      // 计算分析结果统计
      let totalResults = 0;
      let totalScore = 0;
      let successCount = 0;
      let totalRecognitionTime = 0;
      let totalResponseTime = 0;
      let recognitionTimeCount = 0;
      let responseTimeCount = 0;
      
      const allResults: Array<{
        taskId: number;
        taskName: string;
        sampleId: number;
        sampleText: string;
        overallScore: number;
        status: 'success' | 'failed';
        timestamp: string;
      }> = [];

      tasksData.forEach(task => {
        if (task.test_result) {
          Object.entries(task.test_result).forEach(([sampleId, result]) => {
            totalResults++;
            totalScore += result.assessment.overall_score;
            
            if (result.assessment.valid) {
              successCount++;
            }
            
            if (result.recognitionTime) {
              totalRecognitionTime += result.recognitionTime;
              recognitionTimeCount++;
            }
            
            if (result.responseTime) {
              totalResponseTime += result.responseTime;
              responseTimeCount++;
            }

            // 找到对应的样本文本
            const sample = samplesData.find(s => s.id === parseInt(sampleId));
            
            allResults.push({
              taskId: task.id,
              taskName: task.name,
              sampleId: parseInt(sampleId),
              sampleText: sample?.text || '未知样本',
              overallScore: result.assessment.overall_score,
              status: result.assessment.valid ? 'success' : 'failed',
              timestamp: result.test_time || task.created_at,
            });
          });
        }
      });

      // 按时间排序，取最近的结果
      allResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentResults(allResults.slice(0, 10));

      // 按创建时间排序，取最近的任务
      const sortedTasks = [...tasksData].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setRecentTasks(sortedTasks.slice(0, 5));

      setStats({
        totalTasks: tasksData.length,
        completedTasks,
        pendingTasks,
        totalSamples: samplesData.length,
        totalWakeWords: wakeWordsData.length,
        totalAnalysisResults: totalResults,
        averageOverallScore: totalResults > 0 ? Math.round((totalScore / totalResults) * 100) / 100 : 0,
        successRate: totalResults > 0 ? Math.round((successCount / totalResults) * 100) : 0,
        averageRecognitionTime: recognitionTimeCount > 0 ? Math.round(totalRecognitionTime / recognitionTimeCount) : 0,
        averageResponseTime: responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : 0,
      });

      toast({
        title: "数据加载成功",
        description: `加载了 ${tasksData.length} 个任务, ${samplesData.length} 个样本, ${wakeWordsData.length} 个唤醒词`,
      });
    } catch (error) {
      console.error('加载数据失败:', error);
      toast({
        title: "加载数据失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isTauri) {
      loadConfig();
      loadData();
    }
  }, [isTauri]);

  // 监听路由变化，当从配置页面返回时重新加载配置
  useEffect(() => {
    const handleRouteChange = () => {
      if (isTauri && mounted) {
        loadConfig();
      }
    };

    // 监听popstate事件（浏览器后退/前进）
    window.addEventListener('popstate', handleRouteChange);
    
    // 监听focus事件（用户从其他标签页返回）
    window.addEventListener('focus', handleRouteChange);

    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('focus', handleRouteChange);
    };
  }, [isTauri, mounted]);

  // 跳转到配置设置页面
  const handleGoToSettings = () => {
    setShowConfigAlert(false);
    router.push('/settings');
  };

  // 刷新配置
  const handleRefreshConfig = async () => {
    await loadConfig();
    toast({
      title: "配置已刷新",
      description: "已重新加载配置信息",
    });
  };

  // 在组件mount之前，显示loading状态避免hydration错误
  if (!mounted) {
    return (
      <div className="w-full min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-spin" />
          <h2 className="text-xl font-semibold mb-2">正在加载...</h2>
          <p className="text-muted-foreground">正在初始化仪表板</p>
        </div>
      </div>
    );
  }

  if (!isTauri) {
    return (
      <div className="w-full min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-center">
          <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">需要 Tauri 环境</h2>
          <p className="text-muted-foreground">此仪表板需要在 Tauri 桌面应用中运行</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 配置提醒对话框 */}
      <AlertDialog open={showConfigAlert} onOpenChange={setShowConfigAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              配置提醒
            </AlertDialogTitle>
            <AlertDialogDescription>
              检测到应用缺少必要的API配置参数。为了正常使用语音识别和LLM分析功能，请前往配置设置页面完成以下配置：
              <span className="mt-3 space-y-2 block">
                <span className="flex items-center gap-2 block">
                  <Settings className="h-4 w-4" />
                  <span className="text-sm font-medium">讯飞语音识别配置</span>
                </span>
                <span className="flex items-center gap-2 block">
                  <Settings className="h-4 w-4" />
                  <span className="text-sm font-medium">OpenRouter API配置</span>
                </span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>稍后配置</AlertDialogCancel>
            <AlertDialogAction onClick={handleGoToSettings}>
              前往配置设置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="min-h-screen bg-background p-6">
        <div className="w-full mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">测试数据仪表板</h1>
            <Button 
              onClick={loadData} 
              disabled={loading}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新数据
            </Button>
          </div>

          {/* 配置状态提示 */}
          {config && (
            (() => {
              const hasXunfeiConfig = config.xunfei.appid && config.xunfei.api_key && config.xunfei.api_secret;
              const hasOpenRouterConfig = config.openrouter.api_key;
              const isConfigComplete = hasXunfeiConfig && hasOpenRouterConfig;
              
              // 只有当配置不完整时才显示提醒卡片
              if (!isConfigComplete) {
                return (
                  <div className="mb-6">
                    <Card className="border-orange-200 bg-orange-50">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-orange-500" />
                          <div className="flex-1">
                            <h3 className="font-medium text-orange-800">配置状态</h3>
                            <p className="text-sm text-orange-700">
                              讯飞配置: {hasXunfeiConfig ? '已配置' : '未配置'} | 
                              OpenRouter配置: {hasOpenRouterConfig ? '已配置' : '未配置'}
                            </p>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleRefreshConfig}
                            disabled={configLoading}
                          >
                            <RefreshCw className={`h-4 w-4 mr-2 ${configLoading ? 'animate-spin' : ''}`} />
                            刷新配置
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => router.push('/settings')}
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            配置设置
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              }
              return null;
            })()
          )}

          {/* 核心指标卡片组 */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {/* 总任务数 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总任务数</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalTasks}</div>
                <p className="text-xs text-muted-foreground">
                  已完成: {stats.completedTasks} | 待处理: {stats.pendingTasks}
                </p>
              </CardContent>
            </Card>

            {/* 总样本数 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总样本数</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalSamples}</div>
                <p className="text-xs text-muted-foreground">
                  唤醒词: {stats.totalWakeWords} 个
                </p>
              </CardContent>
            </Card>

            {/* 分析结果数 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">分析结果</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalAnalysisResults}</div>
                <p className="text-xs text-muted-foreground">
                  成功率: {stats.successRate}%
                </p>
              </CardContent>
            </Card>

            {/* 平均评分 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均评分</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.averageOverallScore}</div>
                <Progress value={stats.averageOverallScore * 100} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  满分: 1.0
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 性能指标 */}
          <div className="grid gap-6 md:grid-cols-2 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  性能指标
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">平均识别时间</span>
                    <span className="font-mono">{stats.averageRecognitionTime}ms</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">平均响应时间</span>
                    <span className="font-mono">{stats.averageResponseTime}ms</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">成功率</span>
                    <Badge variant={stats.successRate >= 80 ? "default" : "secondary"}>
                      {stats.successRate}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  任务状态分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">已完成</span>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="font-mono">{stats.completedTasks}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">待处理</span>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <span className="font-mono">{stats.pendingTasks}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">进行中</span>
                    <div className="flex items-center space-x-2">
                      <Play className="h-4 w-4 text-blue-500" />
                      <span className="font-mono">{stats.totalTasks - stats.completedTasks - stats.pendingTasks}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 最近任务和分析结果 */}
          <Tabs defaultValue="tasks" className="space-y-4">
            <TabsList>
              <TabsTrigger value="tasks">最近任务</TabsTrigger>
              <TabsTrigger value="results">最近分析结果</TabsTrigger>
            </TabsList>
            
            <TabsContent value="tasks" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>最近创建的任务</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {recentTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <div className={`h-3 w-3 rounded-full ${
                              task.task_status === 'completed' ? 'bg-green-500' :
                              task.task_status === 'pending' ? 'bg-yellow-500' : 'bg-blue-500'
                            }`} />
                            <div>
                              <p className="font-medium">{task.name}</p>
                              <p className="text-sm text-muted-foreground">
                                创建时间: {new Date(task.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <p className="font-mono">{task.test_samples_ids.length}</p>
                              <p className="text-xs text-muted-foreground">样本数</p>
                            </div>
                            <Badge variant={
                              task.task_status === 'completed' ? 'default' :
                              task.task_status === 'pending' ? 'secondary' : 'outline'
                            }>
                              {task.task_status === 'completed' ? '已完成' :
                               task.task_status === 'pending' ? '待处理' : '进行中'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {recentTasks.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          暂无任务数据
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="results" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>最近分析结果</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {recentResults.map((result, index) => (
                        <div
                          key={`${result.taskId}-${result.sampleId}-${index}`}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <div className={`h-3 w-3 rounded-full ${
                              result.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                            }`} />
                            <div>
                              <p className="font-medium">{result.taskName}</p>
                              <p className="text-sm text-muted-foreground">
                                {result.sampleText}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(result.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <p className="font-mono">{Math.round(result.overallScore * 100)}%</p>
                              <p className="text-xs text-muted-foreground">评分</p>
                            </div>
                            <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                              {result.status === 'success' ? '通过' : '失败'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {recentResults.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          暂无分析结果数据
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
