class OCRWorker {
    constructor() {
        this.frameQueue = [];
        this.isProcessing = false;
        this.frameId = 0;
        this.maxQueueSize = 10;
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
        
        // 保持队列大小，防止内存泄漏
        if (this.frameQueue.length > this.maxQueueSize) {
            this.frameQueue.shift();
        }
        
        // 发送回主线程
        self.postMessage({
            type: 'FRAME_QUEUED',
            data: frame
        });
        
        return frame;
    }

    clearQueue() {
        this.frameQueue = [];
        this.frameId = 0;
    }

    getQueueSize() {
        return this.frameQueue.length;
    }
}

// 创建worker实例
const worker = new OCRWorker();

// WebWorker消息处理
self.onmessage = async (e) => {
    const { type, data } = e.data;
    
    switch (type) {
        case 'PROCESS_FRAME':
            await worker.processFrame(
                data.imageData, 
                data.roi, 
                data.timestamp
            );
            break;
            
        case 'CLEAR_QUEUE':
            worker.clearQueue();
            break;
            
        case 'GET_QUEUE_SIZE':
            self.postMessage({
                type: 'QUEUE_SIZE',
                data: worker.getQueueSize()
            });
            break;
            
        default:
            console.warn('Unknown message type:', type);
    }
};

// 错误处理
self.onerror = (error) => {
    console.error('OCR Worker error:', error);
    self.postMessage({
        type: 'ERROR',
        data: error.message
    });
};
