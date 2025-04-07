import { Calendar, Home, Inbox, Search, Settings, Brain } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import Image from "next/image";

// Menu items.
const items = [
  {
    title: "主页",
    url: "/",
    icon: Home,
  },
  {
    title: "语音交互大模型测试",
    url: "/llm-analysis",
    icon: Brain,
  },
  {
    title: "应用设置",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="bg-sidebar-background p-2 flex items-center justify-center shadow-sm">
        <div className="flex flex-col items-center space-x-3 justify-center">
          <div className="h-8 relative">
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WechatIMG141.jpg-5GyOuwpCpXccaTWId1io6GfGROhdlY.png"
              alt="CNTARC Logo"
              width={155}
              height={25}
              className="object-contain justify-center"
            />
          </div>
          <h1 className="text-xl font-bold tracking-wide text-primary drop-shadow-sm justify-center">
            语音自动化验证工具
          </h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>应用</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton  asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
