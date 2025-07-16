// OCR Web Worker for 30fps video processing with retry logic
let frameQueue = [];
let isProcessing = false;
let roi = null;

// 消息处理
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'PROCESS_FRAME':
      // 添加帧到队列
      frameQueue.push({
        imageData: data.imageData,
        timestamp: data.timestamp,
        width: data.width,
        height: data.height,
        roi: data.roi,
        retryCount: 0 // 添加重试计数
      });
      
      // 如果队列长度超过阈值，立即处理
      if (frameQueue.length >= 3) {
        processQueue();
      }
      break;
      
    case 'CLEAR_QUEUE':
      frameQueue = [];
      break;
      
    case 'SET_ROI':
      roi = data.roi;
      break;
      
    case 'RETRY_FRAME':
      // 处理重试请求
      if (data.frame && data.frame.retryCount < 3) {
        data.frame.retryCount++;
        frameQueue.unshift(data.frame); // 添加到队列前端优先处理
        processQueue();
      }
      break;
  }
};

// 处理队列中的帧
async function processQueue() {
  if (isProcessing || frameQueue.length === 0) return;
  
  isProcessing = true;
  
  while (frameQueue.length > 0) {
    const frame = frameQueue.shift();
    
    try {
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
      if (frame.retryCount < 3) {
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
  if (frameQueue.length > 0) {
    processQueue();
  }
}, 33); // ~30fps

// 定期清理过期帧（防止内存泄漏）
setInterval(() => {
  const now = Date.now();
  const maxAge = 5000; // 5秒
  
  frameQueue = frameQueue.filter(frame => {
    return (now - frame.timestamp) < maxAge;
  });
}, 1000);
