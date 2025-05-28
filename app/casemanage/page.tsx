'use client'
import { TestSamples } from "@/components/test-samples";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TestSamplePage() {
  return (
    <main className="flex flex-1 w-full bg-background p-6 ">
      <div className="flex flex-col w-full ">
        <h1 className="text-3xl font-bold mb-3">
            测试语料管理
          </h1>
        <div className="flex flex-1">
          <Tabs defaultValue="case" className="w-full">
            <TabsList>
              <TabsTrigger value="case">测试语料管理</TabsTrigger>
              <TabsTrigger value="wake">唤醒词管理</TabsTrigger>
            </TabsList>
            <TabsContent value="case">
              <TestSamples initialPageSize={8} />
            </TabsContent>
            <TabsContent value="wake">Change your password here.</TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}
