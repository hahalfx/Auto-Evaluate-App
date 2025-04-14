import {
  setCurrentTask,
  deleteTaskAsync,
  selectCurrentTask,
  selectAllTasks,
  selectTasksStatus,
  fetchTasks,
} from "@/store/taskSlice";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Filter,
  ArrowUpDown,
  Loader2,
  Ellipsis,
  Check,
  BadgeCheck,
  CircleCheckBig,
  Circle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import Link from "next/link";

// 定义排序类型
type SortType =
  | "id-asc"
  | "id-desc"
  | "time-asc"
  | "time-desc";
// 定义筛选类型
type FilterType = "all" | "in_progress" | "pending";

export default function TaskList() {
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [sortType, setSortType] = useState<SortType>("id-desc");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(selectAllTasks);
  const currentTask = useAppSelector(selectCurrentTask);
  const tasksStatus = useAppSelector(selectTasksStatus);

  // 获取任务数据
  useEffect(() => {
    if (tasksStatus === "idle") {
      dispatch(fetchTasks());
    }
  }, [dispatch, tasksStatus]);

  // 处理排序
  const handleSort = (type: SortType) => {
    setSortType(type);
  };

  // 处理筛选
  const handleFilter = (type: FilterType) => {
    setFilterType(type);
  };

  // 计算统计数据
  const stats = {
    totalVerifications: Array.isArray(tasks) ? tasks.length : 0,
    successRate:
      Array.isArray(tasks) && tasks.length > 0
        ? Math.round(
            (tasks.filter((task) => task.task_status === "completed").length /
              tasks.length) *
              100
          )
        : 0,
    averageSimilarity: 76, // 这个可以根据实际数据计算
  };

  // 处理筛选和排序
  const getFilteredAndSortedTasks = () => {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return [];
    }

    // 首先进行筛选
    let filteredTasks = [...tasks];
    filterType === "all"
      ? (filteredTasks = filteredTasks.filter(
          (task) =>
            task.task_status === "in_progress" || task.task_status === "pending"
        ))
      : (filteredTasks = filteredTasks.filter(
          (task) => task.task_status === filterType
        ));

    // 将筛选后的任务映射为显示所需的格式
    const mappedTasks = filteredTasks.map((task) => ({
      id: task.id,
      name: task.name,
      similarity: Math.round(Math.random() * 30 + 70), // 示例数据，实际应该从task中计算
      status: task.task_status,
      timestamp: task.created_at, // 示例时间戳，实际应该从task中获取
    }));

    // 然后进行排序
    return mappedTasks.sort((a, b) => {
      switch (sortType) {
        case "id-asc":
          return a.id - b.id;
        case "id-desc":
          return b.id - a.id;
        case "time-asc":
          return (
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        case "time-desc":
          return (
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        default:
          return b.id - a.id;
      }
    });
  };

  // 获取筛选和排序后的任务列表
  const filteredAndSortedTasks = getFilteredAndSortedTasks();
  return (
    <Card className="h-auto">
      <CardHeader className="flex flex-row items-center justify-between px-6 py-4">
        <CardTitle>最近验证任务</CardTitle>
        <div className="flex space-x-2">
          {/* 筛选下拉菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center">
                <Filter className="h-4 w-4 mr-1" />
                筛选
                {filterType !== "all" && (
                  <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5">
                    {filteredAndSortedTasks.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>按状态筛选</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleFilter("all")}>
                全部
                {filterType === "all" && " ✓"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilter("in_progress")}>
                进行中
                {filterType === "in_progress" && " ✓"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilter("pending")}>
                待处理
                {filterType === "pending" && " ✓"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 排序下拉菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center">
                <ArrowUpDown className="h-4 w-4 mr-1" />
                排序
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>排序方式</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleSort("id-desc")}>
                ID (降序)
                {sortType === "id-desc" && " ✓"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSort("id-asc")}>
                ID (升序)
                {sortType === "id-asc" && " ✓"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleSort("time-desc")}>
                时间 (最新优先)
                {sortType === "time-desc" && " ✓"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSort("time-asc")}>
                时间 (最早优先)
                {sortType === "time-asc" && " ✓"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link href="/taskmanage/create-task">
            <Button size="sm">创建新任务</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {tasksStatus === "loading" ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">加载任务中...</span>
          </div>
        ) : !Array.isArray(tasks) || !tasks || tasks.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">暂无任务数据</p>
            <Link href="/taskmanage/create-task">
              <Button>创建第一个任务</Button>
            </Link>
          </div>
        ) : (
          <div>
            <div className="mb-1 flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                {filterType !== "all"
                  ? `显示 ${filteredAndSortedTasks.length} 个${
                      filterType === "in_progress" ? "进行中" : "待处理"
                    }任务`
                  : `共 ${filteredAndSortedTasks.length} 个任务`}
              </p>
              {filterType !== "all" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterType("all")}
                  className="text-xs"
                >
                  清除筛选
                </Button>
              )}
            </div>

            {filteredAndSortedTasks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">没有符合条件的任务</p>
                <Button onClick={() => setFilterType("all")}>
                  显示所有任务
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAndSortedTasks.map((result) => (
                  <div
                    key={result.id}
                    className={
                      "flex h-24 items-center justify-between p-5 border rounded-xl hover:bg-accent cursor-pointer " +
                      (result.id === currentTask?.id ? "bg-accent" : "bg-white")
                    }
                    onClick={() => {
                      const task = tasks.find((t) => t.id === result.id);
                      if (task) {
                        dispatch(setCurrentTask(task));
                      }
                      if (currentTask?.id === result.id) {
                        dispatch(setCurrentTask(null));
                      }
                    }}
                  >
                    <div className="flex items-center space-x-4">
                      {currentTask?.id === result.id ? (
                        <CircleCheckBig size={18} color="green" />
                      ) : (
                        <Circle size={18} />
                      )}
                      <div>
                        <p className="font-medium">
                          {result.name || "任务#" + result.id}
                        </p>
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
                          result.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : result.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : result.status === "in_progress"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {result.status === "completed"
                          ? "完成"
                          : result.status === "failed"
                          ? "失败"
                          : result.status === "in_progress"
                          ? "进行中"
                          : "暂停"}
                      </div>
                      <div>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="rounded-lg justify-items-center hover:bg-gray-100">
                            <Ellipsis className="p-1" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuLabel>操作</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>查看详情</DropdownMenuItem>
                            <DropdownMenuItem>编辑任务</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                dispatch(deleteTaskAsync(result.id));
                              }}
                            >
                              删除任务
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
