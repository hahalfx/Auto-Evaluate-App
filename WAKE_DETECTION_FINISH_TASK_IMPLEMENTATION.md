# 唤醒检测 Finish Task 实现总结

## 概述
本次更新将唤醒检测工作流中的 `middle_task` 替换为 `finish_task`，实现了唤醒检测结果的自动数据库保存功能。采用与现有分析任务工作流一致的设计模式，`finish_task` 从工作流上下文中获取 `active_task` 的结果数据。

## 设计理念

### 一致性设计
- 与现有的分析任务工作流保持一致
- `finish_task` 通过依赖的 `active_task_id` 从工作流上下文中获取结果
- 不需要预先传入完整的结果对象，而是动态获取

### 数据流设计
1. **工作流创建**：`audio_task` + `ActiveTask` + `finish_task`
2. **依赖关系**：`finish_task` 等待 `audio_task` 和 `ActiveTask` 完成
3. **数据获取**：`finish_task` 从上下文中获取 `active_task` 的结果
4. **数据保存**：解析结果并保存到数据库
5. **事件通知**：发送完成事件到前端

## 主要修改

### 1. 数据库结构扩展

#### 新增表：`wake_detection_results`
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

**保存的核心数据**：
- `task_id`：当前元任务的ID
- `wake_word_id`：唤醒词ID
- `success`：是否成功（从active_task结果解析）
- `confidence`：置信度（从active_task结果解析）
- `timestamp`：时间戳
- `duration_ms`：持续时间

### 2. 数据库服务扩展

#### 新增方法
- `save_wake_detection_result_direct()`：直接保存唤醒检测结果数据
- `get_wake_detection_results_by_task()`：获取指定任务的所有唤醒检测结果

### 3. Finish Task 功能扩展

#### 新增字段
- `active_task_id: Option<String>`：用于唤醒检测的active_task_id
- `wake_word_id: Option<u32>`：唤醒词ID

#### 新增构造函数
- `new_for_wake_detection()`：专门用于唤醒检测的构造函数

#### 核心逻辑
- `process_and_save_data()`：从工作流上下文中获取 `active_task` 结果
- 解析 `active_task` 的 JSON 结果，提取 `status` 和 `confidence`
- 保存解析后的数据到数据库

### 4. 唤醒检测工作流修改

#### 工作流结构
```rust
// 创建任务
sub_workflow.add_task(audio_task { ... });
sub_workflow.add_task(ActiveTask::new(...));
sub_workflow.add_task(finish_task::new_for_wake_detection(
    finish_task_id,
    task_id,
    active_task_id,  // 传入active_task_id
    wake_word_id,    // 传入wake_word_id
    db,
));

// 设置依赖关系
sub_workflow.add_dependency(&finish_task_id, &wake_task_id);
sub_workflow.add_dependency(&finish_task_id, &active_task_id);
```

#### 数据获取逻辑
```rust
// 从上下文中获取active_task结果
let active_task_result = context_reader.get(active_task_id)
    .and_then(|data| data.downcast_ref::<serde_json::Value>())
    .cloned()?;

// 解析结果
let success = active_task_result.get("status")
    .and_then(|s| s.as_str())
    .map(|s| s == "completed")
    .unwrap_or(false);

let confidence = active_task_result.get("confidence")
    .and_then(|c| c.as_f64());
```

### 5. 新增命令

#### `get_wake_detection_results`
- 获取当前任务的唤醒检测结果
- 返回 `Vec<WakeDetectionResult>` 类型

## 技术优势

### 1. 架构一致性
- 与现有的分析任务工作流完全一致
- 统一的数据获取和保存模式

### 2. 数据完整性
- 从 `active_task` 获取真实的检测结果
- 包含置信度等详细信息

### 3. 灵活性
- 不需要修改 `audio_task` 或 `ActiveTask`
- 通过工作流上下文动态获取数据

### 4. 可维护性
- 清晰的数据流和依赖关系
- 统一的错误处理机制

## 使用方式

### 1. 前端获取结果
```typescript
import { invoke } from '@tauri-apps/api/core';

const results = await invoke('get_wake_detection_results');
```

### 2. 监听保存事件
```typescript
import { listen } from '@tauri-apps/api/event';

await listen('wake_detection_result_saved', (event) => {
  console.log('唤醒检测结果已保存:', event.payload);
  // event.payload 包含：
  // - task_id: 任务ID
  // - wake_word_id: 唤醒词ID
  // - success: 是否成功（从active_task解析）
  // - confidence: 置信度（从active_task解析）
  // - duration_ms: 持续时间
});
```

## 数据流程

1. **工作流执行**：`audio_task` + `ActiveTask` → `finish_task`
2. **数据收集**：`finish_task` 从上下文中获取 `active_task` 结果
3. **数据解析**：解析 JSON 结果，提取 `status` 和 `confidence`
4. **数据保存**：保存到 `wake_detection_results` 表
5. **事件通知**：发送 `wake_detection_result_saved` 事件
6. **前端更新**：前端接收事件并更新UI

## 兼容性

- 保持与现有唤醒检测功能的完全兼容
- 不影响现有的分析任务工作流
- 数据库迁移自动处理（使用 `CREATE TABLE IF NOT EXISTS`）

## 后续优化建议

1. **时间计算**：从 `active_task` 结果中获取实际的检测持续时间
2. **错误处理**：增强对 `active_task` 结果格式的容错性
3. **批量处理**：支持批量保存多个唤醒检测结果
4. **统计分析**：添加基于保存数据的统计分析功能 