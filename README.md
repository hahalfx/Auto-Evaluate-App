# LLM 分析界面

基于 Next.js 构建的 LLM 测试样本管理与分析平台

## 功能特性

- 测试样本管理（创建/编辑/删除）
- 实时分析结果可视化展示
- 支持多维度评分系统
- 响应式布局适配不同设备
- 暗黑/明亮主题切换
- 交互式数据表格 (TanStack Table)
- API 状态监控

## 技术栈

- **框架**: Next.js 15.2.4
- **UI 库**: Radix UI 组件 + Shadcn UI
- **样式**: Tailwind CSS 3.4 + 动画插件
- **状态管理**: React Hook Form + Zod 验证
- **可视化**: Recharts 2.15
- **工具库**: date-fns, clsx, tailwind-merge
- **类型安全**: TypeScript 5

## 快速开始

### 环境要求
- Node.js 18+
- npm 9+

### 安装步骤
```bash
# 克隆仓库
git clone [仓库地址]

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000 查看应用

## 项目结构
```
/LLM Analysis Interface
├── app/               # Next.js 应用路由
├── components/        # 可复用组件
│   ├── ui/           # Shadcn UI 组件库
│   └── ...           # 业务组件
├── services/         # API 服务层
├── types/            # TypeScript 类型定义
├── public/           # 静态资源
└── styles/           # 全局样式
```
## 核心功能实现

### API 服务
- RESTful API 路由 (`app/api/`)
- 测试样本 CRUD 操作
- 语音识别接口
- 分析结果处理

### 特色组件
- 动态数据表格 (支持排序/过滤/分页)
- 实时评分展示系统
- 响应式导航栏
- 主题切换器 (next-themes)
- 可视化图表 (Recharts)

## 开发脚本
```bash
# 启动开发服务器
npm run dev

# 生产构建
npm run build

# 启动生产服务器 
npm run start

# 代码检查
npm run lint
```

## 贡献指南
欢迎提交 Pull Request，请确保：
1. 遵循现有代码风格
2. 添加对应的类型定义
3. 更新相关文档

## 许可证
MIT
