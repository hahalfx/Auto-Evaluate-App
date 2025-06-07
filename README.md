# 车机语音LLM自动化评估系统

一个基于 **Tauri** 和 **Next.js** 构建的桌面应用，专注于自动化测试和评估车载语音助手的响应质量。

## 核心功能

- **任务管理**: 创建、配置和执行测试任务，跟踪任务状态和进度。
- **用例管理**:
  - **测试样本**: 管理用于测试的指令文本和关联音频文件。
  - **唤醒词**: 管理用于激活语音助手的唤醒词和音频。
- **自动化测试**: 启动后，应用将自动执行预定义的测试流程，包括播放唤醒词、播放测试指令、并准备记录响应。
- **分析与报告**: (功能待实现) 对车机响应进行分析，并生成多维度评估报告。
- **本地数据持久化**: 所有任务、样本和配置都安全地存储在本地的 SQLite 数据库中。

## 技术栈

### 前端

- **框架**: Next.js 15.2.4 (App Router)
- **UI**: Shadcn UI, Radix UI, Tailwind CSS
- **状态管理**: Redux Toolkit
- **表单**: React Hook Form + Zod
- **图表**: Recharts
- **表格**: TanStack Table
- **类型系统**: TypeScript 5

### 后端

- **框架**: Tauri v2
- **语言**: Rust
- **异步运行时**: Tokio
- **数据库**: SQLx + SQLite
- **HTTP客户端**: Reqwest
- **核心库**: Serde, Chrono, Uuid

## 系统架构

```mermaid
graph TD
    subgraph "用户界面 (Frontend - Next.js)"
        direction LR
        Dashboard[仪表盘]
        TaskManagement[任务管理]
        CaseManagement[用例管理]
    end

    subgraph "核心 (Tauri Core)"
        WebView[WebView]
        CommandBridge[Rust-JS Command Bridge]
    end

    subgraph "应用后端 (Backend - Rust)"
        direction LR
        TauriCommands[Tauri Commands]
        AnalysisService[分析服务]
        Database[数据库模块 (SQLx)]
    end

    subgraph "数据存储"
        SQLite[SQLite Database]
    end

    Dashboard --> CommandBridge
    TaskManagement --> CommandBridge
    CaseManagement --> CommandBridge

    CommandBridge -- Invokes --> TauriCommands

    TauriCommands -- Uses --> AnalysisService
    TauriCommands -- Accesses --> Database
    AnalysisService -- Accesses --> Database

    Database -- Interacts with --> SQLite
```

## 快速开始

### 环境要求

- **Node.js**: v18+
- **Rust**: v1.77+ (with Cargo)
- **Tauri CLI**: `cargo install tauri-cli`

### 安装与运行

1.  **克隆仓库**
    ```bash
    git clone [仓库地址]
    cd [仓库目录]
    ```

2.  **安装前端依赖**
    ```bash
    npm install
    ```

3.  **启动开发环境**
    此命令会同时启动 Next.js 前端开发服务器和 Tauri 后端应用。
    ```bash
    npm run tauri dev
    ```

## 项目结构

```
/LLM Analysis Interface
├── app/                    # Next.js 应用路由和页面
├── components/             # React 组件
├── hooks/                  # 自定义 React Hooks
├── lib/                    # 工具函数和上下文
├── public/                 # 静态资源
├── services/               # Tauri API 调用封装
├── store/                  # Redux Toolkit 状态管理
├── types/                  # TypeScript 类型定义
└── src-tauri/              # Tauri 后端 (Rust)
    ├── src/
    │   ├── analysis_service.rs # 自动化测试核心逻辑
    │   ├── commands.rs     # 暴露给前端的Tauri指令
    │   ├── database.rs     # 数据库交互模块
    │   ├── lib.rs          # Rust库入口
    │   ├── models.rs       # 数据模型定义
    │   └── state.rs        # 应用状态管理
    ├── Cargo.toml          # Rust 依赖管理
    └── tauri.conf.json     # Tauri 应用配置
```

## 后端核心指令 (Tauri Commands)

应用通过一系列Tauri指令实现前后端通信。以下是部分核心指令：

- **任务管理**:
  - `get_all_tasks`: 获取所有测试任务。
  - `create_task`: 创建一个新任务。
  - `delete_task`: 删除一个任务。
  - `set_current_task`: 设置当前活动任务。
  - `get_task_progress`: 获取当前任务的执行进度。
- **样本管理**:
  - `get_all_samples`: 获取所有测试样本。
  - `create_sample`: 创建单个测试样本。
  - `create_samples_batch`: 批量创建测试样本。
  - `delete_sample`: 删除一个测试样本。
- **自动化测试**:
  - `start_automated_test`: 启动自动化测试流程。
  - `stop_testing`: 停止当前的测试流程。
  - `submit_analysis`: 提交车机响应以供分析。

## 开发脚本

```bash
# 启动Tauri开发环境 (推荐)
npm run tauri dev

# 仅启动Next.js前端开发服务器
npm run dev

# 构建生产版本的Tauri应用
npm run tauri build

# 启动Next.js生产服务器
npm run start

# 代码风格检查
npm run lint
