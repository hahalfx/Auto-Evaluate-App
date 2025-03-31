"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { TestSample } from "@/types/api";
import { fetchTestSamples } from "@/services/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal, Plus } from "lucide-react";
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
}

export function TestSamples({
  samples,
  onSamples,
  selectedSample,
  onSelectSample,
}: TestSamplesProps) {
  const [newSampleText, setNewSampleText] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    setLoading(false);
  }, []);

  // useEffect(() => {
  //   async function loadSamples() {
  //     try {
  //       setLoading(true)
  //       const data = await fetchTestSamples()
  //       setSamples(data)
  //       setError(null)
  //     } catch (err) {
  //       setError("加载测试语料失败")
  //       console.error(err)
  //     } finally {
  //       setLoading(false)
  //     }
  //   }

  //   loadSamples()
  // }, [])

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
          <div className="font-medium">
            {isSelected ? (
              <span className="text-primary">已选择</span>
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
        return <div className="text-right font-medium">#{id}</div>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const sample = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
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
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <Card className="flex flex-col flex-1 shadow-sm rounded-lg h-dvh">
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
              >
                确认添加
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
