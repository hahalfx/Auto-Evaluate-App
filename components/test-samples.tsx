"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { TestSample } from "@/types/api";
import { useTauriSamples } from "@/hooks/useTauriSamples"; // New hook
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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

interface TestSamplesProps {
  initialPageSize?: number;
  onDeleteSample?: (id: number) => void;
}

export function TestSamples({
  initialPageSize,
  onDeleteSample, // This prop might need to be re-evaluated or removed if delete is handled by the hook directly
}: TestSamplesProps = {}) {
  const {
    samples,
    selectedSampleIds,
    isLoading, // Renamed from loading to avoid conflict with local loading if any
    error: samplesError, // Renamed to avoid conflict
    fetchAllSamples,
    createSample,
    // createSamplesBatch, // Used by importSamplesFromExcel
    deleteSample: deleteSampleHook, // Renamed to avoid conflict
    setSelectedSampleIds: setSelectedSampleIdsHook, // Renamed
    importSamplesFromExcel,
  } = useTauriSamples();
  // const dispatch = useAppDispatch(); // May not be needed if all sample logic moves to hook
  const [newSampleText, setNewSampleText] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // const [loading, setLoading] = useState(true); // Replaced by isLoading from hook
  // const [error, setError] = useState<string | null>(null); // Replaced by samplesError from hook
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { playMatchedAudio } = useAudioPlayer();
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [sampleForDetail, setSampleForDetail] = useState<TestSample | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [sampleToDelete, setSampleToDelete] = useState<TestSample | null>(null);

  const handleAddCustomSample = async () => {
    if (!newSampleText.trim()) return;
    const createdId = await createSample(newSampleText);
    if (createdId) {
      setNewSampleText("");
      setIsDialogOpen(false);
      // fetchAllSamples(); // createSample in hook already calls fetchAllSamples
    }
    // Error handling is done within the hook via toast
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]); // Keep local state for the file object
    }
  };

  const handleImportExcel = async () => {
    if (!importFile) return;
    const result = await importSamplesFromExcel(importFile);
    if (result) {
      // Successfully imported, toast is handled by hook
      setImportFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setIsDialogOpen(false);
    }
    // Error handling is done within the hook via toast
  };

  // const samplesStatus = useAppSelector(selectSamplesStatus); // Removed

  // useEffect(() => { // This is handled by the useTauriSamples hook's own useEffect
  //   fetchAllSamples();
  // }, [fetchAllSamples]);

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
            const allRowIds = table.getCoreRowModel().rows.map(r => r.original.id);
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
                : selectedSampleIds.filter(id => id !== currentId)
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
                  onClick={() => {
                    if (!selectedSampleIds.includes(sample.id)) {
                      setSelectedSampleIdsHook([...selectedSampleIds, sample.id]);
                    }
                  }}
                >
                  选择
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e)=> {
                  e.stopPropagation();
                  setSampleForDetail(sample); // Set the sample for detail view
                  setIsDetailDialogOpen(true);
                  }}>详情</DropdownMenuItem>
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
    <Card className="flex flex-col flex-1 shadow-sm rounded-lg h-full">
      <CardHeader className="rounded-lg bg-background p-3 flex flex-col space-y-2 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">测试语料</h3>
          <Badge variant="outline" className="bg-muted">
            {isLoading ? "加载中..." : `${samples.length} 条记录`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4 overflow-auto">
        {isLoading && samples.length === 0 ? ( // Show skeleton only on initial load
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
              onClick={fetchAllSamples} // Retry fetching
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
            // selectedRowId prop might need adjustment based on DataTable's API if it expects a single ID
            // For multiple selections, DataTable's internal state or rowSelection prop is usually used.
            // The Checkbox in columns now directly updates selectedSampleIdsHook.
            // The DataTable component itself will need to be configured to use an external row selection state
            // if we want to control it fully from selectedSampleIds.
            // For now, removing these props as they are causing TS errors and selection is handled by checkboxes.
            // rowSelection={ 
            //   samples.reduce((acc, sample) => {
            //     acc[sample.id.toString()] = selectedSampleIds.includes(sample.id);
            //     return acc;
            //   }, {} as Record<string, boolean>)
            // }
            // setRowSelection={(updater: any) => { // Added 'any' to temporarily resolve TS error, but this needs proper typing or removal
            //     // This logic needs to be robust if DataTable provides functional updater
            // }}
            filterPlaceholder="搜索语音指令..."
            // onSelectRows prop might be part of a custom DataTable or an older version.
            // Standard TanStack Table uses `onRowSelectionChange` or direct state management.
            // For now, individual checkbox clicks and toggleAllPageRowsSelected handle selection.
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
      <Dialog open={isDetailDialogOpen} onOpenChange={(isOpen) => {
        setIsDetailDialogOpen(isOpen);
        if (!isOpen) {
          setSampleForDetail(null); // Clear sample when dialog closes
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>样本详情</DialogTitle>
          </DialogHeader>
          {sampleForDetail && (
            <div className="grid gap-4 py-4">
              <div>
                <h4 className="font-medium mb-1">ID:</h4>
                <p className="text-sm text-muted-foreground">{sampleForDetail.id}</p>
              </div>
              <div>
                <h4 className="font-medium mb-1">指令文本:</h4>
                <p className="text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded">
                  {sampleForDetail.text}
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">状态:</h4>
                <p className="text-sm text-muted-foreground">{sampleForDetail.status || "N/A"}</p>
              </div>
              {/* Add more details as needed, e.g., associated tasks, creation date */}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除测试语料 "<strong>{sampleToDelete?.text}</strong>" (ID: {sampleToDelete?.id})吗?
              此操作无法撤销。如果此语料正被某些任务使用，安全删除可能会失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSampleToDelete(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (sampleToDelete) {
                  await deleteSampleHook(sampleToDelete.id, true); // Using safe delete
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
