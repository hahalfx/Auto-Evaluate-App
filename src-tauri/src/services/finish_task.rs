use async_trait::async_trait;
use std::error::Error;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::watch;

use crate::db::database::DatabaseService; // 假设您的数据库服务类型路径是这个
use crate::models::{AnalysisResult, MachineResponseData};
use crate::services::asr_task::AsrTaskOutput;
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};

pub struct finish_task {
    pub id: String,
    pub task_id: i64,
    pub sample_id: u32,
    pub asr_dependency_id: String,
    pub analysis_dependency_id: String,
    // 任务持有所需的数据库服务
    pub db: Arc<DatabaseService>,
}

impl finish_task {
    /// 主要构造函数，在创建时注入数据库依赖
    pub fn new(
        id: String,
        task_id: i64,
        sample_id: u32,
        asr_dependency_id: String,
        analysis_dependency_id: String,
        db: Arc<DatabaseService>,
    ) -> Self {
        Self {
            id, // 为每个任务提供唯一ID以便追踪
            task_id,
            sample_id,
            asr_dependency_id,
            analysis_dependency_id,
            db, // 存储传入的数据库服务
        }
    }

    /// 另一个构造函数，同样注入数据库依赖
    pub fn new_with_dependencies(
        id: String,
        task_id: i64,
        sample_id: u32,
        asr_dependency_id: String,
        analysis_dependency_id: String,
        db: Arc<DatabaseService>,
    ) -> Self {
        Self {
            id,
            task_id,
            sample_id,
            asr_dependency_id,
            analysis_dependency_id,
            db,
        }
    }

    /// 核心数据处理逻辑
    /// 此函数现在使用 self.db，不再需要从 app_handle 获取 state
    async fn process_and_save_data(
        &self,
        context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        log::info!(
            "[{}] 开始处理和保存数据 - 样本ID: {}",
            self.id,
            self.sample_id
        );

        let context_reader = context.read().await;

        // 1. 从 asr_task 结果中提取数据
        let response_data = if let Some(data) = context_reader.get(&self.asr_dependency_id) {
            if let Some(asr_result) = data.downcast_ref::<AsrTaskOutput>() {
                MachineResponseData {
                    text: asr_result.response.clone(),
                    connected: true, // 假设连接正常
                }
            } else {
                return Err(format!("[{}] 无法将context数据转换为 AsrTaskOutput", self.id).into());
            }
        } else {
            return Err(format!(
                "[{}] 在context中找不到依赖项 '{}'",
                self.id, self.asr_dependency_id
            )
            .into());
        };

        // 2. 从 analysis_task 结果中提取数据
        let analysis_result = if let Some(data) = context_reader.get(&self.analysis_dependency_id) {
            if let Some(result) = data.downcast_ref::<AnalysisResult>() {
                result.clone()
            } else {
                return Err(format!("[{}] 无法将context数据转换为 AnalysisResult", self.id).into());
            }
        } else {
            return Err(format!(
                "[{}] 在context中找不到依赖项 '{}'",
                self.id, self.analysis_dependency_id
            )
            .into());
        };

        // 尽早释放读锁
        drop(context_reader);

        // 3. 直接使用 self.db 进行数据库操作
        log::info!("[{}] 保存车机响应到数据库...", self.id);
        self.db
            .save_machine_response(self.task_id, self.sample_id as i64, &response_data)
            .await
            .map_err(|e| format!("[{}] 保存车机响应失败: {}", self.id, e))?;

        log::info!("[{}] 保存分析结果到数据库...", self.id);
        self.db
            .save_analysis_result(self.task_id, self.sample_id as i64, &analysis_result)
            .await
            .map_err(|e| format!("[{}] 保存分析结果失败: {}", self.id, e))?;

        log::info!("[{}] 更新任务状态为完成...", self.id);
        self.db
            .update_task_status(self.task_id, "completed")
            .await
            .map_err(|e| format!("[{}] 更新任务状态失败: {}", self.id, e))?;

        // 可选：更新任务进度为100%
        self.db
            .update_task_progress(self.task_id, 1.0)
            .await
            .map_err(|e| format!("[{}] 更新任务进度失败: {}", self.id, e))?;

        log::info!("[{}] 数据保存完成 - 样本ID: {}", self.id, self.sample_id);

        // 4. 发送完成事件到前端
        app_handle.emit(
            "finish_task_complete",
            serde_json::json!({
                "task_id": self.task_id,
                "sample_id": self.sample_id,
                "response": response_data.text,
                "analysis_score": analysis_result.assessment.overall_score
            }),
        )?;

        Ok(())
    }
}

#[async_trait]
impl Task for finish_task {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        log::info!(
            "[{}] 开始执行 - 保存样本 {} 的结果",
            self.id,
            self.sample_id
        );

        loop {
            let signal = control_rx.borrow().clone();
            match signal {
                ControlSignal::Running => {
                    log::info!("[{}] 收到 'Running' 信号, 开始数据保存操作", self.id);

                    match self
                        .process_and_save_data(context.clone(), app_handle.clone())
                        .await
                    {
                        Ok(_) => {
                            log::info!("[{}] 样本 {} 的数据已成功保存", self.id, self.sample_id);
                            return Ok(()); // 任务成功完成
                        }
                        Err(e) => {
                            log::error!(
                                "[{}] 保存样本 {} 数据时发生错误: {}",
                                self.id,
                                self.sample_id,
                                e
                            );
                            return Err(e); // 任务失败
                        }
                    }
                }
                ControlSignal::Paused => {
                    log::info!("[{}] 收到 'Paused' 信号, 等待中...", self.id);
                }
                ControlSignal::Stopped => {
                    log::info!("[{}] 收到 'Stopped' 信号, 优雅退出", self.id);
                    return Ok(());
                }
            }

            // 如果未执行，则等待信号变化
            if control_rx.changed().await.is_err() {
                log::warn!("[{}] 控制通道已关闭，任务退出", self.id);
                return Ok(());
            }
        }
    }
}
