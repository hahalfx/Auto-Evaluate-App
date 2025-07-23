# 任务包导入功能实现总结

## 概述
本次更新实现了通过导入任务包的方式新建任务的功能，同时修复了将Task结构从单个唤醒词改为多个唤醒词时产生的相关问题。**最新更新完善了重复检查逻辑，支持基于文本和音频文件路径的智能重复判断。**

## 主要修改

### 1. 数据库结构修改

#### 新增表结构
- **task_wake_words表**: 用于存储任务和唤醒词的多对多关系
  ```sql
  CREATE TABLE task_wake_words (
      task_id INTEGER NOT NULL,
      wake_word_id INTEGER NOT NULL,
      PRIMARY KEY (task_id, wake_word_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (wake_word_id) REFERENCES wake_words(id) ON DELETE CASCADE
  )
  ```

#### 修改表结构
- **tasks表**: 移除了wake_word_id字段，改为使用关联表
- **test_samples表**: 添加了audio_file字段
- **wake_words表**: 添加了audio_file字段

### 2. Rust后端修改

#### 模型更新 (src-tauri/src/models.rs)
- 修改`Task`结构体：`wake_word_id: u32` → `wake_word_ids: Vec<u32>`
- 新增`TaskWakeWordRow`结构体用于数据库查询
- 更新`TaskRow`结构体，移除wake_word_id字段

#### 数据库操作更新 (src-tauri/src/db/database.rs)
- 修改`create_task`函数：支持多个唤醒词关联
- 修改`get_task_by_id`函数：从关联表获取唤醒词ID
- 新增任务-唤醒词关联表的创建和查询逻辑
- **新增重复检查函数**：
  - `check_wake_word_exists()`: 基于文本和音频文件路径检查唤醒词是否存在
  - `check_sample_exists()`: 基于文本和音频文件路径检查测试语料是否存在
  - `precheck_wake_words()`: 批量预检查唤醒词重复性
  - `precheck_samples_with_files()`: 批量预检查测试语料重复性

#### 命令更新 (src-tauri/src/commands.rs)
- 修改`create_task`命令：支持多个唤醒词参数
- 新增`import_task_package`命令：实现任务包导入功能
- 新增Excel文件读取功能：使用calamine库读取Excel文件
- **集成重复检查**：在`import_task_package`命令中直接使用数据库预检查函数
- **新增路径规范化函数**：`normalize_path()` 统一处理文件路径格式

#### 依赖更新 (src-tauri/Cargo.toml)
- 添加`calamine = "0.25"`用于Excel文件读取
- 添加`tauri-plugin-dialog = "2.0.0"`用于文件对话框

### 3. 前端修改

#### 类型定义更新
- **types/api.ts**: `wake_word_id: number` → `wake_word_ids: number[]`
- **types/tauri.ts**: `wake_word_id: number` → `wake_word_ids: number[]`

#### API服务更新 (services/tauri-api.ts)
- 修改`createTask`方法：支持多个唤醒词参数
- 新增`importTaskPackage`方法：调用任务包导入API
- **数据库预检查函数**（仅在导入指令内部使用）：
  - `precheck_wake_words()`: 检查唤醒词重复
  - `precheck_samples_with_files()`: 检查测试语料重复

#### Hook更新 (hooks/useTauriTasks.ts)
- 修改`createTask`方法：支持多个唤醒词参数

#### 组件更新
- **components/create-task.tsx**: 
  - 支持多选唤醒词
  - 新增任务包导入模式
  - 添加文件夹选择功能
  - 显示任务包结构说明
  - **集成重复检查功能**：
    - 导入时自动进行重复检查
    - 导入结果显示重复检查统计
    - 智能重复判断说明

- **components/taskmanage.tsx**: 
  - 更新任务详情显示：支持显示多个唤醒词

#### 其他修复
- **hooks/useLLMAnalysis.ts**: 修复wake_word_id引用
- **hooks/useExportCurrentTask.ts**: 修复wake_word_id引用
- **app/api/test-tasks/route.ts**: 修复API验证逻辑

### 4. 配置文件更新

#### Tauri配置 (src-tauri/tauri.conf.json)
- 添加dialog插件配置

#### 前端依赖 (package.json)
- 添加`@tauri-apps/plugin-dialog = "^2.0.0"`

## 任务包导入功能

### 任务包结构要求
```
任务包文件夹/
├── 唤醒词语料列表.xlsx    # 第一列：文件名，第二列：语料名
├── 测试语料列表.xlsx      # 第一列：文件名，第二列：语料名
└── audio/
    ├── wakeword/          # 唤醒词音频文件
    └── samples/           # 测试语料音频文件
```

### Excel文件格式
- 第一列：音频文件名（如：1小度小度.wav）
- 第二列：对应的语料文本（如：小度小度）
- 第一行为标题行，会被自动跳过

### 导入流程
1. 用户选择"导入任务包"模式
2. 输入任务名称
3. 选择任务包文件夹
4. 系统自动：
   - 读取Excel文件
   - **智能重复检查**（基于文本+音频文件路径）
   - 创建唤醒词和测试语料
   - 关联音频文件
   - 创建任务
   - 显示导入结果（包含重复检查统计）

## 智能重复检查机制

### 重复判断逻辑
1. **完全匹配**：文本内容相同 + 音频文件路径相同 → 视为重复
2. **部分匹配**：文本内容相同 + 音频文件路径不同 → 视为新数据
3. **无音频文件**：文本内容相同 + 都无音频文件 → 视为重复

### 重复检查优势
- **避免数据冗余**：相同内容不会重复创建
- **支持版本管理**：相同文本但不同音频文件可以作为新版本
- **路径规范化**：统一处理不同操作系统的路径格式
- **预检查功能**：导入前可预览重复情况

### 重复检查示例
```
数据库现有：
- 唤醒词："小度小度" (音频: /path1/audio1.wav)
- 测试语料："打开音乐" (音频: /path2/audio2.wav)

导入任务包包含：
- 唤醒词："小度小度" (音频: /path1/audio1.wav) → 重复，使用现有ID
- 唤醒词："小度小度" (音频: /path3/audio3.wav) → 新数据，创建新记录
- 测试语料："打开音乐" (无音频) → 重复，使用现有ID
- 测试语料："关闭音乐" (音频: /path4/audio4.wav) → 新数据，创建新记录
```

## 兼容性说明

### 数据库迁移
- 旧的任务数据中的wake_word_id字段仍然保留在数据库中
- 新创建的任务使用task_wake_words关联表
- 系统会自动处理新旧数据的兼容性

### 前端兼容性
- 所有相关的类型定义和API调用都已更新
- 现有的任务管理功能继续正常工作
- 新增的多选唤醒词功能向后兼容

## 测试建议

1. **基本功能测试**
   - 创建包含多个唤醒词的任务
   - 验证任务详情显示多个唤醒词
   - 测试任务包导入功能

2. **重复检查测试**
   - 测试完全重复的数据（文本+路径相同）
   - 测试部分重复的数据（文本相同，路径不同）
   - 测试无音频文件的重复数据
   - 验证导入时的重复检查功能

3. **数据完整性测试**
   - 验证数据库中的关联关系正确
   - 检查音频文件路径是否正确保存
   - 确认重复数据使用现有ID

4. **错误处理测试**
   - 测试无效的任务包结构
   - 测试缺失的Excel文件
   - 测试音频文件不存在的情况
   - 测试路径规范化功能

## 注意事项

1. **Excel文件格式**: 必须严格按照两列格式，第一行为标题
2. **音频文件**: 文件名必须与Excel中的文件名完全匹配
3. **文件路径**: 支持中文路径，但建议使用英文路径避免编码问题
4. **数据库**: 首次运行时会自动创建新的表结构
5. **重复检查**: 基于文本内容和音频文件路径的组合进行判断
6. **路径规范化**: 自动统一不同操作系统的路径分隔符

## 后续优化建议

1. **批量导入**: 支持多个任务包同时导入
2. **导入模板**: 提供标准的Excel模板下载
3. **进度显示**: 为大型任务包导入添加进度条
4. **错误恢复**: 添加导入失败时的回滚机制
5. **版本管理**: 支持同一语料的多版本管理
6. **导入历史**: 记录导入历史，支持回滚操作 