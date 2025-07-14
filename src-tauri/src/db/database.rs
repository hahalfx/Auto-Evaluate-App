use crate::models::*;
use anyhow::Result;
use chrono::Utc;
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;

#[derive(Debug)]
pub struct DatabaseService {
    pool: SqlitePool,
}

impl DatabaseService {
    pub async fn new(database_url: &str) -> Result<Self> {
        log::info!(
            "[DB_SERVICE] Attempting to initialize database with URL: {}",
            database_url
        );

        // 确保数据库文件可以被创建
        if database_url.starts_with("sqlite:") {
            let db_path_str = &database_url[7..]; // 移除 "sqlite:" 前缀
            log::info!("[DB_SERVICE] Extracted db_path_str: {}", db_path_str);
            let db_path = std::path::Path::new(db_path_str);

            if let Some(parent_dir) = db_path.parent() {
                log::info!(
                    "[DB_SERVICE] Target parent directory for database: {:?}",
                    parent_dir
                );
                if !parent_dir.exists() {
                    log::info!(
                        "[DB_SERVICE] Parent directory {:?} does not exist. Attempting to create.",
                        parent_dir
                    );
                } else {
                    log::info!(
                        "[DB_SERVICE] Parent directory {:?} already exists.",
                        parent_dir
                    );
                    match std::fs::metadata(parent_dir) {
                        Ok(metadata) => {
                            log::info!(
                                "[DB_SERVICE] Parent directory {:?} permissions: {:?}",
                                parent_dir,
                                metadata.permissions()
                            );
                        }
                        Err(e) => {
                            log::warn!(
                                "[DB_SERVICE] Could not get metadata for parent directory {:?}: {}",
                                parent_dir,
                                e
                            );
                        }
                    }
                }
                match std::fs::create_dir_all(parent_dir) {
                    Ok(_) => log::info!(
                        "[DB_SERVICE] Successfully ensured parent directory {:?} exists.",
                        parent_dir
                    ),
                    Err(e) => {
                        log::error!(
                            "[DB_SERVICE] Failed to create parent directory {:?}: {}",
                            parent_dir,
                            e
                        );
                        return Err(anyhow::Error::new(e).context(format!(
                            "Failed to create database parent directory: {:?}",
                            parent_dir
                        )));
                    }
                }
            } else {
                log::warn!(
                    "[DB_SERVICE] No parent directory found for db_path: {}",
                    db_path_str
                );
            }
        } else {
            log::warn!(
                "[DB_SERVICE] Database URL does not start with 'sqlite:': {}",
                database_url
            );
        }

        log::info!(
            "[DB_SERVICE] Attempting to connect to pool: {}",
            database_url
        );
        let pool = SqlitePool::connect(database_url).await.map_err(|e| {
            log::error!(
                "[DB_SERVICE] SqlitePool::connect failed for URL {}: {}",
                database_url,
                e
            );
            // Return a new error that includes the original error and context
            anyhow::Error::new(e).context(format!(
                "SqlitePool::connect failed for URL {}",
                database_url
            ))
        })?;
        log::info!("[DB_SERVICE] Successfully connected to pool.");

        // 创建数据库表
        log::info!("[DB_SERVICE] Attempting to create tables.");
        Self::create_tables(&pool).await.map_err(|e| {
            log::error!("[DB_SERVICE] create_tables failed: {}", e);
            e
        })?;
        log::info!("[DB_SERVICE] Successfully created tables.");

        Ok(Self { pool })
    }

    async fn create_tables(pool: &SqlitePool) -> Result<()> {
        // 创建任务表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                wake_word_id INTEGER NOT NULL,
                task_status TEXT NOT NULL DEFAULT 'pending',
                task_progress REAL DEFAULT 0.0,
                created_at TEXT NOT NULL,
                audio_type TEXT,
                audio_file TEXT,
                audio_duration TEXT,
                audio_category TEXT,
                test_collection TEXT,
                test_duration TEXT,
                sentence_accuracy REAL,
                word_accuracy REAL,
                character_error_rate REAL,
                recognition_success_rate REAL,
                total_words INTEGER,
                insertion_errors INTEGER,
                deletion_errors INTEGER,
                substitution_errors INTEGER,
                fastest_recognition_time REAL,
                slowest_recognition_time REAL,
                average_recognition_time REAL,
                completed_samples INTEGER
            )
            "#,
        )
        .execute(pool)
        .await?;

        // 创建测试样本表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS test_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                audio_file TEXT, -- Added audio_file column
                status TEXT DEFAULT 'pending',
                repeats INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            )
            "#,
        )
        .execute(pool)
        .await?;

        // 创建唤醒词表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS wake_words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL UNIQUE,
                audio_file TEXT, -- Added audio_file column
                created_at TEXT NOT NULL
            )
            "#,
        )
        .execute(pool)
        .await?;

        // 创建任务-样本关联表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS task_samples (
                task_id INTEGER NOT NULL,
                sample_id INTEGER NOT NULL,
                PRIMARY KEY (task_id, sample_id),
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY (sample_id) REFERENCES test_samples(id) ON DELETE CASCADE
            )
            "#,
        )
        .execute(pool)
        .await?;

        // 创建分析结果表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS analysis_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                sample_id INTEGER NOT NULL,
                semantic_correctness_score REAL NOT NULL,
                semantic_correctness_comment TEXT,
                state_change_score REAL NOT NULL,
                state_change_comment TEXT,
                unambiguous_score REAL NOT NULL,
                unambiguous_comment TEXT,
                overall_score REAL NOT NULL,
                is_valid BOOLEAN NOT NULL,
                suggestions TEXT,
                llm_title TEXT,
                llm_content TEXT,
                llm_context BOOLEAN,
                llm_multi_round BOOLEAN,
                test_time TEXT,
                audio_file TEXT,
                recognition_file TEXT,
                device TEXT,
                recognition_result TEXT,
                insertion_errors INTEGER,
                deletion_errors INTEGER,
                substitution_errors INTEGER,
                total_words INTEGER,
                reference_text TEXT,
                recognized_text TEXT,
                result_status TEXT,
                recognition_time REAL,
                response_time REAL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY (sample_id) REFERENCES test_samples(id) ON DELETE CASCADE,
                UNIQUE(task_id, sample_id)
            )
            "#,
        )
        .execute(pool)
        .await?;

        // 创建车机响应表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS machine_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                sample_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                connected BOOLEAN NOT NULL DEFAULT true,
                created_at TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY (sample_id) REFERENCES test_samples(id) ON DELETE CASCADE,
                UNIQUE(task_id, sample_id)
            )
            "#,
        )
        .execute(pool)
        .await?;

        // Attempt to add audio_file column to test_samples if it doesn't exist
        // This is a simple way to handle migration. A more robust solution would check PRAGMA table_info.
        let _ = sqlx::query("ALTER TABLE test_samples ADD COLUMN audio_file TEXT")
            .execute(pool)
            .await; // We ignore the error if the column already exists.

        // Attempt to add audio_file column to wake_words if it doesn't exist
        let _ = sqlx::query("ALTER TABLE wake_words ADD COLUMN audio_file TEXT")
            .execute(pool)
            .await; // We ignore the error if the column already exists.

        Ok(())
    }

    // 任务相关操作
    pub async fn create_task(&self, task: &Task) -> Result<i64> {
        let mut tx = self.pool.begin().await?;

        // 插入任务
        let result = sqlx::query(
            r#"
            INSERT INTO tasks (name, wake_word_id, task_status, created_at)
            VALUES (?, ?, ?, ?)
            "#,
        )
        .bind(&task.name)
        .bind(task.wake_word_id as i64)
        .bind(&task.task_status)
        .bind(&task.created_at)
        .execute(&mut *tx)
        .await?;

        let task_id = result.last_insert_rowid();

        // 插入任务-样本关联
        for &sample_id in &task.test_samples_ids {
            sqlx::query("INSERT INTO task_samples (task_id, sample_id) VALUES (?, ?)")
                .bind(task_id)
                .bind(sample_id as i64)
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;
        Ok(task_id)
    }

    pub async fn get_task_by_id(&self, task_id: i64) -> Result<Option<Task>> {
        // 获取任务基本信息
        let task_row = sqlx::query_as::<_, TaskRow>("SELECT * FROM tasks WHERE id = ?")
            .bind(task_id)
            .fetch_optional(&self.pool)
            .await?;

        let Some(task_row) = task_row else {
            return Ok(None);
        };

        // 获取关联的样本ID
        let sample_rows = sqlx::query("SELECT sample_id FROM task_samples WHERE task_id = ?")
            .bind(task_id)
            .fetch_all(&self.pool)
            .await?;

        let sample_ids: Vec<u32> = sample_rows
            .into_iter()
            .map(|row| row.get::<i64, _>("sample_id") as u32)
            .collect();

        // 获取车机响应
        let machine_responses = self.get_machine_responses_by_task(task_id).await?;

        // 获取测试结果
        let test_results = self.get_analysis_results_by_task(task_id).await?;

        Ok(Some(Task {
            id: task_row.id as u32,
            name: task_row.name,
            test_samples_ids: sample_ids,
            wake_word_id: task_row.wake_word_id as u32,
            machine_response: if machine_responses.is_empty() {
                None
            } else {
                Some(machine_responses)
            },
            test_result: if test_results.is_empty() {
                None
            } else {
                Some(test_results)
            },
            task_status: task_row.task_status,
            task_progress: task_row.task_progress.map(|p| p as f32),
            created_at: task_row.created_at,
            audio_type: task_row.audio_type,
            audio_file: task_row.audio_file,
            audio_duration: task_row.audio_duration,
            audio_category: task_row.audio_category,
            test_collection: task_row.test_collection,
            test_duration: task_row.test_duration,
            sentence_accuracy: task_row.sentence_accuracy.map(|v| v as f32),
            word_accuracy: task_row.word_accuracy.map(|v| v as f32),
            character_error_rate: task_row.character_error_rate.map(|v| v as f32),
            recognition_success_rate: task_row.recognition_success_rate.map(|v| v as f32),
            total_words: task_row.total_words.map(|v| v as u32),
            insertion_errors: task_row.insertion_errors.map(|v| v as u32),
            deletion_errors: task_row.deletion_errors.map(|v| v as u32),
            substitution_errors: task_row.substitution_errors.map(|v| v as u32),
            fastest_recognition_time: task_row.fastest_recognition_time.map(|v| v as f32),
            slowest_recognition_time: task_row.slowest_recognition_time.map(|v| v as f32),
            average_recognition_time: task_row.average_recognition_time.map(|v| v as f32),
            completed_samples: task_row.completed_samples.map(|v| v as u32),
        }))
    }

    pub async fn get_all_tasks(&self) -> Result<Vec<Task>> {
        let task_rows =
            sqlx::query_as::<_, TaskRow>("SELECT * FROM tasks ORDER BY created_at DESC")
                .fetch_all(&self.pool)
                .await?;

        let mut tasks = Vec::new();
        for task_row in task_rows {
            if let Some(task) = self.get_task_by_id(task_row.id).await? {
                tasks.push(task);
            }
        }

        Ok(tasks)
    }

    pub async fn delete_task(&self, task_id: i64) -> Result<()> {
        let mut tx = self.pool.begin().await?;

        // 删除任务-样本关联
        sqlx::query("DELETE FROM task_samples WHERE task_id = ?")
            .bind(task_id)
            .execute(&mut *tx)
            .await?;

        // 删除分析结果
        sqlx::query("DELETE FROM analysis_results WHERE task_id = ?")
            .bind(task_id)
            .execute(&mut *tx)
            .await?;

        // 删除车机响应
        sqlx::query("DELETE FROM machine_responses WHERE task_id = ?")
            .bind(task_id)
            .execute(&mut *tx)
            .await?;

        // 删除任务本身
        sqlx::query("DELETE FROM tasks WHERE id = ?")
            .bind(task_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn update_task_status(&self, task_id: i64, status: &str) -> Result<()> {
        sqlx::query("UPDATE tasks SET task_status = ? WHERE id = ?")
            .bind(status)
            .bind(task_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn update_task_progress(&self, task_id: i64, progress: f64) -> Result<()> {
        sqlx::query("UPDATE tasks SET task_progress = ? WHERE id = ?")
            .bind(progress)
            .bind(task_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    // 测试样本相关操作
    pub async fn get_all_samples(&self) -> Result<Vec<TestSample>> {
        let rows = sqlx::query_as::<_, TestSampleRow>("SELECT * FROM test_samples ORDER BY id")
            .fetch_all(&self.pool)
            .await?;

        Ok(rows
            .into_iter()
            .map(|row| TestSample {
                id: row.id as u32,
                text: row.text,
                audio_file: row.audio_file, // Added audio_file
                status: row.status,
                repeats: row.repeats.map(|r| r as u32),
                result: None,
            })
            .collect())
    }

    pub async fn create_sample(&self, text: &str, audio_file: Option<&str>) -> Result<i64> {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let result =
            sqlx::query("INSERT INTO test_samples (text, created_at, audio_file) VALUES (?, ?, ?)")
                .bind(text)
                .bind(now)
                .bind(audio_file)
                .execute(&self.pool)
                .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn create_samples_batch(
        &self,
        sample_texts_with_files: Vec<(String, Option<String>)>,
    ) -> Result<Vec<i64>> {
        let mut created_ids = Vec::new();
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut tx = self.pool.begin().await?;
        for (text, audio_file) in sample_texts_with_files {
            let result = sqlx::query(
                "INSERT INTO test_samples (text, created_at, audio_file) VALUES (?, ?, ?)",
            )
            .bind(text)
            .bind(&now)
            .bind(audio_file)
            .execute(&mut *tx)
            .await?;
            created_ids.push(result.last_insert_rowid());
        }
        tx.commit().await?;
        Ok(created_ids)
    }

    pub async fn delete_sample(&self, sample_id: i64) -> Result<()> {
        log::info!("[DB_SERVICE] Attempting to delete sample_id: {}", sample_id);
        let mut tx = self.pool.begin().await.map_err(|e| {
            log::error!(
                "[DB_SERVICE] Failed to begin transaction for deleting sample {}: {}",
                sample_id,
                e
            );
            anyhow::Error::new(e).context("Failed to begin transaction")
        })?;
        log::info!(
            "[DB_SERVICE] Transaction started for deleting sample_id: {}",
            sample_id
        );

        // 1. Delete from analysis_results
        log::debug!(
            "[DB_SERVICE] Deleting from analysis_results for sample_id: {}",
            sample_id
        );
        sqlx::query("DELETE FROM analysis_results WHERE sample_id = ?")
            .bind(sample_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                log::error!(
                    "[DB_SERVICE] Failed to delete from analysis_results for sample {}: {}",
                    sample_id,
                    e
                );
                anyhow::Error::new(e).context("Failed to delete from analysis_results")
            })?;
        log::debug!(
            "[DB_SERVICE] Successfully deleted from analysis_results for sample_id: {}",
            sample_id
        );

        // 2. Delete from machine_responses
        log::debug!(
            "[DB_SERVICE] Deleting from machine_responses for sample_id: {}",
            sample_id
        );
        sqlx::query("DELETE FROM machine_responses WHERE sample_id = ?")
            .bind(sample_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                log::error!(
                    "[DB_SERVICE] Failed to delete from machine_responses for sample {}: {}",
                    sample_id,
                    e
                );
                anyhow::Error::new(e).context("Failed to delete from machine_responses")
            })?;
        log::debug!(
            "[DB_SERVICE] Successfully deleted from machine_responses for sample_id: {}",
            sample_id
        );

        // 3. Delete from task_samples (junction table)
        log::debug!(
            "[DB_SERVICE] Deleting from task_samples for sample_id: {}",
            sample_id
        );
        sqlx::query("DELETE FROM task_samples WHERE sample_id = ?")
            .bind(sample_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                log::error!(
                    "[DB_SERVICE] Failed to delete from task_samples for sample {}: {}",
                    sample_id,
                    e
                );
                anyhow::Error::new(e).context("Failed to delete from task_samples")
            })?;
        log::debug!(
            "[DB_SERVICE] Successfully deleted from task_samples for sample_id: {}",
            sample_id
        );

        // 4. Finally, delete the sample itself from test_samples
        log::debug!(
            "[DB_SERVICE] Deleting from test_samples for sample_id: {}",
            sample_id
        );
        let result = sqlx::query("DELETE FROM test_samples WHERE id = ?")
            .bind(sample_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                log::error!(
                    "[DB_SERVICE] Failed to delete from test_samples for sample {}: {}",
                    sample_id,
                    e
                );
                anyhow::Error::new(e).context("Failed to delete from test_samples")
            })?;
        log::debug!("[DB_SERVICE] Successfully deleted from test_samples for sample_id: {}. Rows affected: {}", sample_id, result.rows_affected());

        tx.commit().await.map_err(|e| {
            log::error!(
                "[DB_SERVICE] Failed to commit transaction for deleting sample {}: {}",
                sample_id,
                e
            );
            anyhow::Error::new(e).context("Failed to commit transaction")
        })?;
        log::info!(
            "[DB_SERVICE] Successfully committed transaction for deleting sample_id: {}",
            sample_id
        );

        if result.rows_affected() == 0 {
            log::warn!("[DB_SERVICE] Attempted to delete sample_id {} from test_samples but no rows were affected. It might have already been deleted or never existed.", sample_id);
        }

        Ok(())
    }

    pub async fn delete_sample_safe(&self, sample_id: i64) -> Result<()> {
        let task_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM task_samples WHERE sample_id = ?")
                .bind(sample_id)
                .fetch_one(&self.pool)
                .await?;

        if task_count > 0 {
            return Err(anyhow::anyhow!(
                "样本 {} 正在被 {} 个任务使用，无法安全删除。",
                sample_id,
                task_count
            ));
        }

        self.delete_sample(sample_id).await
    }

    pub async fn get_samples_by_task_id(&self, task_id: i64) -> Result<Vec<TestSample>> {
        let rows = sqlx::query_as::<_, TestSampleRow>(
            r#"
            SELECT ts.* FROM test_samples ts
            JOIN task_samples tas ON ts.id = tas.sample_id
            WHERE tas.task_id = ?
            ORDER BY ts.id
            "#,
        )
        .bind(task_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| TestSample {
                id: row.id as u32,
                text: row.text,
                audio_file: row.audio_file, // Added audio_file
                status: row.status,
                repeats: row.repeats.map(|r| r as u32),
                result: None, // Result is typically joined or fetched separately
            })
            .collect())
    }

    pub async fn update_task_samples(&self, task_id: i64, sample_ids: Vec<i64>) -> Result<()> {
        let mut tx = self.pool.begin().await?;

        // 删除旧关联
        sqlx::query("DELETE FROM task_samples WHERE task_id = ?")
            .bind(task_id)
            .execute(&mut *tx)
            .await?;

        // 添加新关联
        for sample_id in sample_ids {
            sqlx::query("INSERT INTO task_samples (task_id, sample_id) VALUES (?, ?)")
                .bind(task_id)
                .bind(sample_id)
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    // 唤醒词相关操作
    pub async fn get_all_wake_words(&self) -> Result<Vec<WakeWord>> {
        let rows = sqlx::query_as::<_, WakeWordRow>("SELECT * FROM wake_words ORDER BY id")
            .fetch_all(&self.pool)
            .await?;

        Ok(rows
            .into_iter()
            .map(|row| WakeWord {
                id: row.id as u32,
                text: row.text,
                audio_file: row.audio_file, // Added audio_file
            })
            .collect())
    }

    pub async fn create_wake_word(&self, text: &str, audio_file: Option<&str>) -> Result<i64> {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let result =
            sqlx::query("INSERT INTO wake_words (text, created_at, audio_file) VALUES (?, ?, ?)")
                .bind(text)
                .bind(now)
                .bind(audio_file)
                .execute(&self.pool)
                .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn get_wake_word_by_id(&self, wake_word_id: u32) -> Result<Option<WakeWord>> {
        let row = sqlx::query_as::<_, WakeWordRow>("SELECT * FROM wake_words WHERE id = ?")
            .bind(wake_word_id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(|row| WakeWord {
            id: row.id as u32,
            text: row.text,
            audio_file: row.audio_file,
        }))
    }

    pub async fn create_wake_words_batch(
        &self,
        wakewords: Vec<(String, Option<String>)>,
    ) -> Result<Vec<i64>> {
        let mut created_ids = Vec::new();
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut tx = self.pool.begin().await?;
        for (text, audio_file) in wakewords {
            let result = sqlx::query(
                "INSERT INTO wake_words (text, created_at, audio_file) VALUES (?, ?, ?)",
            )
            .bind(text)
            .bind(&now)
            .bind(audio_file)
            .execute(&mut *tx)
            .await?;
            created_ids.push(result.last_insert_rowid());
        }
        tx.commit().await?;
        Ok(created_ids)
    }

    pub async fn delete_wake_word(&self, wake_word_id: i64) -> Result<()> {
        // Note: This is a simple delete. A safe delete should check for dependencies first.
        // We assume for now that if a wake word is in use, a foreign key constraint would prevent deletion,
        // or we can implement a `delete_wake_word_safe` like for samples.
        sqlx::query("DELETE FROM wake_words WHERE id = ?")
            .bind(wake_word_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_wake_word_safe(&self, wake_word_id: i64) -> Result<()> {
        let task_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE wake_word_id = ?")
                .bind(wake_word_id)
                .fetch_one(&self.pool)
                .await?;

        if task_count > 0 {
            return Err(anyhow::anyhow!(
                "唤醒词 {} 正在被 {} 个任务使用，无法安全删除。",
                wake_word_id,
                task_count
            ));
        }

        self.delete_wake_word(wake_word_id).await
    }


    // 分析结果相关操作
    pub async fn save_analysis_result(
        &self,
        task_id: i64,
        sample_id: i64,
        result: &AnalysisResult,
    ) -> Result<()> {
        let suggestions_json = serde_json::to_string(&result.assessment.suggestions)?;
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO analysis_results (
                task_id, sample_id, semantic_correctness_score, semantic_correctness_comment,
                state_change_score, state_change_comment, unambiguous_score, unambiguous_comment,
                overall_score, is_valid, suggestions, llm_title, llm_content, llm_context, llm_multi_round,
                test_time, audio_file, recognition_file, device, recognition_result,
                insertion_errors, deletion_errors, substitution_errors, total_words,
                reference_text, recognized_text, result_status, recognition_time, response_time, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(task_id)
        .bind(sample_id)
        .bind(result.assessment.semantic_correctness.score)
        .bind(&result.assessment.semantic_correctness.comment)
        .bind(result.assessment.state_change_confirmation.score)
        .bind(&result.assessment.state_change_confirmation.comment)
        .bind(result.assessment.unambiguous_expression.score)
        .bind(&result.assessment.unambiguous_expression.comment)
        .bind(result.assessment.overall_score)
        .bind(result.assessment.valid)
        .bind(suggestions_json)
        .bind(result.llm_analysis.as_ref().map(|a| &a.title))
        .bind(result.llm_analysis.as_ref().map(|a| &a.content))
        .bind(result.llm_analysis.as_ref().map(|a| a.context))
        .bind(result.llm_analysis.as_ref().map(|a| a.multi_round))
        .bind(&result.test_time)
        .bind(&result.audio_file)
        .bind(&result.recognition_file)
        .bind(&result.device)
        .bind(&result.recognition_result)
        .bind(result.insertion_errors.map(|v| v as i64))
        .bind(result.deletion_errors.map(|v| v as i64))
        .bind(result.substitution_errors.map(|v| v as i64))
        .bind(result.total_words.map(|v| v as i64))
        .bind(&result.reference_text)
        .bind(&result.recognized_text)
        .bind(&result.result_status)
        .bind(result.recognition_time.map(|v| v as f64))
        .bind(result.response_time.map(|v| v as f64))
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_analysis_results_by_task(
        &self,
        task_id: i64,
    ) -> Result<HashMap<u32, AnalysisResult>> {
        let rows = sqlx::query_as::<_, AnalysisResultRow>(
            "SELECT * FROM analysis_results WHERE task_id = ?",
        )
        .bind(task_id)
        .fetch_all(&self.pool)
        .await?;

        let mut results = HashMap::new();
        for row in rows {
            let suggestions: Vec<String> = if let Some(suggestions_str) = &row.suggestions {
                serde_json::from_str(suggestions_str).unwrap_or_default()
            } else {
                Vec::new()
            };

            let llm_analysis = if row.llm_title.is_some() || row.llm_content.is_some() {
                Some(LlmAnalysis {
                    title: row.llm_title.unwrap_or_default(),
                    content: row.llm_content.unwrap_or_default(),
                    context: row.llm_context.unwrap_or(false),
                    multi_round: row.llm_multi_round.unwrap_or(false),
                })
            } else {
                None
            };

            let analysis_result = AnalysisResult {
                assessment: Assessment {
                    semantic_correctness: AssessmentItem {
                        score: row.semantic_correctness_score,
                        comment: row.semantic_correctness_comment.unwrap_or_default(),
                    },
                    state_change_confirmation: AssessmentItem {
                        score: row.state_change_score,
                        comment: row.state_change_comment.unwrap_or_default(),
                    },
                    unambiguous_expression: AssessmentItem {
                        score: row.unambiguous_score,
                        comment: row.unambiguous_comment.unwrap_or_default(),
                    },
                    overall_score: row.overall_score,
                    valid: row.is_valid,
                    suggestions,
                },
                llm_analysis,
                test_time: row.test_time,
                audio_file: row.audio_file,
                recognition_file: row.recognition_file,
                device: row.device,
                recognition_result: row.recognition_result,
                insertion_errors: row.insertion_errors.map(|v| v as u32),
                deletion_errors: row.deletion_errors.map(|v| v as u32),
                substitution_errors: row.substitution_errors.map(|v| v as u32),
                total_words: row.total_words.map(|v| v as u32),
                reference_text: row.reference_text,
                recognized_text: row.recognized_text,
                result_status: row.result_status,
                recognition_time: row.recognition_time.map(|v| v as f32),
                response_time: row.response_time.map(|v| v as f32),
            };

            results.insert(row.sample_id as u32, analysis_result);
        }

        Ok(results)
    }

    // 车机响应相关操作
    pub async fn save_machine_response(
        &self,
        task_id: i64,
        sample_id: i64,
        response: &MachineResponseData,
    ) -> Result<()> {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO machine_responses (task_id, sample_id, text, connected, created_at)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(task_id)
        .bind(sample_id)
        .bind(&response.text)
        .bind(response.connected)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_machine_responses_by_task(
        &self,
        task_id: i64,
    ) -> Result<HashMap<u32, MachineResponseData>> {
        let rows = sqlx::query_as::<_, MachineResponseRow>(
            "SELECT * FROM machine_responses WHERE task_id = ?",
        )
        .bind(task_id)
        .fetch_all(&self.pool)
        .await?;

        let mut responses = HashMap::new();
        for row in rows {
            responses.insert(
                row.sample_id as u32,
                MachineResponseData {
                    text: row.text,
                    connected: row.connected,
                },
            );
        }

        Ok(responses)
    }

    // 初始化默认数据
    pub async fn initialize_default_data(&self) -> Result<()> {
        // 检查是否已有数据
        let wake_word_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM wake_words")
            .fetch_one(&self.pool)
            .await?;

        if wake_word_count == 0 {
            // 插入默认唤醒词
            let default_wake_words =
                vec![
                ("小度小度", None), 
                ("你好小度", None), 
                ("Hi Xiaodu", None),
                ("小艺小艺", Some("/Volumes/应用/LLM Analysis Interface/public/audio/wakeword/1小艺小艺.wav")), // Added new default wake word
            ];
            for (wake_word_text, wake_word_audio_file) in default_wake_words {
                self.create_wake_word(wake_word_text, wake_word_audio_file)
                    .await?;
            }
        }

        let sample_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM test_samples")
            .fetch_one(&self.pool)
            .await?;

        if sample_count == 0 {
            // 插入默认测试样本
            let default_samples = vec![
                (
                    "打开空调",
                    Some("/Volumes/应用/LLM Analysis Interface/public/audio/1打开空调.wav"),
                ), // Added audio file for this sample
                ("关闭空调", None),
                ("调高温度", None),
                ("调低温度", None),
                ("播放音乐", None),
                ("暂停音乐", None),
                ("下一首歌", None),
                ("上一首歌", None),
                ("导航到北京", None),
                ("取消导航", None),
                (
                    "我很冷",
                    Some("/Volumes/应用/LLM Analysis Interface/public/audio/5我很冷.wav"),
                ),
            ];
            for (sample_text, sample_audio_file) in default_samples {
                self.create_sample(sample_text, sample_audio_file).await?;
            }
        }

        Ok(())
    }
}
