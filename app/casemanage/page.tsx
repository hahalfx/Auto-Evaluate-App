import { TestSamples } from "@/components/test-samples";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TestSamplePage() {
  return (
    <main className="h-dvh w-full bg-background">
      <div className="flex flex-col w-full max-h-screen">
        <div className="flex items-center fixed top-0 w-full bg-white">
          <SidebarTrigger className="mx-6 my-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">主页</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/casemanage">
                测试语料管理
                </BreadcrumbLink>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex flex-1 mt-14 mx-6">
          <Tabs defaultValue="case" className="w-full">
            <TabsList>
              <TabsTrigger value="case">测试语料管理</TabsTrigger>
              <TabsTrigger value="wake">唤醒词管理</TabsTrigger>
            </TabsList>
            <TabsContent value="case">
              <TestSamples initialPageSize={9} />
            </TabsContent>
            <TabsContent value="wake">Change your password here.</TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}
