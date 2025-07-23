export const dynamic = "force-static"

import { NextResponse } from "next/server";
import type { Task } from "@/types/api";
import path from "path";
import fs from "fs/promises";
import { NextRequest } from "next/server";

const filePath = path.join(process.cwd(), "public", "mock", "tasks.json");

// 读取任务数据
async function readTasksData(): Promise<Task[]> {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const parsedData = JSON.parse(data);
    
    // 如果数据是单个对象，将其包装为数组
    return Array.isArray(parsedData) ? parsedData : [parsedData];
  } catch (error) {
    console.error("Error reading tasks.json:", error);
    return [];
  }
}

// 写入任务数据
async function writeTasksData(tasks: Task[]): Promise<boolean> {
  try {
    await fs.writeFile(filePath, JSON.stringify(tasks, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("Error writing tasks.json:", error);
    return false;
  }
}

// 获取所有任务或单个任务
export async function GET(request: NextRequest) {
  try {
    const tasks = await readTasksData();
    
    // 检查是否有ID参数
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    
    if (id) {
      // 查找特定ID的任务
      const taskId = parseInt(id);
      const task = tasks.find(t => t.id === taskId);
      
      if (task) {
        return NextResponse.json(task);
      } else {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
    }
    
    // 返回所有任务
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Error in GET:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

// 创建新任务
export async function POST(request: NextRequest) {
  try {
    const tasks = await readTasksData();
    const newTask = await request.json();
    
    // 验证必要字段
    if (!newTask.test_samples_ids || !newTask.wake_word_ids || !newTask.task_status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    // 生成新ID (使用当前最大ID + 1)
    const maxId = tasks.reduce((max, task) => Math.max(max, task.id), 0);
    newTask.id = maxId + 1;
    
    // 添加新任务
    tasks.push(newTask);
    
    // 保存数据
    const success = await writeTasksData(tasks);
    if (success) {
      return NextResponse.json(newTask, { status: 201 });
    } else {
      return NextResponse.json(
        { error: "Failed to save task" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in POST:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

// 更新任务
export async function PUT(request: NextRequest) {
  try {
    const tasks = await readTasksData();
    const updatedTask = await request.json();
    
    // 验证ID字段
    if (!updatedTask.id) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      );
    }
    
    // 查找任务索引
    const taskIndex = tasks.findIndex(t => t.id === updatedTask.id);
    
    if (taskIndex === -1) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    // 更新任务，保留原有字段
    tasks[taskIndex] = { ...tasks[taskIndex], ...updatedTask };
    
    // 保存数据
    const success = await writeTasksData(tasks);
    if (success) {
      return NextResponse.json(tasks[taskIndex]);
    } else {
      return NextResponse.json(
        { error: "Failed to update task" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in PUT:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

// 删除任务
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    
    if (!id) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      );
    }
    
    const taskId = parseInt(id);
    const tasks = await readTasksData();
    
    // 查找任务索引
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    // 删除任务
    const deletedTask = tasks[taskIndex];
    tasks.splice(taskIndex, 1);
    
    // 保存数据
    const success = await writeTasksData(tasks);
    if (success) {
      return NextResponse.json({ 
        message: "Task deleted successfully",
        deletedTask 
      });
    } else {
      return NextResponse.json(
        { error: "Failed to delete task" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in DELETE:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
