// src/store/taskSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { 
  fetchTestTasks, 
  fetchTaskById as fetchTaskByIdApi, 
  createTask, 
  updateTask, 
  deleteTask 
} from '@/services/api';
import type { Task } from '@/types/api';
import type { RootState } from './index';
import { set } from 'date-fns';

interface TaskState {
  items: Task[];
  currentTask: Task | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  autoStart: boolean;
  error: string | null;
}

const initialState: TaskState = {
  items: [],
  currentTask: null,
  status: 'idle',
  autoStart: false,
  error: null
};

// 异步 thunk 用于获取任务数据
export const fetchTasks = createAsyncThunk<Task[]>(
  'tasks/fetchTasks',
  async () => {
    const response = await fetchTestTasks();
    return response;
  }
);

// 异步 thunk 用于获取单个任务
export const fetchTaskById = createAsyncThunk<Task | null, number>(
  'tasks/fetchTaskById',
  async (taskId: number) => {
    const response = await fetchTaskByIdApi(taskId);
    return response;
  }
);

// 异步 thunk 用于创建任务
export const createTaskAsync = createAsyncThunk<Task | null, Omit<Task, "id">>(
  'tasks/createTask',
  async (taskData: Omit<Task, "id">) => {
    const response = await createTask(taskData);
    return response;
  }
);

// 异步 thunk 用于更新任务
export const updateTaskAsync = createAsyncThunk<Task | null, Partial<Task> & { id: number }>(
  'tasks/updateTask',
  async (taskData: Partial<Task> & { id: number }) => {
    const response = await updateTask(taskData);
    return response;
  }
);

// 异步 thunk 用于删除任务
export const deleteTaskAsync = createAsyncThunk<{ success: boolean; taskId: number }, number>(
  'tasks/deleteTask',
  async (taskId: number) => {
    const success = await deleteTask(taskId);
    return { success, taskId };
  }
);

// 创建 slice
const taskSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    // 设置当前任务
    setCurrentTask: (state, action) => {
      state.currentTask = action.payload;
    },
    //设置是否开启自动化测试
    setAutoStart: (state, action) => {
      state.autoStart = action.payload;
    },
    // 更新任务状态
    updateTaskStatus: (state, action) => {
      const { taskId, status } = action.payload;
      const taskIndex = state.items.findIndex(t => t.id === taskId);
      if (taskIndex >= 0) {
        state.items[taskIndex].task_status = status;
      }
    },
    // 更新任务的机器响应
    updateMachineResponse: (state, action) => {
      const { taskId, sampleId, response } = action.payload;
      const taskIndex = state.items.findIndex(t => t.id === taskId);
      if (taskIndex >= 0) {
        if (!state.items[taskIndex].machine_response) {
          state.items[taskIndex].machine_response = {};
        }
        state.items[taskIndex].machine_response![sampleId] = response;
      }
    },
    // 更新任务的测试结果
    updateTestResult: (state, action) => {
      const { taskId, sampleId, result } = action.payload;
      const taskIndex = state.items.findIndex(t => t.id === taskId);
      if (taskIndex >= 0) {
        if (!state.items[taskIndex].test_result) {
          state.items[taskIndex].test_result = {};
        }
        state.items[taskIndex].test_result![sampleId] = result;
        updateTaskAsync(state.items[taskIndex]);
      }
    },
    // 添加新任务
    addTask: (state, action) => {
      state.items.push(action.payload);
    }
  },
  extraReducers: (builder) => {
    builder
      // 获取所有任务
      .addCase(fetchTasks.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchTasks.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // 处理单个任务对象或任务数组
        if (action.payload) {
          if (Array.isArray(action.payload)) {
            state.items = action.payload;
          } else {
            // 如果是单个任务对象，将其包装为数组
            state.items = [action.payload];
          }
        } else {
          state.items = [];
        }
      })
      .addCase(fetchTasks.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to fetch tasks';
      })
      
      // 获取单个任务
      .addCase(fetchTaskById.fulfilled, (state, action) => {
        if (action.payload) {
          state.currentTask = action.payload;
          
          // 如果任务不在列表中，添加到列表
          const existingTask = state.items.find(t => t.id === action.payload!.id);
          if (!existingTask) {
            state.items.push(action.payload);
          }
        }
      })
      
      // 创建任务
      .addCase(createTaskAsync.fulfilled, (state, action) => {
        if (action.payload) {
          state.items.push(action.payload);
          state.currentTask = action.payload;
        }
      })
      
      // 更新任务
      .addCase(updateTaskAsync.fulfilled, (state, action) => {
        if (action.payload) {
          const taskIndex = state.items.findIndex(t => t.id === action.payload!.id);
          if (taskIndex >= 0) {
            state.items[taskIndex] = action.payload;
          }
          
          // 如果当前任务是被更新的任务，也更新当前任务
          if (state.currentTask && state.currentTask.id === action.payload.id) {
            state.currentTask = action.payload;
          }
        }
      })
      
      // 删除任务
      .addCase(deleteTaskAsync.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.items = state.items.filter(t => t.id !== action.payload.taskId);
          
          // 如果当前任务是被删除的任务，清空当前任务
          if (state.currentTask && state.currentTask.id === action.payload.taskId) {
            state.currentTask = null;
          }
        }
      });
  }
});

// 导出 actions
export const { 
  setCurrentTask, 
  setAutoStart,
  updateTaskStatus, 
  updateMachineResponse, 
  updateTestResult,
  addTask 
} = taskSlice.actions;

// 定义 selectors
export const selectAllTasks = (state: RootState) => state.tasks.items;
export const selectCurrentTask = (state: RootState) => state.tasks.currentTask;
export const selectTaskById = (state: RootState, taskId: number): Task | undefined => 
  state.tasks.items.find((task: Task) => task.id === taskId);
export const selectTasksStatus = (state: RootState) => state.tasks.status;
export const selectTasksError = (state: RootState) => state.tasks.error;

// 将 slice 导出为默认导出
export default taskSlice.reducer;
