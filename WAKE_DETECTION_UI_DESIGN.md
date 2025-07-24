# 唤醒检测结果界面设计

## 概述
本文档描述了任务详细界面中新增的唤醒检测结果展示功能，包括统计信息和详细结果列表。

## 界面结构

### 1. 位置和布局
唤醒检测结果展示位于任务详细界面的以下位置：
- **位置**：在"唤醒词列表"和"测试语料概览"之间
- **布局**：垂直排列，包含统计卡片和详细结果列表

### 2. 统计卡片区域
```
┌─────────────────────────────────────────────────────────────┐
│ 总测试数    成功数    失败数    成功率                        │
│    [5]      [3]      [2]     [60.0%]                      │
└─────────────────────────────────────────────────────────────┘
```

**统计指标**：
- **总测试数**：蓝色卡片，显示所有唤醒检测测试的总数
- **成功数**：绿色卡片，显示成功检测的次数
- **失败数**：红色卡片，显示失败检测的次数
- **成功率**：紫色卡片，显示成功率的百分比

### 3. 详细结果列表
```
┌─────────────────────────────────────────────────────────────┐
│ ✓ 你好小布                                                    │
│   置信度: 0.856  耗时: 2500ms  时间: 2024/01/15 14:30:25    │
│                                                    [成功]    │
├─────────────────────────────────────────────────────────────┤
│ ✗ 小布小布                                                    │
│   置信度: N/A    耗时: 30000ms  时间: 2024/01/15 14:31:00   │
│                                                    [失败]    │
└─────────────────────────────────────────────────────────────┘
```

**结果项信息**：
- **状态图标**：✓ 表示成功，✗ 表示失败
- **唤醒词文本**：显示实际的唤醒词内容
- **置信度**：检测的置信度分数（0-1之间）
- **耗时**：检测过程的总耗时（毫秒）
- **时间**：检测完成的时间戳
- **状态标签**：成功/失败的标签

### 4. 底部统计信息
```
平均置信度: 0.856    平均耗时: 12500ms
```

## 技术实现

### 1. Hook 设计
```typescript
// hooks/useWakeDetectionResults.ts
export function useWakeDetectionResults(taskId?: number) {
  // 返回结果、加载状态、错误信息和统计数据
  return {
    results,
    isLoading,
    error,
    stats,
    refetch,
  };
}
```

### 2. 数据结构
```typescript
interface WakeDetectionResult {
  test_index: number;
  wake_word_id: number;
  wake_word_text: string;
  wake_task_completed: boolean;
  active_task_completed: boolean;
  success: boolean;
  confidence?: number;
  timestamp: number;
  duration_ms: number;
}
```

### 3. 统计计算
```typescript
const stats = {
  total: results.length,
  success: results.filter(r => r.success).length,
  failed: results.filter(r => !r.success).length,
  successRate: (success / total) * 100,
  avgConfidence: results.reduce((sum, r) => sum + (r.confidence || 0), 0) / total,
  avgDuration: results.reduce((sum, r) => sum + r.duration_ms, 0) / total,
};
```

## 界面状态

### 1. 加载状态
```
┌─────────────────────────────────────────────────────────────┐
│                    ⏳ 加载唤醒检测结果中...                    │
└─────────────────────────────────────────────────────────────┘
```

### 2. 空状态
```
┌─────────────────────────────────────────────────────────────┐
│                    🔊                                      │
│                暂无唤醒检测结果                               │
│           执行唤醒检测任务后将显示结果                         │
└─────────────────────────────────────────────────────────────┘
```

### 3. 有数据状态
显示完整的统计卡片和详细结果列表

## 交互功能

### 1. 自动刷新
- 当任务ID变化时自动获取最新结果
- 支持手动刷新功能

### 2. 响应式设计
- 统计卡片在小屏幕上自动换行
- 结果列表支持滚动查看

### 3. 视觉反馈
- 成功/失败状态使用不同的颜色主题
- 悬停效果增强用户体验

## 数据来源

### 1. 后端命令
```rust
#[tauri::command]
pub async fn get_wake_detection_results(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<Vec<WakeDetectionResult>, String>
```

### 2. 数据库表
```sql
CREATE TABLE wake_detection_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    wake_word_id INTEGER NOT NULL,
    success BOOLEAN NOT NULL,
    confidence REAL,
    timestamp INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (wake_word_id) REFERENCES wake_words(id) ON DELETE CASCADE
)
```

## 样式设计

### 1. 颜色主题
- **成功状态**：绿色系 (#10b981, #059669)
- **失败状态**：红色系 (#ef4444, #dc2626)
- **统计卡片**：蓝色、绿色、红色、紫色系
- **背景**：灰色系 (#f9fafb, #1f2937)

### 2. 间距和布局
- **卡片间距**：16px (gap-4)
- **内边距**：16px (p-4)
- **圆角**：8px (rounded-lg)
- **阴影**：轻微阴影效果

### 3. 字体和图标
- **标题**：中等字重 (font-medium)
- **数值**：粗体 (font-bold)
- **图标**：Lucide React 图标库
- **状态图标**：CheckCircle2, XCircle

## 扩展性

### 1. 未来功能
- 支持按唤醒词筛选结果
- 支持按时间范围筛选
- 支持导出唤醒检测报告
- 支持结果对比分析

### 2. 性能优化
- 虚拟滚动支持大量结果
- 分页加载避免一次性加载过多数据
- 缓存机制减少重复请求

## 用户体验

### 1. 信息层次
- 统计信息优先展示
- 详细结果按时间倒序排列
- 重要信息突出显示

### 2. 可读性
- 清晰的状态标识
- 合理的数值格式化
- 友好的时间显示

### 3. 一致性
- 与现有界面风格保持一致
- 使用统一的组件库
- 遵循设计系统规范 