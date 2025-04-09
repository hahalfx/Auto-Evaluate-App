import type { TestSample, AnalysisResult, Task } from "@/types/api"

// 获取测试语料
export async function fetchTestSamples(): Promise<TestSample[]> {
  // 实际项目中替换为真实API调用
  try {
    const response = await fetch("/api/test-samples")
    if (!response.ok) {
      throw new Error("Failed to fetch test samples")
    }
    return await response.json()
  } catch (error) {
    console.error("Error fetching test samples:", error)
    return []
  }
}

// 获取测试任务
export async function fetchTestTasks(): Promise<Task[]> {
  // 实际项目中替换为真实API调用
  try {
    const response = await fetch("/api/test-tasks")
    if (!response.ok) {
      throw new Error("Failed to fetch test tasks")
    }
    return await response.json()
  } catch (error) {
    console.error("Error fetching test tasks:", error)
    return []
  }
}

// 获取单个测试任务
export async function fetchTaskById(taskId: number): Promise<Task | null> {
  try {
    const response = await fetch(`/api/test-tasks?id=${taskId}`)
    if (!response.ok) {
      throw new Error("Failed to fetch task")
    }
    return await response.json()
  } catch (error) {
    console.error(`Error fetching task ${taskId}:`, error)
    return null
  }
}

// 创建新测试任务
export async function createTask(taskData: Omit<Task, "id">): Promise<Task | null> {
  try {
    const response = await fetch("/api/test-tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(taskData),
    })

    if (!response.ok) {
      throw new Error("Failed to create task")
    }

    return await response.json()
  } catch (error) {
    console.error("Error creating task:", error)
    return null
  }
}

// 更新测试任务
export async function updateTask(taskData: Partial<Task> & { id: number }): Promise<Task | null> {
  try {
    const response = await fetch("/api/test-tasks", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(taskData),
    })

    if (!response.ok) {
      throw new Error("Failed to update task")
    }

    return await response.json()
  } catch (error) {
    console.error(`Error updating task ${taskData.id}:`, error)
    return null
  }
}

// 删除测试任务
export async function deleteTask(taskId: number): Promise<boolean> {
  try {
    const response = await fetch(`/api/test-tasks?id=${taskId}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      throw new Error("Failed to delete task")
    }

    return true
  } catch (error) {
    console.error(`Error deleting task ${taskId}:`, error)
    return false
  }
}

// 提交车机响应并获取分析结果
export async function submitForAnalysis(sampleText: string, machineResponse: string): Promise<AnalysisResult> {
  // 实际项目中替换为真实API调用
  try {
    const response = await fetch("http://localhost:8000/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sample: sampleText,
        machineResponse: machineResponse,
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to submit for analysis")
    }

    return await response.json()
  } catch (error) {
    console.error("Error submitting for analysis:", error)
    // 返回模拟数据作为fallback
    return {
      assessment: {
        semantic_correctness: {
          score: 0,
          comment: "响应未匹配核心功能需求（空调控制），仅反馈识别失败。",
        },
        state_change_confirmation: {
          score: 0,
          comment: "未执行空调开关操作，未提供状态变更信息。",
        },
        unambiguous_expression: {
          score: 1,
          comment: "响应文本本身无歧义，但未解决原始指令意图。",
        },
        overall_score: 0.33,
        valid: false,
        suggestions: [
          "应优先执行空调开关指令，而非直接进入语音识别错误处理流程",
          "若识别失败，建议补充引导（如：'您是要打开空调吗？'）以确认意图",
        ],
      },
      llmAnalysis: {
        title: "deepseek&星火大模型分析",
        content:
          "从响应内容来看，车机未能正确理解用户的空调控制指令，而是将其视为无法识别的语音输入。这种响应方式不符合用户期望，无法满足用户的实际需求。",
        context: false,
        multiRound: false,
      },
    }
  }
}

// 语音识别API
export async function recognizeSpeech(): Promise<string> {
  // 实际项目中替换为真实语音识别API调用
  try {
    const response = await fetch("/api/speech-recognition", {
      method: "POST",
    })

    if (!response.ok) {
      throw new Error("Failed to recognize speech")
    }

    const data = await response.json()
    return data.text
  } catch (error) {
    console.error("Error recognizing speech:", error)
    // 返回模拟数据作为fallback
    return "生活的乐趣是自己发觉的"
  }
}

// 检查车机连接状态
export async function checkMachineConnection(): Promise<boolean> {
  // 实际项目中替换为真实API调用
  try {
    const response = await fetch("/api/machine-status")
    if (!response.ok) {
      throw new Error("Failed to check machine connection")
    }
    const data = await response.json()
    return data.connected
  } catch (error) {
    console.error("Error checking machine connection:", error)
    // 返回模拟数据作为fallback
    return true
  }
}
