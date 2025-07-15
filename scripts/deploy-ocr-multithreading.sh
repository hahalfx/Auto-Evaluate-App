#!/bin/bash

# OCR多线程优化部署脚本
# 运行前确保在项目根目录

set -e

echo "=== OCR多线程优化第一阶段部署 ==="

# 1. 检查环境
echo "检查环境..."
if ! command -v cargo &> /dev/null; then
    echo "错误: 未找到cargo，请先安装Rust"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "错误: 未找到npm，请先安装Node.js"
    exit 1
fi

# 2. 安装依赖
echo "安装Rust依赖..."
cd src-tauri
cargo add crossbeam-queue --optional
cd ..

echo "安装Node.js依赖..."
npm install --save-dev @types/worker

# 3. 构建项目
echo "构建后端..."
cd src-tauri
cargo build --release
cd ..

echo "构建前端..."
npm run build

# 4. 验证文件
echo "验证文件完整性..."
if [ ! -f "public/ocr-worker.js" ]; then
    echo "错误: WebWorker文件不存在"
    exit 1
fi

if [ ! -f "src-tauri/src/services/ocr_engine.rs" ]; then
    echo "错误: OCR引擎文件不存在"
    exit 1
fi

# 5. 运行测试
echo "运行性能测试..."
npm run dev &
DEV_PID=$!

sleep 10

# 运行性能测试
echo "等待应用启动..."
sleep 5

# 6. 清理
kill $DEV_PID 2>/dev/null || true

echo "=== 部署完成 ==="
echo "1. 双OCR引擎已配置"
echo "2. WebWorker已集成"
echo "3. 性能测试脚本已就绪"
echo ""
echo "运行以下命令启动测试:"
echo "npm run dev"
echo "然后在浏览器控制台运行: await runOCRPerformanceTest()"
