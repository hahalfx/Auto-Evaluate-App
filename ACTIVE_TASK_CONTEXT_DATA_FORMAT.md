# Active Task Context 数据格式说明

## 概述
本文档说明 `active_task` 写入工作流 context 的数据格式，以及 `finish_task` 如何正确解析这些数据。

## Context 数据格式

### 成功检测时的数据格式
```json
{
  "status": "completed",
  "confidence": 0.85,
  "duration_ms": 2500,
  "timestamp": 1703123456789
}
```

### 超时时的数据格式
```json
{
  "status": "timeout",
  "confidence": null,
  "duration_ms": 30000,
  "timestamp": 1703123486789
}
```

## 字段说明

| 字段名 | 类型 | 说明 | 示例值 |
|--------|------|------|--------|
| `status` | string | 检测状态 | `"completed"` 或 `"timeout"` |
| `confidence` | number \| null | 检测置信度 | `0.85` 或 `null` |
| `duration_ms` | number | 检测持续时间（毫秒） | `2500` |
| `timestamp` | number | 检测完成时间戳 | `1703123456789` |

## Finish Task 解析逻辑

### 1. 数据获取
```rust
let active_task_result = context_reader.get(active_task_id)
    .and_then(|data| data.downcast_ref::<serde_json::Value>())
    .cloned()?;
```

### 2. 状态解析
```rust
let success = active_task_result.get("status")
    .and_then(|s| s.as_str())
    .map(|s| s == "completed")
    .unwrap_or(false);

let is_timeout = active_task_result.get("status")
    .and_then(|s| s.as_str())
    .map(|s| s == "timeout")
    .unwrap_or(false);

// 如果超时，则不算成功
let final_success = success && !is_timeout;
```

### 3. 其他字段解析
```rust
let confidence = active_task_result.get("confidence")
    .and_then(|c| c.as_f64());

let timestamp = active_task_result.get("timestamp")
    .and_then(|t| t.as_i64())
    .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

let duration_ms = active_task_result.get("duration_ms")
    .and_then(|d| d.as_u64())
    .unwrap_or(0);
```

## 数据流程

### 1. Active Task 执行流程
1. **启动检测**：设置检测器为启用状态
2. **等待结果**：监听检测器状态变化
3. **检测成功**：写入 `completed` 状态和置信度
4. **检测超时**：写入 `timeout` 状态
5. **写入 Context**：将结果写入工作流上下文

### 2. Finish Task 处理流程
1. **获取数据**：从上下文中获取 `active_task` 结果
2. **解析状态**：判断是否为成功或超时
3. **处理超时**：超时状态不算成功
4. **保存数据**：将解析后的数据保存到数据库
5. **发送事件**：通知前端处理完成

## 错误处理

### 1. 数据缺失处理
- 如果 `status` 字段缺失，默认为失败
- 如果 `confidence` 字段缺失，使用 `null`
- 如果 `timestamp` 字段缺失，使用当前时间
- 如果 `duration_ms` 字段缺失，使用 `0`

### 2. 超时处理
- 超时状态明确标记为 `"timeout"`
- 超时的检测不算成功（`final_success = false`）
- 超时时置信度为 `null`

## 日志记录

### Active Task 日志
```
ActiveTask: 唤醒前端进行检测，最大检测时间: 30秒
ActiveTask: 检测器被禁用，检测到了唤醒事件，任务完成
ActiveTask: 检测超时 (30秒)，未检测到唤醒事件
```

### Finish Task 日志
```
[finish_task_xxx] 获取到active_task结果: {"status":"completed","confidence":0.85,"duration_ms":2500,"timestamp":1703123456789}
[finish_task_xxx] 解析结果: success=true, is_timeout=false, final_success=true, confidence=Some(0.85), duration_ms=2500
[finish_task_xxx] 唤醒检测结果保存完成
```

## 测试建议

### 1. 成功检测测试
- 验证 `status` 为 `"completed"`
- 验证 `confidence` 有有效值
- 验证 `duration_ms` 大于 0
- 验证 `final_success` 为 `true`

### 2. 超时检测测试
- 验证 `status` 为 `"timeout"`
- 验证 `confidence` 为 `null`
- 验证 `final_success` 为 `false`
- 验证 `duration_ms` 等于超时时间

### 3. 数据完整性测试
- 验证所有必需字段都存在
- 验证数据类型正确
- 验证数值范围合理 