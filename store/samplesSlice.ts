// src/store/samplesSlice.ts
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchTestSamples } from "@/services/api";
import type { TestSample } from "@/types/api";
import type { RootState } from "./index";

interface SamplesState {
  items: TestSample[];
  selectedIds: number[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: SamplesState = {
  items: [],
  selectedIds: [],
  status: "idle",
  error: null,
};

// 异步 thunk 用于获取样本数据
export const fetchSamples = createAsyncThunk(
  "samples/fetchSamples",
  async () => {
    const response = await fetchTestSamples();
    return response;
  }
);

// 创建 slice
const samplesSlice = createSlice({
  name: "samples",
  initialState,
  reducers: {
    // 设置选中的样本 ID
    setSelectedSamples: (state, action) => {
      state.selectedIds = action.payload;
    },
    // 更新特定样本的结果
    updateSampleResult: (state, action) => {
      const { sampleId, taskId, result } = action.payload;
      const sampleIndex = state.items.findIndex((s) => s.id === sampleId);
      if (sampleIndex >= 0) {
        // 如果 result 不存在，先初始化为空对象
        if (!state.items[sampleIndex].result) {
          state.items[sampleIndex].result = {};
        }
        state.items[sampleIndex].result[taskId] = result;
      }
    },
    // 完全替换样本数组(如果需要)
    setSamples: (state, action) => {
      state.items = action.payload;
    },
    // 删除指定样本
    deleteSample: (state, action) => {
      state.items = state.items.filter(
        (sample) => sample.id !== action.payload
      );
      // 如果被删除的样本是选中的，也从选中列表中移除
      state.selectedIds = state.selectedIds.filter(
        (id) => id !== action.payload
      );
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSamples.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchSamples.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload;
      })
      .addCase(fetchSamples.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message || "Failed to fetch samples";
      });
  },
});

// 导出 actions
export const {
  setSelectedSamples,
  updateSampleResult,
  setSamples,
  deleteSample,
} = samplesSlice.actions;

// 定义 selectors
export const selectAllSamples = (state: RootState) => state.samples.items;
export const selectSelectedSampleIds = (state: RootState) =>
  state.samples.selectedIds;
export const selectSampleById = (
  state: RootState,
  sampleId: number
): TestSample | undefined =>
  state.samples.items.find((sample: TestSample) => sample.id === sampleId);
export const selectSamplesStatus = (state: RootState) => state.samples.status;
export const selectSamplesError = (state: RootState) => state.samples.error;

// 将 slice 导出为默认导出
export default samplesSlice.reducer;
