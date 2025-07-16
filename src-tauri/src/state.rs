use crate::db::database::DatabaseService;
use crate::models::VideoFrame;
use crate::services::audio_controller::AudioController;
use crate::services::ocr_session::OcrSessionManager;
use crate::services::workflow::ControlHandle;
use std::sync::Arc;
use serde::de::Expected;
use tauri::ipc::Channel;
use tokio::sync::Mutex;
use reqwest::Client;
use parking_lot::Mutex as ParkingLotMutex;
use tesseract::Tesseract;
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Clone)]
pub struct OcrEnginePool {
    pub engines: Vec<Arc<ParkingLotMutex<Option<Tesseract>>>>,
    pub current_index: Arc<AtomicUsize>,
}

impl OcrEnginePool {
    pub fn new(size: usize) -> Self {
        let mut engines = Vec::with_capacity(size);
        for _ in 0..size {
            engines.push(Arc::new(ParkingLotMutex::new(None)));
        }
        
        Self {
            engines,
            current_index: Arc::new(AtomicUsize::new(0)),
        }
    }
    
    pub fn get_engine(&self) -> Arc<ParkingLotMutex<Option<Tesseract>>> {
        let index = self.current_index.fetch_add(1, Ordering::Relaxed) % self.engines.len();
        self.engines[index].clone()
    }
}

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<DatabaseService>,
    pub current_task_id: Arc<tokio::sync::RwLock<Option<i64>>>,
    pub is_testing: Arc<tokio::sync::RwLock<bool>>,
    pub audio_controller: AudioController,
    pub workflow_handle: Arc<Mutex<Option<ControlHandle>>>,
    pub http_client: Client,
    pub ocr_engine: Arc<ParkingLotMutex<Option<Tesseract>>>,
    pub ocr_channel: Arc<Mutex<Option<Channel>>>,
    pub ocr_pool: Arc<OcrEnginePool>,
    pub ocr_session_manager: Arc<parking_lot::Mutex<OcrSessionManager>>,
    pub ocr_frame_sender: Arc<tokio::sync::Mutex<Option<tokio::sync::mpsc::Sender<VideoFrame>>>>,
}

impl AppState {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        let db = Arc::new(DatabaseService::new(database_url).await?);

        // 初始化默认数据
        db.initialize_default_data().await?;

        let (audio_controller, _audio_task_handle) = AudioController::new();

        Ok(Self {
            db,
            current_task_id: Arc::new(tokio::sync::RwLock::new(None)),
            is_testing: Arc::new(tokio::sync::RwLock::new(false)),
            audio_controller,
            workflow_handle: Arc::new(Mutex::new(None)),
            http_client: Client::new(),
            ocr_engine: Arc::new(ParkingLotMutex::new(None)),
            ocr_channel: Arc::new(Mutex::new(None)),
            ocr_pool: Arc::new(OcrEnginePool::new(6)), // 第一阶段使用2个引擎
            ocr_session_manager: Arc::new(parking_lot::Mutex::new(OcrSessionManager::new())),
            ocr_frame_sender: Arc::new(tokio::sync::Mutex::new(None)),
        })
    }
}
