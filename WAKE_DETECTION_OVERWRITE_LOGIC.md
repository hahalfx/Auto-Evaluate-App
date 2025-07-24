# 唤醒检测覆盖逻辑实现

## 概述
本文档描述了唤醒检测工作流中新增的覆盖逻辑功能，当检测到任务已有唤醒检测结果时，为用户提供选择如何处理现有数据的选项。

## 功能需求

### 1. 检查现有结果
- 在开始工作流前检查数据库中是否已存在该任务的唤醒检测结果
- 如果存在，显示确认对话框让用户选择处理方式

### 2. 用户选择选项
- **取消**：不执行任何操作
- **覆盖现有结果**：删除现有结果，重新执行测试
- **追加新结果**：保留现有结果，添加新的测试结果

### 3. 数据重复处理
- 覆盖模式：完全替换现有数据
- 追加模式：允许重复的唤醒词测试记录

## 技术实现

### 1. 后端命令

#### 检查结果是否存在
```rust
#[tauri::command]
pub async fn check_wake_detection_results_exist(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<bool, String>
```

#### 删除指定任务的结果
```rust
#[tauri::command]
pub async fn delete_wake_detection_results_by_task(
    state: State<'_, Arc<AppState>>,
    task_id: u32,
) -> Result<(), String>
```

### 2. 数据库方法

#### 检查结果存在性
```rust
pub async fn check_wake_detection_results_exist(
    &self,
    task_id: i64,
) -> Result<bool> {
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM wake_detection_results WHERE task_id = ?",
    )
    .bind(task_id)
    .fetch_one(&self.pool)
    .await?;

    Ok(count > 0)
}
```

#### 删除任务结果
```rust
pub async fn delete_wake_detection_results_by_task(
    &self,
    task_id: i64,
) -> Result<()> {
    sqlx::query("DELETE FROM wake_detection_results WHERE task_id = ?")
        .bind(task_id)
        .execute(&self.pool)
        .await?;

    Ok(())
}
```

### 3. 前端逻辑

#### 状态管理
```typescript
// 覆盖确认对话框状态
const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
const [overwriteAction, setOverwriteAction] = useState<'cancel' | 'overwrite' | 'append' | null>(null);
```

#### 开始工作流逻辑
```typescript
const startWorkflow = async () => {
    // 检查当前任务是否已有唤醒检测结果
    const currentTask = await invoke<{ id: number; name: string; wake_word_ids: number[] }>('get_current_task');
    const hasExistingResults = await invoke<boolean>('check_wake_detection_results_exist', { 
        taskId: currentTask.id 
    });

    if (hasExistingResults) {
        // 显示覆盖确认对话框
        setShowOverwriteDialog(true);
        return;
    }

    // 没有现有结果，直接开始工作流
    await startWorkflowInternal();
};
```

#### 内部工作流方法
```typescript
const startWorkflowInternal = async (shouldOverwrite: boolean = false) => {
    // 如果需要覆盖，先删除现有结果
    if (shouldOverwrite) {
        await invoke('delete_wake_detection_results_by_task', { 
            taskId: currentTask.id 
        });
    }

    // 继续执行工作流...
};
```

#### 处理用户选择
```typescript
const handleOverwriteChoice = async (choice: 'cancel' | 'overwrite' | 'append') => {
    setShowOverwriteDialog(false);
    setOverwriteAction(choice);

    if (choice === 'cancel') {
        return;
    }

    if (choice === 'overwrite') {
        await startWorkflowInternal(true);
    } else if (choice === 'append') {
        await startWorkflowInternal(false);
    }
};
```

## 用户界面

### 1. 覆盖确认对话框
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  发现现有测试结果                                          │
├─────────────────────────────────────────────────────────────┤
│ 当前任务已经执行过唤醒检测测试，数据库中已存在测试结果。        │
│ 请选择如何处理：                                              │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 开始并覆盖以前的任务                                      │ │
│ │ 删除现有的测试结果，重新执行测试。这将完全替换之前的结果。  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 开始但不覆盖以前的任务                                    │ │
│ │ 保留现有结果，添加新的测试结果。可能会产生重复的唤醒词测试  │ │
│ │ 记录。                                                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [取消] [覆盖现有结果] [追加新结果]                            │
└─────────────────────────────────────────────────────────────┘
```

### 2. 按钮样式
- **取消**：outline 样式
- **覆盖现有结果**：destructive 样式（红色）
- **追加新结果**：default 样式（蓝色）

## 数据流程

### 1. 覆盖模式流程
```
用户点击开始工作流
    ↓
检查是否有现有结果
    ↓
显示覆盖确认对话框
    ↓
用户选择"覆盖现有结果"
    ↓
删除数据库中该任务的所有唤醒检测结果
    ↓
开始新的工作流
    ↓
保存新的测试结果
```

### 2. 追加模式流程
```
用户点击开始工作流
    ↓
检查是否有现有结果
    ↓
显示覆盖确认对话框
    ↓
用户选择"追加新结果"
    ↓
直接开始工作流
    ↓
保存新的测试结果（可能与现有结果重复）
```

## 数据重复分析

### 1. 重复数据场景
在追加模式下，可能会产生以下重复数据：

#### 表结构分析
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

#### 重复情况
- **task_id**：相同（同一任务）
- **wake_word_id**：可能相同（同一唤醒词多次测试）
- **timestamp**：不同（不同时间执行）
- **其他字段**：可能不同（不同的测试结果）

### 2. 重复数据的合理性
- **时间戳不同**：可以区分不同时间的测试
- **结果可能不同**：同一唤醒词在不同时间可能有不同的检测结果
- **置信度可能不同**：环境、设备状态等因素影响检测精度

### 3. 数据查询考虑
在查询结果时需要考虑：
- 按时间排序显示最新结果
- 提供去重选项（按唤醒词分组，显示最新结果）
- 支持查看历史测试记录

## 错误处理

### 1. 检查失败
```typescript
try {
    const hasExistingResults = await invoke<boolean>('check_wake_detection_results_exist', { 
        taskId: currentTask.id 
    });
} catch (error) {
    toast({
        title: "检查失败",
        description: "无法检查现有结果，请重试",
        variant: "destructive",
    });
}
```

### 2. 删除失败
```typescript
try {
    await invoke('delete_wake_detection_results_by_task', { 
        taskId: currentTask.id 
    });
} catch (error) {
    toast({
        title: "删除失败",
        description: "无法删除现有结果，请重试",
        variant: "destructive",
    });
    return;
}
```

## 用户体验优化

### 1. 清晰的选项说明
- 每个选项都有详细的说明文字
- 使用不同的背景色区分选项
- 图标提示操作类型

### 2. 操作反馈
- 删除操作后显示确认消息
- 不同模式下的不同提示信息
- 加载状态指示

### 3. 安全性考虑
- 删除操作需要用户明确确认
- 提供取消选项
- 操作不可逆的明确提示

## 扩展性

### 1. 未来功能
- 支持批量删除特定时间范围的结果
- 支持结果备份和恢复
- 支持结果对比分析

### 2. 配置选项
- 可配置默认行为（覆盖/追加）
- 可配置是否显示确认对话框
- 可配置自动清理策略

## 测试建议

### 1. 功能测试
- 测试无现有结果的情况
- 测试有现有结果的各种选择
- 测试删除操作的错误处理

### 2. 数据完整性测试
- 验证删除操作的正确性
- 验证追加操作的数据完整性
- 验证重复数据的处理

### 3. 用户体验测试
- 测试对话框的交互流程
- 测试不同选择的结果
- 测试错误情况的处理 