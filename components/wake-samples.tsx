"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { WakeWord } from "@/types/api";
import { useTauriWakewords } from "@/hooks/useTauriWakewords";
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
import { TauriAudioApiService } from "@/services/tauri-audio-api";

interface WakeSamplesProps {
  initialPageSize?: number;
}

export function WakeSamples({
  initialPageSize,
}: WakeSamplesProps = {}) {
  const {
    wakewords,
    selectedWakewordIds,
    isLoading,
    error: samplesError,
    fetchAllWakewords,
    createWakeword,
    deleteWakeword: deleteWakewordHook,
    setSelectedWakewordIds: setSelectedWakewordIdsHook,
    importWakewordsFromExcel,
  } = useTauriWakewords();

  const [newSampleText, setNewSampleText] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [sampleForDetail, setSampleForDetail] = useState<WakeWord | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [sampleToDelete, setSampleToDelete] = useState<WakeWord | null>(null);

  const handleAddCustomSample = async () => {
    if (!newSampleText.trim()) return;
    const createdId = await createWakeword(newSampleText);
    if (createdId) {
      setNewSampleText("");
      setIsDialogOpen(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
    }
  };

  const handleImportExcel = async () => {
    if (!importFile) return;
    const result = await importWakewordsFromExcel(importFile);
    if (result) {
      setImportFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setIsDialogOpen(false);
    }
  };

  const columns: ColumnDef<WakeWord>[] = [
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
            const allRowIds = table
              .getCoreRowModel()
              .rows.map((r) => r.original.id);
            setSelectedWakewordIdsHook(!!value ? allRowIds : []);
          }}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedWakewordIds.includes(row.original.id)}
          onCheckedChange={(value) => {
            row.toggleSelected(!!value);
            const currentId = row.original.id;
            setSelectedWakewordIdsHook(
              !!value
                ? [...selectedWakewordIds, currentId]
                : selectedWakewordIds.filter((id) => id !== currentId)
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
      header: "唤醒词",
    },
    {
      id: "play",
      header: () => <div className="text-right w-full">播放</div>,
      cell: ({ row }) => {
        const sample = row.original;
        const handlePlay = () => {
          TauriAudioApiService.playMatchAudioWithurl(sample.text, "/Volumes/应用/LLM Analysis Interface/public/audio/wakeword").catch(console.error);
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
                    if (!selectedWakewordIds.includes(sample.id)) {
                      setSelectedWakewordIdsHook([
                        ...selectedWakewordIds,
                        sample.id,
                      ]);
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
          <h3 className="font-semibold text-foreground">唤醒词语料</h3>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            添加自定义唤醒词
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4 overflow-auto">
        {isLoading && wakewords.length === 0 ? (
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
              onClick={fetchAllWakewords}
            >
              重试
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            initialPageSize={initialPageSize}
            data={wakewords || []}
            onRowClick={(row) => {
              const currentId = row.id as number;
              if (selectedWakewordIds.includes(currentId)) {
                setSelectedWakewordIdsHook(
                  selectedWakewordIds.filter((id) => id !== currentId)
                );
              } else {
                setSelectedWakewordIdsHook([...selectedWakewordIds, currentId]);
              }
            }}
            filterPlaceholder="搜索唤醒词..."
          />
        )}
      </CardContent>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加自定义唤醒词</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Input
                value={newSampleText}
                onChange={(e) => setNewSampleText(e.target.value)}
                placeholder="输入自定义唤醒词..."
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
              <div className="flex flex-row items-center">
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
            <DialogTitle>唤醒词详情</DialogTitle>
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
                <h4 className="font-medium mb-1">唤醒词文本:</h4>
                <p className="text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded">
                  {sampleForDetail.text}
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
              您确定要删除唤醒词 "<strong>{sampleToDelete?.text}</strong>"
              (ID: {sampleToDelete?.id})吗?
              此操作无法撤销。如果此唤醒词正被某些任务使用，安全删除可能会失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSampleToDelete(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (sampleToDelete) {
                  await deleteWakewordHook(sampleToDelete.id, true);
                  setSampleToDelete(null);
                }
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
