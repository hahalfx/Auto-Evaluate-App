// src/store/index.ts
import { configureStore } from "@reduxjs/toolkit";
import samplesReducer from "./samplesSlice";
import taskReducer from "./taskSlice";

export const store = configureStore({
  reducer: {
    samples: samplesReducer,
    tasks: taskReducer,
  },
});

// 为了 TypeScript 使用的类型定义
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
