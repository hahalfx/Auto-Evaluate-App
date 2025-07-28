"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { TestSample } from "@/types/api";
import { useTauriSamples } from "@/hooks/useTauriSamples";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowUpDown,
  MoreHorizontal,
  Plus,
  Play,
  CircleX,
  CircleCheck,
  CircleDot,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { TauriAudioApiService } from "@/services/tauri-audio-api";
import { useToast } from "@/components/ui/use-toast";

interface TestSamplesProps {
  initialPageSize?: number;
  onDeleteSample?: (id: number) => void;
}

export function TestSamples({
  initialPageSize,
  onDeleteSample,
}: TestSamplesProps = {}) {
  const {
    samples,
    selectedSampleIds,
    isLoading,
    error: samplesError,
    fetchAllSamples,
    createSample,
    deleteSample: deleteSampleHook,
    deleteSamplesBatch,
    setSelectedSampleIds: setSelectedSampleIdsHook,
    importSamplesFromExcel,
    precheckSamples,
  } = useTauriSamples();
  
  const [newSampleText, setNewSampleText] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isPrechecking, setIsPrechecking] = useState(false);
  const [precheckResult, setPrecheckResult] = useState<{ new_texts: string[], duplicate_texts: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { playMatchedAudio } = useAudioPlayer();
  const { toast } = useToast();
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [sampleForDetail, setSampleForDetail] = useState<TestSample | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [sampleToDelete, setSampleToDelete] = useState<TestSample | null>(null);
  const [isBatchDeleteConfirmOpen, setIsBatchDeleteConfirmOpen] = useState(false);
  const [isSafeDelete, setIsSafeDelete] = useState(true);

  const handleAddCustomSample = async () => {
    if (!newSampleText.trim()) return;
    const createdId = await createSample(newSampleText);
    if (createdId) {
      setNewSampleText("");
      setIsDialogOpen(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImportFile(file);
      setPrecheckResult(null);
      setIsPrechecking(true);
      try {
        console.log("开始处理Excel文件:", file.name, "大小:", file.size);
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { 
          type: "array",
          cellText: false,
          cellDates: false,
          cellNF: false,
          cellStyles: false
        });
        console.log("Excel工作表:", workbook.SheetNames);
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<{ 序号?: number; 语料: string }>(worksheet);
        console.log("解析到的数据行数:", jsonData.length);
        console.log("前几行数据:", jsonData.slice(0, 3));
        
        // 检查数据结构
        if (jsonData.length > 0) {
          const firstRow = jsonData[0];
          console.log("第一行数据的键:", Object.keys(firstRow));
          console.log("第一行数据:", firstRow);
        }
        
        const sampleTexts = jsonData.map(row => row.语料).filter(text => typeof text === 'string' && text.trim() !== '');
        console.log("有效语料数量:", sampleTexts.length);
        console.log("前几个语料:", sampleTexts.slice(0, 3));
        
        if (sampleTexts.length > 0) {
          console.log("开始预检查...");
          const result = await precheckSamples(sampleTexts);
          console.log("预检查结果:", result);
          setPrecheckResult(result);
        } else {
          console.log("没有找到有效的语料文本");
          setPrecheckResult({ new_texts: [], duplicate_texts: [] });
        }
              } catch (error) {
          console.error("File precheck failed:", error);
          // 显示错误信息给用户
          let errorMessage = "未知错误";
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else {
            errorMessage = String(error);
          }
          
          toast({
            variant: "destructive",
            title: "文件预处理失败",
            description: `处理Excel文件时发生错误: ${errorMessage}`,
          });
        } finally {
        setIsPrechecking(false);
      }
    }
  };

  const handleImportExcel = async () => {
    if (!importFile) return;
    const result = await importSamplesFromExcel(importFile);
    if (result) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setIsDialogOpen(false);
      setImportFile(null);
      setPrecheckResult(null);
    }
  };

  const columns: ColumnDef<TestSample>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => {
            table.toggleAllPageRowsSelected(!!value);
            const allRowIds = table.getCoreRowModel().rows.map((r) => r.original.id);
            setSelectedSampleIdsHook(!!value ? allRowIds : []);
          }}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedSampleIds.includes(row.original.id)}
          onCheckedChange={(value) => {
            row.toggleSelected(!!value);
            const currentId = row.original.id;
            setSelectedSampleIdsHook(
              !!value
                ? [...selectedSampleIds, currentId]
                : selectedSampleIds.filter((id) => id !== currentId)
            );
          }}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "id",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="p-0 hover:bg-transparent"
        >
          ID
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const id = row.getValue("id") as number;
        return <div className="text-left font-medium">#{id}</div>;
      },
    },
    {
      accessorKey: "text",
      header: "语音指令",
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return <div className="text-left font-medium">{status}</div>;
      },
    },
    {
      accessorKey: "result",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="p-0 hover:bg-transparent"
        >
          测试结果
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const result = row.getValue("result") as string;
        {
          return !result ? (
            <div className="justify-items-center">
              <CircleDot size={20} color="#ffc300" />
            </div>
          ) : result === "pass" ? (
            <div className="justify-items-center">
              <CircleCheck size={20} color="green" />
            </div>
          ) : (
            <div className="justify-items-center">
              <CircleX size={20} color="red" />
            </div>
          );
        }
      },
    },
    {
      id: "play",
      header: () => <div className="text-right w-full">播放</div>,
      cell: ({ row }) => {
        const sample = row.original;
        const handlePlay = () => {
          TauriAudioApiService.playMatchAudio(sample.text).catch(console.error);
        };

        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={(e) => {
                e.stopPropagation();
                handlePlay();
              }}
            >
              <Play className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right w-full">操作</div>,
      cell: ({ row }) => {
        const sample = row.original;

        return (
          <div className="flex items-center justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-8 h-8 p-0">
                  <span className="sr-only">打开菜单</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>操作</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    if (!selectedSampleIds.includes(sample.id)) {
                      setSelectedSampleIdsHook([...selectedSampleIds, sample.id]);
                    }
                  }}
                >
                  选择
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setSampleForDetail(sample);
                    setIsDetailDialogOpen(true);
                  }}
                >
                  详情
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setSampleToDelete(sample);
                    setIsDeleteConfirmOpen(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <Card className="flex flex-col flex-1 shadow-sm rounded-lg h-full max-h-full overflow-hidden">
      <CardHeader className="rounded-lg bg-background p-3 flex flex-col space-y-2 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">测试语料</h3>
          <div className="flex items-center gap-2">
            {selectedSampleIds.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsBatchDeleteConfirmOpen(true)}
                disabled={isLoading}
              >
                删除选中 ({selectedSampleIds.length})
              </Button>
            )}
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              添加自定义指令
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4 overflow-auto min-h-0 max-h-full">
        {isLoading && samples.length === 0 ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : samplesError ? (
          <div className="p-4 text-center text-destructive">
            <p>{samplesError}</p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={fetchAllSamples}
            >
              重试
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            initialPageSize={initialPageSize}
            data={samples || []}
            onRowClick={(row) => {
              const currentId = row.id as number;
              if (selectedSampleIds.includes(currentId)) {
                setSelectedSampleIdsHook(
                  selectedSampleIds.filter((id) => id !== currentId)
                );
              } else {
                setSelectedSampleIdsHook([...selectedSampleIds, currentId]);
              }
            }}
            filterPlaceholder="搜索语音指令..."
          />
        )}
      </CardContent>
      <Dialog open={isDialogOpen} onOpenChange={(isOpen) => {
        setIsDialogOpen(isOpen);
        if (!isOpen) {
          setImportFile(null);
          setPrecheckResult(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加自定义语音指令</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Input
                value={newSampleText}
                onChange={(e) => setNewSampleText(e.target.value)}
                placeholder="输入自定义指令..."
              />
              <Button
                onClick={handleAddCustomSample}
                disabled={!newSampleText.trim()}
                className="my-2"
              >
                确认添加
              </Button>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-2">
                或通过Excel导入
              </p>
              <div className="flex gap-2">
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  className="cursor-pointer"
                  disabled={isPrechecking}
                />
              </div>
              {isPrechecking && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-muted-foreground">正在预检查文件...</p>
                </div>
              )}
              {precheckResult && !isPrechecking && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">预检查结果</h4>
                  <p className="text-sm">
                    发现 <span className="font-bold text-green-600">{precheckResult.new_texts.length}</span> 条新语料。
                  </p>
                  <p className="text-sm">
                    发现 <span className="font-bold text-yellow-600">{precheckResult.duplicate_texts.length}</span> 条重复语料（将被忽略）。
                  </p>
                  <Button
                    onClick={handleImportExcel}
                    disabled={!importFile || precheckResult.new_texts.length === 0}
                    variant="default"
                    className="w-full mt-4"
                  >
                    {precheckResult.new_texts.length > 0 ? `确认导入 ${precheckResult.new_texts.length} 条新语料` : "没有可导入的新语料"}
                  </Button>
                </div>
              )}
              <div className="flex flex-row items-center mt-2">
                <p className="text-xs text-muted-foreground text-center">
                  请确保Excel文件包含"序号"和"语料"列
                </p>
                <Button variant={"link"} size={"sm"}>打开模版</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isDetailDialogOpen}
        onOpenChange={(isOpen) => {
          setIsDetailDialogOpen(isOpen);
          if (!isOpen) {
            setSampleForDetail(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>样本详情</DialogTitle>
          </DialogHeader>
          {sampleForDetail && (
            <div className="grid gap-4 py-4">
              <div>
                <h4 className="font-medium mb-1">ID:</h4>
                <p className="text-sm text-muted-foreground">
                  {sampleForDetail.id}
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">指令文本:</h4>
                <p className="text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded">
                  {sampleForDetail.text}
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">状态:</h4>
                <p className="text-sm text-muted-foreground">
                  {sampleForDetail.status || "N/A"}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除测试语料 "<strong>{sampleToDelete?.text}</strong>"
              (ID: {sampleToDelete?.id})吗?
              此操作无法撤销。如果此语料正被某些任务使用，安全删除可能会失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSampleToDelete(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (sampleToDelete) {
                  await deleteSampleHook(sampleToDelete.id, true);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isBatchDeleteConfirmOpen}
        onOpenChange={setIsBatchDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除选中的 <strong>{selectedSampleIds.length}</strong> 个测试语料吗？
              此操作无法撤销。
            </AlertDialogDescription>
            <div className="mt-2">
              <label className="flex items-center space-x-2">
                <Checkbox
                  checked={isSafeDelete}
                  onCheckedChange={(checked) => setIsSafeDelete(!!checked)}
                />
                <span className="text-sm">安全删除（跳过被任务使用的语料）</span>
              </label>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsBatchDeleteConfirmOpen(false)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteSamplesBatch(selectedSampleIds, isSafeDelete);
                setIsBatchDeleteConfirmOpen(false);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
