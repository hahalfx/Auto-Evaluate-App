use async_trait::async_trait;
use futures::stream::{FuturesUnordered, StreamExt};
use std::any::Any;
use std::collections::{HashMap, VecDeque};
use std::error::Error;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::{watch, RwLock};
use tokio::task::JoinHandle;

use crate::services::audio_controller::AudioController;

pub type WorkflowContext = Arc<RwLock<HashMap<String, Box<dyn Any + Send + Sync>>>>;

// ===================================================================
// 1. 控制信号与句柄 (Control Signals & Handle)
// ===================================================================

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ControlSignal {
    Running,
    Paused,
    Stopped,
}

#[derive(Debug, Clone)]
pub struct ControlHandle {
    tx: watch::Sender<ControlSignal>,
}

impl ControlHandle {
    pub fn pause(&self) {
        self.tx.send(ControlSignal::Paused).ok();
    }

    pub fn resume(&self) {
        self.tx.send(ControlSignal::Running).ok();
    }

    pub fn stop(&self) {
        self.tx.send(ControlSignal::Stopped).ok();
    }
}

// ===================================================================
// 2. Task Trait (核心任务抽象)
// ===================================================================

#[async_trait]
pub trait Task: Send + Sync {
    fn id(&self) -> String;

    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>>;
}

// ===================================================================
// 3. 具体任务实现 (Concrete Task Implementation)
// ===================================================================
// ===================================================================
// 4. Workflow (工作流结构与执行器)
// ===================================================================

pub struct Workflow {
    tasks: HashMap<String, Box<dyn Task>>,
    dependencies: HashMap<String, Vec<String>>,
    audio_controller: AudioController,
}

impl Workflow {
    pub fn new() -> (Self, tokio::task::JoinHandle<anyhow::Result<()>>) {
        let (audio_controller, audio_handle) = AudioController::new();
        (
            Workflow {
                tasks: HashMap::new(),
                dependencies: HashMap::new(),
                audio_controller,
            },
            audio_handle,
        )
    }

    pub fn add_task(&mut self, task: impl Task + 'static) {
        let id = task.id();
        self.tasks.insert(id.clone(), Box::new(task));
        self.dependencies.entry(id).or_insert(vec![]);
    }

    pub fn add_dependency(&mut self, task_id: &str, depends_on_id: &str) {
        self.dependencies
            .entry(task_id.to_string())
            .or_insert(vec![])
            .push(depends_on_id.to_string());
    }

    pub async fn run(self, app_handle: AppHandle) -> ControlHandle {
        let (control_tx, control_rx) = watch::channel(ControlSignal::Running);
        let handle = ControlHandle { tx: control_tx };

        tokio::spawn(async move {
            let mut workflow_runner =
                WorkflowRunner::new(self.tasks, self.dependencies, control_rx);
            workflow_runner.execute(app_handle).await;
        });

        handle
    }

    /// 运行工作流并异步等待其完成。
    /// 这对于需要顺序执行多个工作流的场景至关重要。
    pub async fn run_and_wait(
        self,
        app_handle: AppHandle,
        // 我们也需要把控制信号接收器传进来，以便子流程能被外部主流程控制
        mut control_rx: watch::Receiver<ControlSignal>,
    ) -> Result<WorkflowContext, String> {
        // 注意：这里我们不再创建新的 control channel，而是复用传入的
        // 我们也不再 tokio::spawn，而是直接 .await
        let mut workflow_runner = WorkflowRunner::new(self.tasks, self.dependencies, control_rx);

        // 直接 await 执行结果
        workflow_runner.execute(app_handle).await
    }
}

struct WorkflowRunner {
    tasks: HashMap<String, Box<dyn Task>>,
    control_rx: watch::Receiver<ControlSignal>,
    reverse_deps: HashMap<String, Vec<String>>,
    in_degrees: HashMap<String, usize>,
}

impl WorkflowRunner {
    fn new(
        tasks: HashMap<String, Box<dyn Task>>,
        dependencies: HashMap<String, Vec<String>>,
        control_rx: watch::Receiver<ControlSignal>,
    ) -> Self {
        let mut in_degrees = HashMap::new();
        let mut reverse_deps: HashMap<String, Vec<String>> = HashMap::new();

        for task_id in tasks.keys() {
            in_degrees.entry(task_id.clone()).or_insert(0);
            reverse_deps.entry(task_id.clone()).or_insert(vec![]);
        }

        for (task_id, deps) in &dependencies {
            in_degrees.insert(task_id.clone(), deps.len());
            for dep_id in deps {
                reverse_deps
                    .entry(dep_id.clone())
                    .or_insert(vec![])
                    .push(task_id.clone());
            }
        }

        WorkflowRunner {
            tasks,
            control_rx,
            reverse_deps,
            in_degrees,
        }
    }

    async fn execute(&mut self, app_handle: tauri::AppHandle) -> Result<WorkflowContext, String> {
        // 创建上下文
        let context = Arc::new(RwLock::new(HashMap::new()));
        let mut running_tasks: FuturesUnordered<JoinHandle<(String, Result<(), String>)>> =
            FuturesUnordered::new();
        let mut ready_queue: VecDeque<String> = VecDeque::new();

        // 找到所有初始入度为 0 的任务
        for (id, &degree) in &self.in_degrees {
            if degree == 0 {
                ready_queue.push_back(id.clone());
            }
        }

        // [修改] 如果一开始就没有可执行的任务，直接结束
        if ready_queue.is_empty() && self.tasks.is_empty() {
             println!("[Workflow] No tasks to run.");
             app_handle.emit("workflow_event", "workflow finished (no tasks)").ok();
             return Ok(context);
        }

        loop {
            // 启动所有就绪的任务
            while let Some(task_id) = ready_queue.pop_front() {
                if let Some(mut task) = self.tasks.remove(&task_id) {
                    let mut rx = self.control_rx.clone();
                    let ctx_clone = context.clone(); // <--- 克隆 Arc
                    let app_handle_clone = app_handle.clone();

                    println!("[Workflow] Spawning task '{}'.", task_id);
                    let handle = tokio::spawn(async move {
                        let result = task
                            .execute(&mut rx, ctx_clone, app_handle_clone) //在这里将任务控制信号接收器，工作流上下文，和应用程序句柄传递给任务执行函数
                            .await
                            .map_err(|e| e.to_string());
                        (task.id(), result)
                    });
                    running_tasks.push(handle);
                }
            }

            // 如果没有正在运行且没有准备就绪的任务，则工作流结束
            if running_tasks.is_empty() && ready_queue.is_empty() {
                println!("[Workflow] All tasks finished or no tasks to run. Exiting.");
                let data = String::from("workflow finished");
                app_handle.emit("workflow_event", data).ok();

                return Ok(context);
            }

            // 等待任何一个正在运行的任务完成
            if let Some(Ok((completed_id, result))) = running_tasks.next().await {
                match result {
                    Ok(_) => {
                        println!("[Workflow] Task '{}' completed successfully.", completed_id);
                        // 任务成功，更新其下游任务的入度
                        if let Some(dependents) = self.reverse_deps.get(&completed_id) {
                            for dependent_id in dependents {
                                let degree = self.in_degrees.get_mut(dependent_id).unwrap();
                                *degree -= 1;
                                if *degree == 0 {
                                    ready_queue.push_back(dependent_id.clone());
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let error_msg =
                            format!("Task '{}' failed: {}. Stopping workflow.", completed_id, e);
                        eprintln!("[Workflow] {}", error_msg);
                        // [修改] 任务失败时，返回错误以终止整个工作流
                        return Err(error_msg);
                    }
                }
            } else {
                // 如果运行的 task handle 出现问题 (e.g., panic)，或者 running_tasks 为空
                if running_tasks.is_empty() {
                    // 一个正在运行的task panic了或者被取消了
                    return Err("A running task panicked or was cancelled.".to_string());
                }
            }
        }
    }
}
