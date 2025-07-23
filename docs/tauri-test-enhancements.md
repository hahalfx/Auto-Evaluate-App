# Tauri Test 界面增强功能

## 概述

为 `tauri-test` 界面新增了完整的数据库字段显示功能，让开发者能够查看数据库中唤醒词和语料的所有字段数据，包括原始数据库记录。

## 新增功能

### 1. 详细字段显示

#### 样本列表增强
- **基本信息**：ID、文本、状态、重复次数
- **音频信息**：音频文件路径
- **测试结果**：关联的测试结果数据（JSON格式）
- **数据库原始字段**：完整的数据库记录（可选显示）

#### 唤醒词列表增强
- **基本信息**：ID、文本
- **音频信息**：音频文件路径
- **数据库原始字段**：完整的数据库记录（可选显示）

### 2. 交互式界面

#### 可折叠显示
- 使用 `Collapsible` 组件实现可展开/折叠的详细信息
- 点击项目可展开查看所有字段
- 支持同时展开多个项目

#### 原始数据切换
- 新增"显示原始数据"按钮
- 可切换显示/隐藏数据库原始字段
- 实时显示完整的数据库记录

### 3. 视觉增强

#### 图标和标签
- 使用 `Database` 图标标识数据库相关功能
- 使用 `FileAudio` 图标标识音频文件
- 使用 `Info` 图标标识基本信息
- 添加徽章显示音频文件状态

#### 布局优化
- 使用网格布局组织字段信息
- 添加分隔线区分不同部分
- 使用滚动区域处理大量数据
- 响应式设计支持不同屏幕尺寸

## 技术实现

### 后端新增API

#### 数据库服务 (src-tauri/src/db/database.rs)
```rust
// 获取样本原始数据
pub async fn get_all_samples_raw(&self) -> Result<Vec<TestSampleRow>>

// 获取唤醒词原始数据
pub async fn get_all_wake_words_raw(&self) -> Result<Vec<WakeWordRow>>
```

#### Tauri命令 (src-tauri/src/commands.rs)
```rust
// 获取样本原始数据命令
pub async fn get_all_samples_raw(state: State<'_, Arc<AppState>>) -> Result<Vec<TestSampleRow>, String>

// 获取唤醒词原始数据命令
pub async fn get_all_wake_words_raw(state: State<'_, Arc<AppState>>) -> Result<Vec<WakeWordRow>, String>
```

#### 命令注册 (src-tauri/src/lib.rs)
```rust
// 注册新的API命令
commands::get_all_samples_raw,
commands::get_all_wake_words_raw,
```

### 前端实现

#### API服务 (services/tauri-api.ts)
```typescript
// 获取样本原始数据
static async getAllSamplesRaw(): Promise<any[]>

// 获取唤醒词原始数据
static async getAllWakeWordsRaw(): Promise<any[]>
```

#### 状态管理
```typescript
// 新增状态
const [samplesRaw, setSamplesRaw] = useState<any[]>([]);
const [wakeWordsRaw, setWakeWordsRaw] = useState<any[]>([]);
const [showRawData, setShowRawData] = useState(false);
const [expandedSamples, setExpandedSamples] = useState<Set<number>>(new Set());
const [expandedWakeWords, setExpandedWakeWords] = useState<Set<number>>(new Set());
```

#### UI组件
- `Collapsible`：可折叠内容
- `ScrollArea`：滚动区域
- `Badge`：状态徽章
- `Separator`：分隔线
- `Button`：切换按钮

## 数据库字段说明

### TestSampleRow 字段
```rust
pub struct TestSampleRow {
    pub id: i64,                    // 主键ID
    pub text: String,               // 样本文本
    pub audio_file: Option<String>, // 音频文件路径
    pub status: Option<String>,     // 状态
    pub repeats: Option<i64>,       // 重复次数
    pub created_at: String,         // 创建时间
}
```

### WakeWordRow 字段
```rust
pub struct WakeWordRow {
    pub id: i64,                    // 主键ID
    pub text: String,               // 唤醒词文本
    pub audio_file: Option<String>, // 音频文件路径
    pub created_at: String,         // 创建时间
}
```

## 使用说明

### 基本操作
1. 打开 tauri-test 页面
2. 点击"刷新数据"加载最新数据
3. 点击任意样本或唤醒词项目展开详细信息
4. 点击"显示原始数据"按钮查看数据库原始字段

### 数据查看
- **基本信息**：显示处理后的业务数据
- **音频信息**：显示音频文件相关字段
- **数据库原始字段**：显示完整的数据库记录（JSON格式）
- **测试结果**：显示关联的测试结果（如果有）

### 界面交互
- 点击项目标题展开/折叠详细信息
- 使用"显示原始数据"按钮切换原始字段显示
- 支持同时展开多个项目进行对比
- 滚动区域支持大量数据的浏览

## 优势

### 1. 开发调试
- 快速查看数据库中的实际数据
- 对比业务数据和原始数据的差异
- 调试数据转换和处理逻辑

### 2. 数据验证
- 验证数据完整性
- 检查字段值的正确性
- 确认数据关联关系

### 3. 用户体验
- 直观的字段分组显示
- 灵活的展开/折叠操作
- 清晰的数据层次结构

### 4. 性能优化
- 按需加载原始数据
- 支持大量数据的滚动浏览
- 响应式布局适配不同设备

## 扩展性

### 未来可添加的功能
1. **数据编辑**：直接在界面中编辑字段值
2. **数据导出**：导出原始数据为CSV/JSON格式
3. **数据搜索**：按字段值搜索特定记录
4. **数据统计**：显示字段值的统计信息
5. **数据对比**：对比不同记录的字段差异

### 技术扩展
1. **实时更新**：支持数据库变更的实时通知
2. **权限控制**：根据用户权限显示/隐藏敏感字段
3. **数据缓存**：优化大量数据的加载性能
4. **自定义视图**：允许用户自定义显示的字段组合 