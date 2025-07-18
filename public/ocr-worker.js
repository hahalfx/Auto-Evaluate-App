// OCR Web Worker for 30fps video processing with immediate stop support
let frameQueue = [];
let isProcessing = false;
let roi = null;
let isStopped = false; // 新增：立即停止标志

// 消息处理
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'PROCESS_FRAME':
      // 如果已停止，直接丢弃帧
      if (isStopped) {
        return;
      }
      
      // 添加帧到队列
      frameQueue.push({
        imageData: data.imageData,
        timestamp: data.timestamp,
        width: data.width,
        height: data.height,
        roi: data.roi,
        retryCount: 0
      });
      
      // 如果队列长度超过阈值，立即处理
      if (frameQueue.length >= 3) {
        processQueue();
      }
      break;
      
    case 'CLEAR_QUEUE':
      // 立即清空队列并停止处理
      frameQueue = [];
      isStopped = true;
      isProcessing = false;
      break;
      
    case 'STOP_PROCESSING':
      // 立即停止所有处理
      isStopped = true;
      frameQueue = [];
      isProcessing = false;
      break;
      
    case 'START_PROCESSING':
      // 重新开始处理
      isStopped = false;
      break;
      
    case 'SET_ROI':
      roi = data.roi;
      break;
      
    case 'RETRY_FRAME':
      // 处理重试请求
      if (data.frame && data.frame.retryCount < 3 && !isStopped) {
        data.frame.retryCount++;
        frameQueue.unshift(data.frame);
        processQueue();
      }
      break;
  }
};

// 处理队列中的帧
async function processQueue() {
  // 防御性检查：如果正在处理、队列是空的、或者已停止，就什么都不做。
  if (isProcessing || frameQueue.length === 0 || isStopped) return;
  
  isProcessing = true;
  
  // 循环处理队列，直到队列为空或收到停止指令。
  while (frameQueue.length > 0 && !isStopped) {
    const frame = frameQueue.shift();
    
    try {
      // 再次检查停止标志
      if (isStopped) {
        isProcessing = false;
        return;
      }
      
      // 发送帧到主线程处理
      self.postMessage({
        type: 'FRAME_QUEUED',
        data: {
          imageData: frame.imageData,
          timestamp: frame.timestamp,
          width: frame.width,
          height: frame.height,
          roi: frame.roi,
          retryCount: frame.retryCount
        }
      });
      
      // 添加小延迟防止阻塞
      await new Promise(resolve => setTimeout(resolve, 1));
    } catch (error) {
      // 如果处理失败且重试次数未达上限，重新加入队列
      if (frame.retryCount < 3 && !isStopped) {
        frame.retryCount++;
        frameQueue.unshift(frame);
        console.warn(`帧处理失败，重试 ${frame.retryCount}/3:`, error);
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        console.error('帧处理失败，已达最大重试次数:', error);
        self.postMessage({
          type: 'ERROR',
          data: {
            message: error.message,
            frame: frame
          }
        });
      }
    }
  }
  
  isProcessing = false;
}

// 定期处理队列（防止积压）
setInterval(() => {
  if (frameQueue.length > 0 && !isStopped) {
    processQueue();
  }
}, 33); // ~30fps

// 定期清理过期帧（防止内存泄漏）
setInterval(() => {
  if (isStopped) return; // 如果已停止，不清理
  
  const now = Date.now();
  const maxAge = 5000; // 5秒
  
  frameQueue = frameQueue.filter(frame => {
    return (now - frame.timestamp) < maxAge;
  });
}, 1000);
