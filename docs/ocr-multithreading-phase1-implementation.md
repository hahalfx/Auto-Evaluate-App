# 视频实时OCR多线程优化 - 第一阶段实施文档

## 项目概述
本文档详细描述了视频实时OCR系统第一阶段多线程优化的技术实施方案，目标是将FPS从30提升至60（2倍性能提升）。

## 实施目标
- **性能提升**：FPS 30 → 60（2倍）
- **延迟优化**：单帧处理时间 200ms → 100ms
- **内存控制**：增加内存使用 < 300MB
- **稳定性**：保持现有功能兼容性

## 架构设计

### 双线程架构
```
前端(React) → WebWorker → Tauri后端 → 双OCR引擎
```

### 核心组件
1. **前端WebWorker**：独立线程处理图像采集
2. **双OCR引擎**：2个独立Tesseract实例
3. **帧队列**：无锁环形缓冲区（容量=10帧）
4. **负载均衡**：简单轮询调度

## 技术实施步骤

### 步骤1：创建WebWorker (1天)

#### 1.1 创建WebWorker文件
```typescript
// public/ocr-worker.js
class OCRWorker {
    constructor() {
        this.frameQueue = [];
        this.isProcessing = false;
        this.frameId = 0;
    }

    async processFrame(imageData, roi, timestamp) {
        const frame = {
            id: this.frameId++,
            imageData,
            roi,
            timestamp,
            processed: false
        };
        
        this.frameQueue.push(frame);
        
        // 保持队列大小
        if (this.frameQueue.length > 10) {
            this.frameQueue.shift();
        }
        
        return frame;
    }
}

// WebWorker消息处理
self.onmessage = async (e) => {
    const { type, data } = e.data;
    
    switch (type) {
        case 'PROCESS_FRAME':
            const result = await worker.processFrame(
                data.imageData, 
                data.roi, 
                data.timestamp
            );
            self.postMessage({ type: 'FRAME_QUEUED', data: result });
            break;
    }
};
```

#### 1.2 集成到现有组件
```typescript
// components/ocr.tsx 修改部分
const workerRef = useRef<Worker | null>(null);

useEffect(() => {
    // 初始化WebWorker
    workerRef.current = new Worker('/ocr-worker.js');
    
    workerRef.current.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'FRAME_QUEUED') {
            // 发送到后端处理
            sendFrameToBackend(data);
        }
    };
    
    return () => {
        workerRef.current?.terminate();
    };
}, []);
```

### 步骤2：后端双引擎实现 (2天)

#### 2.1 修改状态结构
```rust
// src-tauri/src/state.rs 新增
use std::sync::Arc;
use tokio::sync::Mutex;
use tesseract::Tesseract;

pub struct OcrEnginePool {
    engines: Vec<Arc<Mutex<Option<Tesseract>>>>,
    current_index: AtomicUsize,
}

impl OcrEnginePool {
    pub fn new(size: usize) -> Self {
        let mut engines = Vec::with_capacity(size);
        for _ in 0..size {
            engines.push(Arc::new(Mutex::new(None)));
        }
        
        Self {
            engines,
            current_index: AtomicUsize::new(0),
        }
    }
    
    pub async fn get_engine(&self) -> Arc<Mutex<Option<Tesseract>>> {
        let index = self.current_index.fetch_add(1, Ordering::Relaxed) % self.engines.len();
        self.engines[index].clone()
    }
}
```

#### 2.2 修改AppState
```rust
// src-tauri/src/state.rs 修改
pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub ocr_channel: Arc<Mutex<Option<Channel<InvokeResponseBody>>>>,
    pub ocr_engine: Arc<Mutex<Option<Tesseract>>>,
    pub ocr_pool: Arc<OcrEnginePool>, // 新增
}
```

### 步骤3：实现双引擎初始化 (1天)

#### 3.1 修改初始化函数
```rust
// src-tauri/src/services/ocr_engine.rs 新增
pub async fn initialize_ocr_pool(
    state: &AppState,
    app_handle: &tauri::AppHandle,
    pool_size: usize,
) -> anyhow::Result<()> {
    println!("Initializing OCR engine pool with size: {}", pool_size);
    
    let tessdata_path = app_handle
        .path()
        .resolve("tessdata", tauri::path::BaseDirectory::Resource)?;
    
    std::env::set_var("TESSDATA_PREFIX", &tessdata_path);
    
    let pool = &state.ocr_pool;
    
    // 并行初始化所有引擎
    let mut handles = vec![];
    for i in 0..pool_size {
        let tessdata_path_clone = tessdata_path.clone();
        let engine_arc = pool.engines[i].clone();
        
        let handle = tokio::task::spawn_blocking(move || {
            let mut engine = Tesseract::new_with_oem(
                Some(tessdata_path_clone.to_str().unwrap()),
                Some("chi_sim+eng"),
                OcrEngineMode::LstmOnly,
            )?;
            
            engine.set_page_seg_mode(PageSegMode::PsmAuto);
            *engine_arc.blocking_lock() = Some(engine);
            
            Ok::<(), anyhow::Error>(())
        });
        
        handles.push(handle);
    }
    
    // 等待所有引擎初始化完成
    for handle in handles {
        handle.await??;
    }
    
    println!("All OCR engines initialized successfully");
    Ok(())
}
```

### 步骤4：修改perform_ocr命令 (1天)

#### 4.1 使用引擎池
```rust
// src-tauri/src/services/ocr_engine.rs 修改
#[tauri::command]
pub async fn perform_ocr(
    image_data: Vec<u8>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let channel_clone = match state.ocr_channel.lock().await.as_ref() {
        Some(channel) => channel.clone(),
        None => return Err("OCR session not started.".to_string()),
    };
    
    // 从引擎池获取实例
    let engine_arc = state.ocr_pool.get_engine().await;
    
    tokio::spawn(async move {
        let task_result = tokio::task::spawn_blocking(move || {
            let mut engine_guard = engine_arc.lock().await;
            
            if let Some(tesseract) = engine_guard.take() {
                // 原有OCR逻辑保持不变
                let img = image::load_from_memory(&image_data)
                    .map_err(|e| anyhow!("图像解码失败: {}", e))?;
                
                let width = img.width();
                let height = img.height();
                
                let mut recognized_tesseract = tesseract.set_frame(
                    img.as_bytes(),
                    width as i32,
                    height as i32,
                    4,
                    width as i32 * 4,
                )?;
                
                let tsv_data = recognized_tesseract.get_tsv_text(0)?;
                let ocr_lines = parse_tsv_data(&tsv_data)?;
                let final_sentences = merge_lines_into_sentences(&ocr_lines);
                
                *engine_guard = Some(recognized_tesseract);
                Ok(final_sentences)
            } else {
                Err(anyhow!("OCR engine not available"))
            }
        }).await;
        
        // 结果处理保持不变...
    });
    
    Ok(())
}
```

### 步骤5：前端集成优化 (1天)

#### 5.1 修改captureAndSend函数
```typescript
// components/ocr.tsx 修改
const captureAndSend = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.paused) return;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    // ROI处理保持不变...
    
    try {
        const startTime = performance.now();
        
        // 使用WebWorker预处理
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'PROCESS_FRAME',
                data: {
                    imageData: encodedImageBytes,
                    roi: roiRef.current,
                    timestamp: Date.now()
                }
            });
        } else {
            // 回退到直接调用
            await invoke("perform_ocr", { imageData: encodedImageBytes });
        }
        
        const endTime = performance.now();
        setLastInferenceTime((endTime - startTime) / 1000);
    } catch (error) {
        // 错误处理保持不变...
    }
}, [toast]);
```

### 步骤6：配置和测试 (1天)

#### 6.1 添加配置参数
```rust
// src-tauri/src/config.rs 新增
pub struct OcrConfig {
    pub pool_size: usize,
    pub max_queue_size: usize,
    pub enable_worker: bool,
}

impl Default for OcrConfig {
    fn default() -> Self {
        Self {
            pool_size: 2,  // 第一阶段使用2个引擎
            max_queue_size: 10,
            enable_worker: true,
        }
    }
}
```

#### 6.2 性能测试脚本
```typescript
// tests/ocr-performance.test.ts
describe('OCR Performance Tests', () => {
    test('should achieve 60 FPS with dual engines', async () => {
        const results = await runPerformanceTest({
            duration: 10000, // 10秒
            targetFps: 60,
            engineCount: 2
        });
        
        expect(results.avgFps).toBeGreaterThan(55);
        expect(results.maxLatency).toBeLessThan(150);
    });
});
```

## 部署步骤

### 1. 环境准备
```bash
# 安装依赖
cargo add crossbeam-queue
npm install --save-dev @types/worker

# 创建WebWorker文件
mkdir public
touch public/ocr-worker.js
```

### 2. 代码集成
```bash
# 按步骤1-6逐步集成
# 每完成一个步骤运行测试
cargo test ocr_engine_tests
npm test ocr-performance
```

### 3. 性能验证
```bash
# 启动性能监控
cargo run --bin ocr-benchmark -- --engines 2 --duration 30

# 预期结果
# FPS: 58-62
# 内存使用: +250MB
# 延迟: 80-120ms
```

## 回滚方案
如果出现问题，可以快速回滚：
1. 设置环境变量 `OCR_ENGINE_COUNT=1`
2. 禁用WebWorker `ENABLE_WORKER=false`
3. 恢复原始单引擎实现

## 监控指标
- **实时FPS**：目标>55
- **内存使用**：<500MB增长
- **错误率**：<1%
- **延迟分布**：P95<150ms

## 下一步计划
完成第一阶段后，评估性能指标，决定是否进入第二阶段（完整流水线架构）。
