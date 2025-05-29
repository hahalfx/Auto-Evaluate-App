use std::sync::Arc;
use crate::database::DatabaseService;

#[derive(Debug, Clone)]
pub struct AppState {
    pub db: Arc<DatabaseService>,
    pub current_task_id: Arc<tokio::sync::RwLock<Option<i64>>>,
    pub is_testing: Arc<tokio::sync::RwLock<bool>>,
}

impl AppState {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        let db = Arc::new(DatabaseService::new(database_url).await?);
        
        // 初始化默认数据
        db.initialize_default_data().await?;
        
        Ok(Self {
            db,
            current_task_id: Arc::new(tokio::sync::RwLock::new(None)),
            is_testing: Arc::new(tokio::sync::RwLock::new(false)),
        })
    }
}
