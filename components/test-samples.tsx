"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { TestSample } from "@/types/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectAllSamples,
  selectSelectedSampleIds,
  selectSamplesStatus,
  setSelectedSamples,
  setSamples,
  fetchSamples,
} from "@/store/samplesSlice";
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
import { useAudioPlayer } from "@/hooks/useAudioPlayer";

interface TestSamplesProps {
  initialPageSize?: number;
  onDeleteSample?: (id: number) => void;
}

export function TestSamples({
  initialPageSize,
  onDeleteSample,
}: TestSamplesProps = {}) {
  const samples = useAppSelector(selectAllSamples);
  const selectedSample = useAppSelector(selectSelectedSampleIds);
  const dispatch = useAppDispatch();
  const [newSampleText, setNewSampleText] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { playMatchedAudio } = useAudioPlayer();
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const handleAddCustomSample = () => {
    if (!newSampleText.trim()) return;

    const newSample: TestSample = {
      id: -Date.now(), // 使用负时间戳确保唯一
      text: newSampleText,
    };

    dispatch(setSamples([...samples, newSample]));
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
        const jsonData = XLSX.utils.sheet_to_json<{
          序号: number;
          语料: string;
        }>(firstSheet);

        if (jsonData.length > 0) {
          const newSamples = jsonData.map((row) => ({
            id: -Date.now() - row.序号,
            text: row.语料,
          }));

          dispatch(setSamples([...samples, ...newSamples]));
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

  const samplesStatus = useAppSelector(selectSamplesStatus);

  useEffect(() => {
    if (samples.length === 0 && samplesStatus !== "loading") {
      dispatch(fetchSamples());
    }
    setLoading(false);
  }, [dispatch, samples.length, samplesStatus]);

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
      accessorKey: "id",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="p-0 hover:bg-transparent"
          >
            ID
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
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
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="p-0 hover:bg-transparent"
          >
            测试结果
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
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
          playMatchedAudio(sample.text).catch(console.error);
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
                  onClick={() =>
                    dispatch(setSelectedSamples([...selectedSample, sample.id]))
                  }
                >
                  选择
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e)=> {
                  e.stopPropagation();
                  setIsDetailDialogOpen(true)}}>详情</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      confirm("确定要删除这条测试语料吗？") &&
                      onDeleteSample
                    ) {
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
      <CardHeader className="rounded-lg bg-background p-3 flex flex-col space-y-2 border-b">
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
                dispatch(fetchSamples()).catch(() => setError("重试失败"))
              }
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
              // 如果行已经被选中，则取消选择；否则添加到选择中
              if (selectedSample.includes(row.id)) {
                dispatch(
                  setSelectedSamples(
                    selectedSample.filter((id) => id !== row.id)
                  )
                );
              } else {
                dispatch(setSelectedSamples([...selectedSample, row.id]));
              }
            }}
            selectedRowId={selectedSample}
            filterPlaceholder="搜索语音指令..."
            onSelectRows={(selectedRows) => {
              // Extract IDs from selected rows and update the selection state
              const selectedIds = selectedRows.map((row) => row.id as number);
              dispatch(setSelectedSamples(selectedIds));
            }}
          />
        )}
      </CardContent>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="flex mx-4 mb-4 gap-1">
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
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>详情</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
