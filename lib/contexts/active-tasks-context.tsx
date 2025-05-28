"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"

// 活跃任务类型
export interface ActiveTask {
  id: string
  name: string
  type: string
}

// 上下文类型
interface ActiveTasksContextType {
  activeTasks: ActiveTask[]
  addActiveTask: (task: ActiveTask) => void
  removeActiveTask: (taskId: string) => void
  isTaskActive: (taskId: string) => boolean
  navigateToTask: (taskId: string) => void
}

// 创建上下文
const ActiveTasksContext = createContext<ActiveTasksContextType | undefined>(undefined)

// 提供者组件
export function ActiveTasksProvider({ children }: { children: ReactNode }) {
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([])
  const router = useRouter()

  // 从本地存储加载活跃任务
  useEffect(() => {
    try {
      const savedTasks = localStorage.getItem("activeTasks")
      if (savedTasks) {
        setActiveTasks(JSON.parse(savedTasks))
      }
    } catch (error) {
      console.error("Failed to load active tasks from localStorage", error)
    }
  }, [])

  // 保存活跃任务到本地存储
  useEffect(() => {
    try {
      localStorage.setItem("activeTasks", JSON.stringify(activeTasks))
    } catch (error) {
      console.error("Failed to save active tasks to localStorage", error)
    }
  }, [activeTasks])

  // 添加活跃任务
  const addActiveTask = (task: ActiveTask) => {
    setActiveTasks((prev) => {
      // 如果任务已存在，不重复添加
      if (prev.some((t) => t.id === task.id)) {
        return prev
      }
      return [...prev, task]
    })

    // 导航到任务执行页面
    router.push(`/llm-analysis`)
  }

  // 移除活跃任务
  const removeActiveTask = (taskId: string) => {
    setActiveTasks((prev) => prev.filter((task) => task.id !== taskId))

    // 如果当前在该任务页面，则返回任务列表
    const currentPath = window.location.pathname
    if (currentPath === `/llm-analysis`) {
      router.push("/taskmanage")
    }
  }

  // 检查任务是否活跃
  const isTaskActive = (taskId: string) => {
    return activeTasks.some((task) => task.id === taskId)
  }

  // 导航到任务
  const navigateToTask = (taskId: string) => {
    router.push(`/llm-analysis`)
  }

  return (
    <ActiveTasksContext.Provider
      value={{
        activeTasks,
        addActiveTask,
        removeActiveTask,
        isTaskActive,
        navigateToTask,
      }}
    >
      {children}
    </ActiveTasksContext.Provider>
  )
}

// 自定义钩子
export function useActiveTasks() {
  const context = useContext(ActiveTasksContext)
  if (context === undefined) {
    throw new Error("useActiveTasks must be used within an ActiveTasksProvider")
  }
  return context
}
