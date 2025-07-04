use crate::models::Task;
use crate::db::database::DatabaseService;
use tauri::State;
use std::sync::Arc;
use crate::state::AppState;
use tokio::runtime;
pub struct TaskService{

}

impl TaskService{ 
    pub async fn create_task(state: State<'_, Arc<AppState>>, new_task: Task)-> Result<i64, String>{
        state.db.create_task(&new_task).await
        .map_err(|e| format!("创建任务失败: {}", e))
    }

    pub async fn delete_task(state: State<'_, Arc<AppState>>, task_id: i64)-> Result<(), String>{
        state.db.delete_task(task_id).await
        .map_err(|e| format!("删除任务失败: {}", e))
    }

    pub async fn get_all_tasks(state: State<'_, Arc<AppState>>)-> Result<Vec<Task>, String>{
        state.db.get_all_tasks().await
        .map_err(|e| format!("获取任务列表失败: {}", e))
    }

    pub async fn get_task_by_id(state: State<'_, Arc<AppState>>, task_id: i64)-> Result<Task, String>{
        state.db.get_task_by_id(task_id).await
        .map_err(|e| format!("获取任务失败: {}", e))?
        .ok_or_else(|| format!("任务ID {} 不存在", task_id))
    }
    
    pub fn start_test(state: State<'_, Arc<AppState>>, task_id: i64) -> Result<String, String> {
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| format!("创建运行时失败: {}", e))?;
        
        let task = rt.block_on(async {
            TaskService::get_task_by_id(state, task_id).await
        }).map_err(|e| format!("开始自动化测试任务失败: {}", e))?;

        
        
        Ok(format!("任务 {} (名称:{}) 测试已开始", task_id, task.name))
    }
}