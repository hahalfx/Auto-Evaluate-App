"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function NavTabs() {
  const navItems = [
    { id: 1, name: "语意泛化" },
    { id: 2, name: "自动分析" },
    { id: 3, name: "解读设置" },
    { id: 4, name: "模型调整" },
    { id: 5, name: "语音识别" },
    { id: 6, name: "采集训练" },
  ]

  return (
    <div className="bg-background py-1 px-4 flex border-b justify-between">
      <Tabs defaultValue="2" className="w-full">
        <TabsList className="bg-transparent h-auto p-0 flex justify-between">
          <div className="flex">
            {navItems.slice(0, 3).map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id.toString()}
                className="px-5 py-1.5 mx-1 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none text-muted-foreground hover:text-primary hover:bg-primary/5 border-0"
                data-state={item.id === 2 ? "active" : "inactive"}
              >
                {item.name}
              </TabsTrigger>
            ))}
          </div>
          <div className="flex">
            {navItems.slice(3).map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id.toString()}
                className="px-5 py-1.5 mx-1 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none text-muted-foreground hover:text-primary hover:bg-primary/5 border-0"
              >
                {item.name}
              </TabsTrigger>
            ))}
          </div>
        </TabsList>
      </Tabs>
    </div>
  )
}

