"use client";

import React from "react";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  History,
  Home,
  Settings,
  Calendar,
  PlaySquare,
  ListTodo,
  ChartColumnBig,
  Plus,
  MenuIcon,
  TestTube,
  Fullscreen,
} from "lucide-react";
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import Image from "next/image";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Label } from "./ui/label";
import { useActiveTasks } from "@/lib/contexts/active-tasks-context";

interface NavItem {
  title: string;
  href: string;
  icon: ReactNode;
  badge?: string | number;
}

const navItems: NavItem[] = [
  {
    title: "仪表盘",
    href: "/",
    icon: <Home className="h-5 w-5" />,
  },
  {
    title: "测试任务管理",
    href: "/taskmanage",
    icon: <ListTodo className="h-5 w-5" />,
  },
  {
    title: "唤醒+反馈+交互工作流",
    href: "/llm-analysis",
    icon: <PlaySquare className="h-5 w-5" />,
  },
  {
    title: "唤醒检测工作流",
    href: "/wake-detection-workflow",
    icon: <Fullscreen className="h-5 w-5" />,
  },
  {
    title: "测试语料管理",
    href: "/casemanage",
    icon: <ChartColumnBig className="h-5 w-5" />,
  },
  {
    title: "视觉唤醒检测测试（Test）",
    href: "/wake-detection",
    icon: <TestTube className="h-5 w-5" />,
  },
  {
    title: "Tauri后端测试（Test）",
    href: "/tauri-test",
    icon: <TestTube className="h-5 w-5" />,
  },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const { activeTasks, removeActiveTask } = useActiveTasks();

  // 在客户端渲染后再显示主题切换按钮，避免水合不匹配
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="max-h-screen flex flex-row bg-gray-100">
      {/* 固定侧边栏 */}
      <aside
        className={cn(
          "flex flex-col bg-gray-100 transition-all duration-300 ease-in-out h-screen z-30",
          sidebarCollapsed ? "w-[60px]" : "w-60"
        )}
      >
        <div className="flex h-full flex-col gap-2 p-3 overflow-y-auto transition-all duration-300 ease-in-out">
          {!sidebarCollapsed ? (
            <div className="flex flex-row justify-between items-center">
              <div className="h-10 items-center justify-center transition">
                <Image
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WechatIMG141.jpg-5GyOuwpCpXccaTWId1io6GfGROhdlY.png"
                  alt="CNTARC Logo"
                  width={155}
                  height={25}
                  className="object-contain items-center"
                />
                <Link
                  href="/"
                  className="flex justify-center gap-2 font-semibold"
                >
                  <span className="text-nowrap hidden md:inline-block">
                    语音自动化验证工具
                  </span>
                </Link>
              </div>
              {/* 折叠/展开按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-gray-50"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              >
                <MenuIcon className="h-4 w-4" />

                <span className="sr-only">
                  {sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
                </span>
              </Button>
            </div>
          ) : (
            <div className="items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-gray-50"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              >
                <MenuIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
          <nav className="grid gap-1 py-2">

            <div className={cn(
              "text-xs font-semibold text-muted-foreground",
              sidebarCollapsed ? "text-center" : "px-3")}>
              目录
            </div>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  pathname === item.href
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground",
                  sidebarCollapsed && "justify-center px-0"
                )}
                title={sidebarCollapsed ? item.title : undefined}
              >
                {item.icon}
                {!sidebarCollapsed && (
                  <>
                    <span className="text-nowrap">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant="outline"
                        className="ml-auto bg-primary/10 text-primary"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </Link>
            ))}

            {/* 活跃任务标签
            {activeTasks.length > 0 && !sidebarCollapsed && (
              <div className="mt-4 space-y-1">
                <div className="px-3 text-xs font-semibold text-muted-foreground">
                  活跃测试任务
                </div>
                {activeTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/llm-analysis/${task.id}`}
                    className={cn(
                      "group flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-white hover:text-accent-foreground",
                      pathname === `/llm-analysis`
                        ? "bg-white text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <PlaySquare className="h-4 w-4" />
                      <span className="truncate max-w-[150px]">
                        {task.name}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeActiveTask(task.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">关闭任务</span>
                    </Button>
                  </Link>
                ))}
              </div>
            )} */}

            {/* 折叠状态下的活跃任务标签
            {activeTasks.length > 0 && sidebarCollapsed && (
              <div className="mt-4 space-y-1">
                <div className="px-0 text-xs font-semibold text-center text-muted-foreground">
                  任务
                </div>
                {activeTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/llm-analysis/${task.id}`}
                    className={cn(
                      "flex justify-center rounded-md py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                      pathname === `/llm-analysis/${task.id}`
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                    title={task.name}
                  >
                    <PlaySquare className="h-5 w-5" />
                  </Link>
                ))}
              </div>
            )} */}
          </nav>
          {!sidebarCollapsed ? (
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex flex-row items-center gap-2 rounded-lg bg-card px-2 py-2 text-sm mt-auto hover:bg-slate-50 transition-all duration-300 ease-in-out cursor-pointer">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src="/placeholder.svg?height=32&width=32"
                      alt="用户头像"
                    />
                    <AvatarFallback>用户</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium">测试工程师</span>
                    <span className="text-xs text-muted-foreground">
                      engineer@example.com
                    </span>
                  </div>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-43" side="top">
                <div className="grid grid-cols-3 items-center">
                  <Label htmlFor="settings"><Settings size={15} className="rounded-md" /></Label>
                  <Link href={"/settings"}>
                    <span className="text-sm">应用设置</span>
                  </Link>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex flex-row items-center gap-2 rounded-lg bg-card px-2 py-2 text-sm mt-auto">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src="/placeholder.svg?height=32&width=32"
                  alt="用户头像"
                />
                <AvatarFallback>用户</AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      </aside>
      {/* 主内容区域，添加左边距以避免被固定侧边栏遮挡 */}
      <main
        className={
          "flex flex-1 transition-all duration-300 ease-in-out py-3 pr-3 "
        }
      >
        <div className="w-full overflow-y-auto border rounded-xl">
          {children}
        </div>
      </main>
    </div>
  );
}
