# Redux 迁移指南

## 概述
本项目正在从 Redux 状态管理迁移到更直接的 Tauri API + React Context 架构。本文档记录了迁移过程和后续步骤。

## 已完成的更改

### 1. 创建了新的 Context Providers
- `SampleSelectionContext` - 管理样本选择状态
- `TestExecutionContext` - 管理测试执行状态

### 2. 修复了关键问题
- **导出功能修复**: `useExportCurrentTask` hook 现在从 Tauri API 获取数据，而不是 Redux
- **任务详情对话框**: 使用 SampleSelectionContext 替代 Redux 的 setSelectedSamples

### 3. 架构改进
- 添加了新的 Context Providers 到应用根组件
- 保持了向后兼容性（Redux 仍然存在但逐步弃用）

## 仍需迁移的组件

### 高优先级
1. **progress-bar.tsx** - 完全依赖 Redux 获取数据
2. **create-task.tsx** - 部分使用 Redux 管理选中状态
3. **llm-analysis-interface.tsx** - 使用 Redux 获取当前任务
4. **wake-word.tsx** - 使用 Redux 获取样本数据

### 中优先级
1. **hooks/useLLMAnalysis.ts** - 大量使用 Redux
2. **components/custom/task-list.tsx** - 完全依赖 Redux
3. **components/analysis-results.tsx** - 使用 Redux
4. **hooks/useAutoTest.ts** - 使用 Redux

### 低优先级
1. **完全移除 Redux 相关代码**
2. 清理未使用的 imports
3. 优化性能

## 迁移策略

### 阶段 1: 样本选择状态迁移 ✅
- [x] 创建 SampleSelectionContext
- [x] 更新 taskmanage.tsx
- [ ] 更新 create-task.tsx
- [ ] 更新其他使用样本选择的组件

### 阶段 2: 任务执行状态迁移 ✅
- [x] 创建 TestExecutionContext
- [ ] 迁移 progress-bar.tsx
- [ ] 迁移 llm-analysis-interface.tsx

### 阶段 3: 数据获取迁移
- [x] 任务数据 → useTauriTasks
- [x] 唤醒词数据 → useTauriWakewords
- [x] 样本数据 → useTauriSamples
- [ ] 移除 Redux 中的数据缓存

### 阶段 4: 清理 Redux
- [ ] 删除 store/samplesSlice.ts
- [ ] 删除 store/taskSlice.ts
- [ ] 删除 store/index.ts
- [ ] 删除 app/providers.tsx
- [ ] 移除 Redux 依赖包

## 迁移示例

### Before (Redux)
```typescript
const dispatch = useAppDispatch();
const selectedIds = useAppSelector(state => state.samples.selectedIds);

const handleSelect = (id: number) => {
  dispatch(setSelectedSamples([...selectedIds, id]));
};
```

### After (Context)
```typescript
const { selectedIds, addSelection } = useSampleSelection();

const handleSelect = (id: number) => {
  addSelection(id);
};
```

## 注意事项

1. **性能考虑**: 频繁的 Tauri API 调用可能影响性能，考虑使用 React Query 缓存
2. **测试覆盖**: 每次迁移后都需要全面测试相关功能
3. **向后兼容**: 在完全移除 Redux 前，确保所有功能正常工作

## 后续步骤

1. 更新 create-task.tsx 使用 SampleSelectionContext
2. 重构 progress-bar.tsx 移除 Redux 依赖
3. 创建 React Query hooks 替代 Redux 的数据缓存
4. 逐步移除 Redux 相关代码