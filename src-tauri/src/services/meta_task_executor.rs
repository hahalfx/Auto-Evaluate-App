use async_trait::async_trait;
use std::error::Error;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::watch;

use crate::models::TaskProgress;
use crate::models::TestSample;
use crate::models::WakeWord;
use crate::services::analysis_task::analysis_task;
use crate::services::asr_task::AsrTask;
use crate::services::audio_task::audio_task;
use crate::services::finish_task::finish_task;
use crate::services::middle_task::middle_task;
use crate::services::ocr_task::ocr_task;
use crate::services::workflow::ControlSignal;
use crate::services::workflow::Task;
use crate::services::workflow::Workflow;
use crate::services::workflow::WorkflowContext;
use crate::state::AppState;

/// 这个任务是所有样本测试的“总指挥”
pub struct meta_task_executor {
    id: String,
    task_id: i64,
    samples: Vec<TestSample>,
    wakeword: WakeWord,
    state_snapshot: Arc<AppState>, // 持有 AppState 的快照
}

impl meta_task_executor {
    pub fn new(
        id: &str,
        task_id: i64,
        samples: Vec<TestSample>,
        wakeword: WakeWord,
        state: Arc<AppState>, // 直接接收 Arc<AppState>
    ) -> Self {
        Self {
            id: id.to_string(),
            task_id,
            samples,
            wakeword,
            state_snapshot: state,
        }
    }
}

#[async_trait]
impl Task for meta_task_executor {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        _context: WorkflowContext, // 此元任务不使用共享上下文
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        let total = self.samples.len();
        println!(
            "[MetaTask '{}'] Starting execution of {} samples.",
            self.id, total
        );
        app_handle
            .emit(
                "meta_task_update",
                format!("总任务开始，共 {} 个样本。", total),
            )
            .ok();

        for (index, sample) in self.samples.iter().enumerate() {
            println!(
                "[MetaTask '{}'] Preparing sample {}/{}: '{}'",
                self.id,
                index + 1,
                total,
                sample.text
            );
            app_handle
                .emit(
                    "meta_task_update",
                    format!("开始处理样本 {}/{}: {}", index + 1, total, sample.text),
                )
                .ok();

            // 在执行每个子工作流前，检查外部控制信号
            // 使用tokio::select!以非阻塞方式检查
            tokio::select! {
                biased; // 优先检查控制信号
                _ = control_rx.changed() => {
                    let signal = *control_rx.borrow();
                     if signal == ControlSignal::Stopped {
                        println!("[MetaTask] Stopped by control signal before starting sample {}.", sample.id);
                        return Err("MetaTask was stopped externally.".into());
                    }
                    if signal == ControlSignal::Paused {
                         println!("[MetaTask] Paused. Waiting to resume...");
                         app_handle.emit("meta_task_update", "任务已暂停...").ok();
                         // 等待信号不再是 Paused
                         while *control_rx.borrow() == ControlSignal::Paused {
                            if control_rx.changed().await.is_err() {
                                return Err("Control channel closed while paused".into());
                            }
                         }
                         println!("[MetaTask] Resumed.");
                         app_handle.emit("meta_task_update", "任务已恢复。").ok();
                    }
                }
                // 如果没有控制信号变化，则正常执行
                _ = tokio::time::sleep(std::time::Duration::from_millis(1)) => {}
            }

            // 1. 为当前样本创建子工作流
            let (mut sub_workflow, _) = Workflow::new();
            let sample_id = sample.id;
            let keyword = sample.text.clone();

            // 2. 添加所有子任务，确保ID唯一
            let wakeword_task_id = format!("wakeword_task_{}", sample_id);
            let audio_task_id = format!("audio_task_{}", sample_id);
            let audio_ocr_task_id = format!("audio_ocr_task_{}", sample_id); //车机对语音指令识别的ocr
            let middle_task_id = format!("middle_task_{}", sample_id);
            let ocr_task_id = format!("ocr_task_{}", sample_id);
            let asr_task_id = format!("asr_task_{}", sample_id);
            let analysis_task_id = format!("analysis_task_{}", sample_id);
            let finish_task_id = format!("finish_task_{}", sample_id);

            sub_workflow.add_task(audio_task {
                id: wakeword_task_id.clone(),
                keyword: self.wakeword.text.clone(),
                url: Some("/Volumes/应用/LLM Analysis Interface/public/audio/wakeword".to_string()), // 请确保此路径有效
            });
            sub_workflow.add_task(audio_task {
                id: audio_task_id.clone(),
                keyword: keyword.clone(),
                url: None,
            });
            sub_workflow.add_task(ocr_task {
                id: audio_ocr_task_id.clone(),
            });

            sub_workflow.add_task(middle_task {
                id: middle_task_id.clone(),
            });

            sub_workflow.add_task(ocr_task {
                id: ocr_task_id.clone(),
            });

            sub_workflow.add_task(AsrTask::new(asr_task_id.clone(), keyword));
            sub_workflow.add_task(analysis_task {
                id: analysis_task_id.clone(),
                dependency_id: asr_task_id.clone(),
                http_client: self.state_snapshot.http_client.clone(),
            });
            sub_workflow.add_task(finish_task::new(
                finish_task_id.clone(),
                self.task_id,
                sample_id,
                asr_task_id.clone(),
                analysis_task_id.clone(),
                audio_ocr_task_id.clone(),
                ocr_task_id.clone(),
                audio_task_id.clone(),
                wakeword_task_id.clone(),
                self.state_snapshot.db.clone(),
            ));

            // 3. 设置依赖关系
            sub_workflow.add_dependency(&audio_task_id, &wakeword_task_id);
            sub_workflow.add_dependency(&audio_ocr_task_id, &wakeword_task_id);
            sub_workflow.add_dependency(&middle_task_id, &audio_task_id);
            sub_workflow.add_dependency(&middle_task_id, &audio_ocr_task_id);
            sub_workflow.add_dependency(&asr_task_id, &middle_task_id);
            sub_workflow.add_dependency(&ocr_task_id, &middle_task_id);
            sub_workflow.add_dependency(&analysis_task_id, &ocr_task_id);
            sub_workflow.add_dependency(&analysis_task_id, &asr_task_id);
            sub_workflow.add_dependency(&finish_task_id, &analysis_task_id);

            // 4. 执行并等待子工作流完成
            let result = sub_workflow
                .run_and_wait(app_handle.clone(), control_rx.clone())
                .await;
            let value = (index + 1) as f32 / total as f32 * 100 as f32;
            app_handle
                .emit(
                    "progress_update",
                    TaskProgress {
                        value,
                        current_sample: (index + 1) as u32,
                        current_stage: None,
                        total: total as u32,
                    },
                )
                .ok();

            if let Err(e) = result {
                let error_message =
                    format!("样本 '{}' 的子流程失败: {}. 终止所有任务。", sample.text, e);
                eprintln!("[MetaTask] {}", error_message);
                app_handle.emit("meta_task_error", &error_message).ok();
                return Err(error_message.into());
            }
            app_handle
                .emit(
                    "meta_task_update",
                    format!("样本 {} 处理成功。", sample.text),
                )
                .ok();
        }

        println!(
            "[MetaTask '{}'] All samples processed successfully.",
            self.id
        );
        app_handle
            .emit("meta_task_update", "所有样本处理完成！")
            .ok();
        Ok(())
    }
}
