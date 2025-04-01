"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { TestSample } from "@/types/api";
import { fetchTestSamples } from "@/services/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal, Plus, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

interface TestSamplesProps {
  samples: TestSample[];
  onSamples: (samples: TestSample[]) => void;
  selectedSample: number;
  onSelectSample: (id: number) => void;
  onDeleteSample: (id: number) => void;
}

export function TestSamples({
  samples,
  onSamples,
  selectedSample,
  onSelectSample,
  onDeleteSample,
}: TestSamplesProps) {
  const [newSampleText, setNewSampleText] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 动态获取音频文件列表
    fetch('/api/audio-files')
      .then(res => res.json())
      .then(data => setAudioFiles(data.files))
      .catch(err => console.error('获取音频文件失败:', err));
  }, []);

  const handleAddCustomSample = () => {
    if (!newSampleText.trim()) return;

    const newSample: TestSample = {
      id: -Date.now(), // 使用负时间戳确保唯一
      text: newSampleText,
      status: "未选择",
    };

    onSamples([...samples, newSample]);
    setNewSampleText("");
    setIsDialogOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
    }
  };

  const handleImportExcel = () => {
    if (!importFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<{序号: number; 语料: string}>(firstSheet);

        if (jsonData.length > 0) {
          const newSamples = jsonData.map((row) => ({
            id: -Date.now() - row.序号,
            text: row.语料,
            status: "未选择",
          }));

          onSamples([...samples, ...newSamples]);
          setImportFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
        setIsDialogOpen(false);
      } catch (error) {
        setError("Excel文件解析失败");
      }
    };
    reader.readAsArrayBuffer(importFile);
  };

  useEffect(() => {
    setLoading(false);
  }, []);

  const columns: ColumnDef<TestSample>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const id = row.original.id;
        const isSelected = id === selectedSample;

        return (
          <div className="justify-start font-medium">
            {isSelected ? (
              <span className="text-green-600">已选择</span>
            ) : (
              <span className="text-muted-foreground">未选择</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "text",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="p-0 hover:bg-transparent"
          >
            语音指令
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
    },
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => {
        const id = row.getValue("id") as number;
        return <div className="text-left font-medium">#{id}</div>;
      },
    },
    {
      id: "play",
      header: () => <div className="text-right w-full">播放</div>,
      cell: ({ row }) => {
        const sample = row.original;
        const handlePlay = () => {
          // 找到包含语料内容的文件名（忽略前面的数字）
          const matchedFile = audioFiles.find(file => 
            file.includes(sample.text) && /^\d+/.test(file)
          );
          
          if (matchedFile) {
            const audio = new Audio(`/audio/${matchedFile}`);
            audio.play().catch(e => console.error("播放失败:", e));
          } else {
            console.warn(`未找到匹配的音频文件: ${sample.text}`);
          }
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
                <DropdownMenuItem onClick={() => onSelectSample(sample.id)}>
                  选择
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>查看详情</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('确定要删除这条测试语料吗？')) {
                      onDeleteSample(sample.id);
                    }
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
    <Card className="flex flex-col flex-1 shadow-sm rounded-lg h-full">
      <CardHeader className="bg-background p-3 flex flex-col space-y-2 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">测试语料</h3>
          <Badge variant="outline" className="bg-muted">
            {loading ? "加载中..." : `${samples.length} 条记录`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="p-4 text-center text-destructive">
            <p>{error}</p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() =>
                fetchTestSamples()
                  .then(onSamples)
                  .catch(() => setError("重试失败"))
              }
            >
              重试
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={samples || []}
            onRowClick={(row) => onSelectSample(row.id)}
            selectedRowId={selectedSample}
            filterPlaceholder="搜索语音指令..."
          />
        )}
      </CardContent>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="flex mx-4 mb-2 gap-1">
            <Plus className="h-4 w-4" />
            添加自定义指令
          </Button>
        </DialogTrigger>
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
              <p className="text-sm text-muted-foreground mb-2">或通过Excel导入</p>
              <div className="flex gap-2">
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  className="cursor-pointer"
                />
                <Button
                  onClick={handleImportExcel}
                  disabled={!importFile}
                  variant="outline"
                >
                  导入Excel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                请确保Excel文件包含"序号"和"语料"列
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
