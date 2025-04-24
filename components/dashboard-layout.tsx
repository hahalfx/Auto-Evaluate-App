"use client";

import React from "react";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FileText,
  History,
  Home,
  Menu,
  Settings,
  X,
  Search,
  Bell,
  Calendar,
  PlaySquare,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  ChartColumnBig,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
//import { ModeToggle } from "@/components/ui/mode-toggle"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { ReactNode } from "react";
import Image from "next/image";

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
    title: "测试任务执行",
    href: "/llm-analysis",
    icon: <PlaySquare className="h-5 w-5" />,
  },
  {
    title: "测试语料管理",
    href: "/casemanage",
    icon: <ChartColumnBig className="h-5 w-5" />,
  },
  {
    title: "详细报告",
    href: "/reports",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    title: "历史数据",
    href: "/history",
    icon: <History className="h-5 w-5" />,
  },
  {
    title: "日程安排",
    href: "/schedule",
    icon: <Calendar className="h-5 w-5" />,
  },
  {
    title: "设置",
    href: "/settings",
    icon: <Settings className="h-5 w-5" />,
  },
];

// 路径到面包屑的映射
const pathToBreadcrumb: Record<string, { title: string; parent?: string }> = {
  "/": { title: "仪表盘" },
  "/taskmanage": { title: "测试任务管理", parent: "/" },
  "/llm-analysis": { title: "测试任务执行", parent: "/" },
  "/casemanage": { title: "测试语料管理", parent: "/" },
  "/reports": { title: "详细报告", parent: "/" },
  "/history": { title: "历史数据", parent: "/" },
  "/schedule": { title: "日程安排", parent: "/" },
  "/settings": { title: "设置", parent: "/" },
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [showSearchInput, setShowSearchInput] = useState(false);

  // 在客户端渲染后再显示主题切换按钮，避免水合不匹配
  useEffect(() => {
    setMounted(true);
  }, []);

  // 生成面包屑导航项
  const generateBreadcrumbs = () => {
    const breadcrumbs = [];
    let currentPath = pathname;

    while (currentPath && pathToBreadcrumb[currentPath]) {
      breadcrumbs.unshift({
        path: currentPath,
        title: pathToBreadcrumb[currentPath].title,
      });
      currentPath = pathToBreadcrumb[currentPath].parent || "";
    }

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background to-muted/30 ">
      <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 pr-0">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Link
                  href="/"
                  className="flex items-center gap-2 font-semibold"
                >
                  <BarChart3 className="h-6 w-6" />
                  <span>语音自动化验证工具</span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-5 w-5" />
                  <span className="sr-only">关闭</span>
                </Button>
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
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
              <nav className="grid gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "group flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                      pathname === item.href
                        ? "bg-accent text-accent-foreground"
                        : "transparent"
                    )}
                  >
                    {item.icon}
                    {item.title}
                    {item.badge && (
                      <Badge
                        variant="outline"
                        className="ml-auto bg-primary/10 text-primary"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                ))}
              </nav>
            </div>
          </SheetContent>
        </Sheet>
        <div className="h-10 relative items-center justify-center">
          <Image
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WechatIMG141.jpg-5GyOuwpCpXccaTWId1io6GfGROhdlY.png"
            alt="CNTARC Logo"
            width={155}
            height={25}
            className="object-contain itmes-center"
          />
          <Link href="/" className="flex justify-center gap-2 font-semibold">
            <span className="hidden md:inline-block">语音自动化验证工具</span>
          </Link>
        </div>

        {/* 面包屑导航 */}
        <div className="hidden md:flex ml-4">
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.path}>
                  {index < breadcrumbs.length - 1 ? (
                    <BreadcrumbItem>
                      <BreadcrumbLink href={crumb.path}>
                        {crumb.title}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  ) : (
                    <BreadcrumbItem>
                      <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                    </BreadcrumbItem>
                  )}
                  {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="relative ml-auto flex items-center gap-2">
          {showSearchInput ? (
            <div className="absolute right-0 top-0 flex items-center">
              <Input
                type="search"
                placeholder="搜索..."
                className="w-[200px] md:w-[300px] pr-8"
                autoFocus
                onBlur={() => setShowSearchInput(false)}
              />
              <X
                className="absolute right-2 h-4 w-4 cursor-pointer text-muted-foreground"
                onClick={() => setShowSearchInput(false)}
              />
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSearchInput(true)}
            >
              <Search className="h-5 w-5" />
              <span className="sr-only">搜索</span>
            </Button>
          )}

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="sr-only">通知</span>
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary"></span>
          </Button>

          {/* {mounted && <ModeToggle />} */}

          <Avatar className="h-8 w-8">
            <AvatarImage
              src="/placeholder.svg?height=32&width=32"
              alt="用户头像"
            />
            <AvatarFallback>用户</AvatarFallback>
          </Avatar>
        </div>
      </header>
      <div className="flex flex-1 relative">
        {/* 固定侧边栏 */}
        <aside
          className={cn(
            "hidden md:flex flex-col border-r bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300 ease-in-out fixed h-[calc(100vh-4rem)] z-30",
            sidebarCollapsed ? "w-[70px]" : "w-64"
          )}
        >
          <div className="flex h-full flex-col gap-2 p-4 overflow-y-auto">
            <nav className="grid gap-1 py-2">
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
                      <span>{item.title}</span>
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
            </nav>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm mt-auto">
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
            )}
          </div>
          {/* 折叠/展开按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-[calc(100%-12px)] top-[72px] h-8 w-8 rounded-lg border bg-background shadow-md"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
            <span className="sr-only">
              {sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
            </span>
          </Button>
        </aside>
        {/* 主内容区域，添加左边距以避免被固定侧边栏遮挡 */}
        <main
          className={cn(
            "flex-1 overflow-auto",
            "md:ml-[70px]",
            !sidebarCollapsed && "md:ml-64"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
