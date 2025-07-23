"use client";

import { useState, useEffect } from 'react';
import { TauriApiService } from '@/services/tauri-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, FileAudio, Info, Database } from 'lucide-react';
import type { Task, TestSample, WakeWord } from '@/types/api';

export default function TauriTestPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [samples, setSamples] = useState<TestSample[]>([]);
  const [wakeWords, setWakeWords] = useState<WakeWord[]>([]);
  const [samplesRaw, setSamplesRaw] = useState<any[]>([]);
  const [wakeWordsRaw, setWakeWordsRaw] = useState<any[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newSampleText, setNewSampleText] = useState('');
  const [newWakeWordText, setNewWakeWordText] = useState('');
  const [expandedSamples, setExpandedSamples] = useState<Set<number>>(new Set());
  const [expandedWakeWords, setExpandedWakeWords] = useState<Set<number>>(new Set());
  const [showRawData, setShowRawData] = useState(false);
  const { toast } = useToast();

  // 检查是否在 Tauri 环境中
  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

  useEffect(() => {
    if (isTauri) {
      loadData();
    }
  }, [isTauri]);

  const loadData = async () => {
    if (!isTauri) return;
    
    setLoading(true);
    try {
      const [tasksData, samplesData, wakeWordsData, currentTaskData, samplesRawData, wakeWordsRawData] = await Promise.all([
        TauriApiService.getAllTasks(),
        TauriApiService.getAllSamples(),
        TauriApiService.getAllWakeWords(),
        TauriApiService.getCurrentTask(),
        TauriApiService.getAllSamplesRaw(),
        TauriApiService.getAllWakeWordsRaw(),
      ]);

      setTasks(tasksData);
      setSamples(samplesData);
      setWakeWords(wakeWordsData);
      setCurrentTask(currentTaskData);
      setSamplesRaw(samplesRawData);
      setWakeWordsRaw(wakeWordsRawData);

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

  const createTask = async () => {
    if (!isTauri || !newTaskName.trim()) return;

    try {
      const taskId = await TauriApiService.createTask(
        newTaskName,
        samples.slice(0, 3).map(s => s.id), // 使用前3个样本
        wakeWords[0]?.id || 1 // 使用第一个唤醒词
      );

      toast({
        title: "任务创建成功",
        description: `任务ID: ${taskId}`,
      });

      setNewTaskName('');
      loadData(); // 重新加载数据
    } catch (error) {
      console.error('创建任务失败:', error);
      toast({
        title: "创建任务失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  };

  const createSample = async () => {
    if (!isTauri || !newSampleText.trim()) return;

    try {
      const sampleId = await TauriApiService.createSample(newSampleText);

      toast({
        title: "样本创建成功",
        description: `样本ID: ${sampleId}`,
      });

      setNewSampleText('');
      loadData(); // 重新加载数据
    } catch (error) {
      console.error('创建样本失败:', error);
      toast({
        title: "创建样本失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  };

  const createWakeWord = async () => {
    if (!isTauri || !newWakeWordText.trim()) return;

    try {
      const wakeWordId = await TauriApiService.createWakeWord(newWakeWordText);

      toast({
        title: "唤醒词创建成功",
        description: `唤醒词ID: ${wakeWordId}`,
      });

      setNewWakeWordText('');
      loadData(); // 重新加载数据
    } catch (error) {
      console.error('创建唤醒词失败:', error);
      toast({
        title: "创建唤醒词失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  };

  const setCurrentTaskById = async (taskId: number) => {
    if (!isTauri) return;

    try {
      await TauriApiService.setCurrentTask(taskId);
      const currentTaskData = await TauriApiService.getCurrentTask();
      setCurrentTask(currentTaskData);
      
      toast({
        title: "设置当前任务成功",
        description: `当前任务: ${currentTaskData?.name || '未知'}`,
      });
    } catch (error) {
      console.error('设置当前任务失败:', error);
      toast({
        title: "设置当前任务失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  };

  const toggleSampleExpansion = (sampleId: number) => {
    const newExpanded = new Set(expandedSamples);
    if (newExpanded.has(sampleId)) {
      newExpanded.delete(sampleId);
    } else {
      newExpanded.add(sampleId);
    }
    setExpandedSamples(newExpanded);
  };

  const toggleWakeWordExpansion = (wakeWordId: number) => {
    const newExpanded = new Set(expandedWakeWords);
    if (newExpanded.has(wakeWordId)) {
      newExpanded.delete(wakeWordId);
    } else {
      newExpanded.add(wakeWordId);
    }
    setExpandedWakeWords(newExpanded);
  };

  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  if (!isTauri) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Tauri 测试页面</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              此页面只能在 Tauri 应用中运行。请使用 <code>npm run tauri dev</code> 启动应用。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 bg-white">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Tauri 后端测试</h1>
        <div className="flex gap-2">
          <Button 
            variant={showRawData ? "default" : "outline"}
            onClick={() => setShowRawData(!showRawData)}
          >
            {showRawData ? "隐藏原始数据" : "显示原始数据"}
          </Button>
          <Button onClick={loadData} disabled={loading}>
            {loading ? "加载中..." : "刷新数据"}
          </Button>
        </div>
      </div>

      {/* 当前任务 */}
      <Card>
        <CardHeader>
          <CardTitle>当前任务</CardTitle>
        </CardHeader>
        <CardContent>
          {currentTask ? (
            <div>
              <p><strong>ID:</strong> {currentTask.id}</p>
              <p><strong>名称:</strong> {currentTask.name}</p>
              <p><strong>状态:</strong> {currentTask.task_status}</p>
              <p><strong>样本数量:</strong> {currentTask.test_samples_ids.length}</p>
              <p><strong>唤醒词ID:</strong> {currentTask.wake_word_id}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">没有当前任务</p>
          )}
        </CardContent>
      </Card>

      {/* 创建任务 */}
      <Card>
        <CardHeader>
          <CardTitle>创建新任务</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="taskName">任务名称</Label>
            <Input
              id="taskName"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              placeholder="输入任务名称"
            />
          </div>
          <Button onClick={createTask} disabled={!newTaskName.trim()}>
            创建任务
          </Button>
        </CardContent>
      </Card>

      {/* 创建样本 */}
      <Card>
        <CardHeader>
          <CardTitle>创建新样本</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="sampleText">样本文本</Label>
            <Input
              id="sampleText"
              value={newSampleText}
              onChange={(e) => setNewSampleText(e.target.value)}
              placeholder="输入样本文本"
            />
          </div>
          <Button onClick={createSample} disabled={!newSampleText.trim()}>
            创建样本
          </Button>
        </CardContent>
      </Card>

      {/* 创建唤醒词 */}
      <Card>
        <CardHeader>
          <CardTitle>创建新唤醒词</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="wakeWordText">唤醒词文本</Label>
            <Input
              id="wakeWordText"
              value={newWakeWordText}
              onChange={(e) => setNewWakeWordText(e.target.value)}
              placeholder="输入唤醒词文本"
            />
          </div>
          <Button onClick={createWakeWord} disabled={!newWakeWordText.trim()}>
            创建唤醒词
          </Button>
        </CardContent>
      </Card>

      {/* 任务列表 */}
      <Card>
        <CardHeader>
          <CardTitle>任务列表 ({tasks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="flex justify-between items-center p-2 border rounded">
                <div>
                  <span className="font-medium">{task.name}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    (ID: {task.id}, 状态: {task.task_status})
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={currentTask?.id === task.id ? "default" : "outline"}
                  onClick={() => setCurrentTaskById(task.id)}
                >
                  {currentTask?.id === task.id ? "当前" : "设为当前"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 样本列表 - 详细字段显示 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            样本列表 ({samples.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <div className="space-y-3">
              {samples.map((sample) => (
                <Collapsible key={sample.id}>
                  <CollapsibleTrigger asChild>
                    <div 
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleSampleExpansion(sample.id)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedSamples.has(sample.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <div>
                          <div className="font-medium">ID: {sample.id}</div>
                          <div className="text-sm text-gray-600">{sample.text}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {sample.audio_file && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <FileAudio className="h-3 w-3" />
                            有音频
                          </Badge>
                        )}
                        {sample.status && (
                          <Badge variant="outline">{sample.status}</Badge>
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg border">
                                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                         <div>
                           <h4 className="font-semibold mb-2 flex items-center gap-1">
                             <Info className="h-4 w-4" />
                             基本信息
                           </h4>
                           <div className="space-y-1">
                             <div><strong>ID:</strong> {sample.id}</div>
                             <div><strong>文本:</strong> {sample.text}</div>
                             <div><strong>状态:</strong> {formatFieldValue(sample.status)}</div>
                             <div><strong>重复次数:</strong> {formatFieldValue(sample.repeats)}</div>
                           </div>
                         </div>
                         <div>
                           <h4 className="font-semibold mb-2 flex items-center gap-1">
                             <FileAudio className="h-4 w-4" />
                             音频信息
                           </h4>
                           <div className="space-y-1">
                             <div><strong>音频文件:</strong> {formatFieldValue(sample.audio_file)}</div>
                           </div>
                         </div>
                       </div>
                       {showRawData && (
                         <>
                           <Separator className="my-3" />
                           <div>
                             <h4 className="font-semibold mb-2 flex items-center gap-1">
                               <Database className="h-4 w-4" />
                               数据库原始字段
                             </h4>
                             <div className="bg-white p-2 rounded border text-xs">
                               <pre className="whitespace-pre-wrap">
                                 {(() => {
                                   const rawData = samplesRaw.find(raw => raw.id === sample.id);
                                   return rawData ? JSON.stringify(rawData, null, 2) : '未找到原始数据';
                                 })()}
                               </pre>
                             </div>
                           </div>
                         </>
                       )}
                      {sample.result && Object.keys(sample.result).length > 0 && (
                        <>
                          <Separator className="my-3" />
                          <div>
                            <h4 className="font-semibold mb-2">测试结果</h4>
                            <div className="bg-white p-2 rounded border text-xs">
                              <pre className="whitespace-pre-wrap">{JSON.stringify(sample.result, null, 2)}</pre>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 唤醒词列表 - 详细字段显示 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            唤醒词列表 ({wakeWords.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <div className="space-y-3">
              {wakeWords.map((wakeWord) => (
                <Collapsible key={wakeWord.id}>
                  <CollapsibleTrigger asChild>
                    <div 
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleWakeWordExpansion(wakeWord.id)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedWakeWords.has(wakeWord.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <div>
                          <div className="font-medium">ID: {wakeWord.id}</div>
                          <div className="text-sm text-gray-600">{wakeWord.text}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {wakeWord.audio_file && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <FileAudio className="h-3 w-3" />
                            有音频
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg border">
                                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                         <div>
                           <h4 className="font-semibold mb-2 flex items-center gap-1">
                             <Info className="h-4 w-4" />
                             基本信息
                           </h4>
                           <div className="space-y-1">
                             <div><strong>ID:</strong> {wakeWord.id}</div>
                             <div><strong>文本:</strong> {wakeWord.text}</div>
                           </div>
                         </div>
                         <div>
                           <h4 className="font-semibold mb-2 flex items-center gap-1">
                             <FileAudio className="h-4 w-4" />
                             音频信息
                           </h4>
                           <div className="space-y-1">
                             <div><strong>音频文件:</strong> {formatFieldValue(wakeWord.audio_file)}</div>
                           </div>
                         </div>
                       </div>
                       {showRawData && (
                         <>
                           <Separator className="my-3" />
                           <div>
                             <h4 className="font-semibold mb-2 flex items-center gap-1">
                               <Database className="h-4 w-4" />
                               数据库原始字段
                             </h4>
                             <div className="bg-white p-2 rounded border text-xs">
                               <pre className="whitespace-pre-wrap">
                                 {(() => {
                                   const rawData = wakeWordsRaw.find(raw => raw.id === wakeWord.id);
                                   return rawData ? JSON.stringify(rawData, null, 2) : '未找到原始数据';
                                 })()}
                               </pre>
                             </div>
                           </div>
                         </>
                       )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
