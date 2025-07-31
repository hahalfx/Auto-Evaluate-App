import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { ReduxProvider } from "./providers";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ActiveTasksProvider } from "@/lib/contexts/active-tasks-context";
import { SampleSelectionProvider } from "@/lib/contexts/sample-selection-context";
import { TestExecutionProvider } from "@/lib/contexts/test-execution-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "语音交互大模型分析",
  description: "语音交互大模型分析系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ReduxProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <ActiveTasksProvider>
              <SampleSelectionProvider>
                <TestExecutionProvider>
                  <DashboardLayout>
                    {children}
                    <Toaster />
                  </DashboardLayout>
                </TestExecutionProvider>
              </SampleSelectionProvider>
            </ActiveTasksProvider>
          </ThemeProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
