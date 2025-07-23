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

        // 初始化数据库表结构和迁移
        log::info!("[DB_SERVICE] Attempting to initialize database schema.");
        Self::initialize_database(&pool).await.map_err(|e| {
            log::error!("[DB_SERVICE] initialize_database failed: {}", e);
            e
        })?;
        log::info!("[DB_SERVICE] Successfully initialized database schema.");

        Ok(Self { pool })
    }

    /// 创建所有数据库表
    async fn initialize_database(pool: &SqlitePool) -> Result<()> {
        // 创建任务表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
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
                audio_file TEXT,
                status TEXT DEFAULT 'pending',
                repeats INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                UNIQUE(text, audio_file)
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
                text TEXT NOT NULL,
                audio_file TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(text, audio_file)
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

        // 创建任务-唤醒词关联表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS task_wake_words (
                task_id INTEGER NOT NULL,
                wake_word_id INTEGER NOT NULL,
                PRIMARY KEY (task_id, wake_word_id),
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY (wake_word_id) REFERENCES wake_words(id) ON DELETE CASCADE
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

        // 创建时间参数表
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS timing_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                sample_id INTEGER NOT NULL,
                voice_command_start_time TEXT,
                first_char_appear_time TEXT,
                voice_command_end_time TEXT,
                full_text_appear_time TEXT,
                action_start_time TEXT,
                tts_first_frame_time TEXT,
                voice_recognition_time_ms INTEGER,
                interaction_response_time_ms INTEGER,
                tts_response_time_ms INTEGER,
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

        Ok(())
    }

    // 任务相关操作
    pub async fn create_task(&self, task: &Task) -> Result<i64> {
        let mut tx = self.pool.begin().await?;

        // 插入任务
        let result = sqlx::query(
            r#"
            INSERT INTO tasks (name, task_status, created_at)
            VALUES (?, ?, ?)
            "#,
        )
        .bind(&task.name)
        .bind(&task.task_status)
        .bind(&task.created_at)
        .execute(&mut *tx)
        .await?;

        let task_id = result.last_insert_rowid();

        // 插入任务-样本关联（使用INSERT OR IGNORE避免重复）
        for &sample_id in &task.test_samples_ids {
            sqlx::query("INSERT OR IGNORE INTO task_samples (task_id, sample_id) VALUES (?, ?)")
                .bind(task_id)
                .bind(sample_id as i64)
                .execute(&mut *tx)
                .await?;
        }

        // 插入任务-唤醒词关联（使用INSERT OR IGNORE避免重复）
        for &wake_word_id in &task.wake_word_ids {
            sqlx::query("INSERT OR IGNORE INTO task_wake_words (task_id, wake_word_id) VALUES (?, ?)")
                .bind(task_id)
                .bind(wake_word_id as i64)
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

        // 获取关联的唤醒词ID
        let wake_word_rows = sqlx::query("SELECT wake_word_id FROM task_wake_words WHERE task_id = ?")
            .bind(task_id)
            .fetch_all(&self.pool)
            .await?;

        let wake_word_ids: Vec<u32> = wake_word_rows
            .into_iter()
            .map(|row| row.get::<i64, _>("wake_word_id") as u32)
            .collect();

        // 获取车机响应
        let machine_responses = self.get_machine_responses_by_task(task_id).await?;

        // 获取测试结果
        let test_results = self.get_analysis_results_by_task(task_id).await?;

        Ok(Some(Task {
            id: task_row.id as u32,
            name: task_row.name,
            test_samples_ids: sample_ids,
            wake_word_ids: wake_word_ids,
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

    pub async fn get_all_samples_raw(&self) -> Result<Vec<TestSampleRow>> {
        log::info!("[DB_SERVICE] Getting all samples with raw data");
        
        let rows = sqlx::query_as::<_, TestSampleRow>(
            "SELECT id, text, audio_file, status, repeats, created_at FROM test_samples ORDER BY id"
        )
        .fetch_all(&self.pool)
        .await?;

        log::info!("[DB_SERVICE] Retrieved {} samples with raw data", rows.len());
        Ok(rows)
    }

    /// 创建或获取样本ID（避免重复检查逻辑）
    async fn create_or_get_sample_internal(&self, text: &str, audio_file: Option<&str>) -> Result<i64> {
        // 首先检查是否已存在
        if let Some(existing_id) = self.check_sample_exists(text, audio_file).await? {
            log::info!("[DB_SERVICE] Sample already exists: {} (ID: {})", text, existing_id);
            return Ok(existing_id);
        }

        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        // 使用 INSERT OR IGNORE 来处理唯一约束冲突
        let result = sqlx::query(
            "INSERT OR IGNORE INTO test_samples (text, created_at, audio_file) VALUES (?, ?, ?)"
        )
        .bind(text)
        .bind(now)
        .bind(audio_file)
        .execute(&self.pool)
        .await?;

        let inserted_id = result.last_insert_rowid();
        
        if inserted_id == 0 {
            // 如果没有插入成功，说明存在唯一约束冲突，重新获取现有ID
            if let Some(existing_id) = self.check_sample_exists(text, audio_file).await? {
                log::info!("[DB_SERVICE] Sample already exists (after INSERT OR IGNORE): {} (ID: {})", text, existing_id);
                return Ok(existing_id);
            } else {
                return Err(anyhow::anyhow!("Failed to create sample and could not find existing one: {}", text));
            }
        }

        log::info!("[DB_SERVICE] Created new sample: {} (ID: {})", text, inserted_id);
        Ok(inserted_id)
    }

    pub async fn create_sample(&self, text: &str, audio_file: Option<&str>) -> Result<i64> {
        self.create_or_get_sample_internal(text, audio_file).await
    }

    pub async fn create_samples_batch(
        &self,
        sample_texts_with_files: Vec<(String, Option<String>)>,
    ) -> Result<(Vec<i64>, usize)> { // -> (created_ids, ignored_count)
        let mut created_ids = Vec::new();
        let total_count = sample_texts_with_files.len();

        if sample_texts_with_files.is_empty() {
            return Ok((Vec::new(), 0));
        }

        // 使用内部函数处理每个样本，避免重复的检查逻辑
        for (text, audio_file) in sample_texts_with_files {
            let sample_id = self.create_or_get_sample_internal(&text, audio_file.as_deref()).await?;
            created_ids.push(sample_id);
        }

        let ignored_count = total_count - created_ids.len();
        Ok((created_ids, ignored_count))
    }

    pub async fn precheck_samples(&self, texts_to_check: Vec<String>) -> Result<(Vec<String>, Vec<String>)> {
        log::info!("[DB_SERVICE] Starting precheck_samples with {} texts", texts_to_check.len());
        
        if texts_to_check.is_empty() {
            log::info!("[DB_SERVICE] No texts to check, returning empty result");
            return Ok((Vec::new(), Vec::new()));
        }

        const BATCH_SIZE: usize = 900;
        let mut existing_texts_set = std::collections::HashSet::new();
        let mut tx = self.pool.begin().await?;
        log::info!("[DB_SERVICE] Database transaction started");

        for (chunk_index, chunk) in texts_to_check.chunks(BATCH_SIZE).enumerate() {
            if chunk.is_empty() {
                continue;
            }
            log::debug!("[DB_SERVICE] Processing chunk {} with {} texts", chunk_index, chunk.len());
            
            let params = vec!["?"; chunk.len()].join(",");
            let query_str = format!("SELECT text FROM test_samples WHERE text IN ({})", params);
            
            let mut query = sqlx::query_scalar::<_, String>(&query_str);
            for text in chunk {
                query = query.bind(text);
            }
            let found_texts: Vec<String> = query.fetch_all(&mut *tx).await?;
            log::debug!("[DB_SERVICE] Found {} existing texts in chunk {}", found_texts.len(), chunk_index);
            existing_texts_set.extend(found_texts);
        }
        
        tx.commit().await?;
        log::info!("[DB_SERVICE] Database transaction committed");

        let mut new_texts = Vec::new();
        let mut duplicate_texts = Vec::new();

        let unique_texts_to_check: std::collections::HashSet<String> = texts_to_check.into_iter().collect();
        log::info!("[DB_SERVICE] Processing {} unique texts", unique_texts_to_check.len());

        for text in unique_texts_to_check {
            if existing_texts_set.contains(&text) {
                duplicate_texts.push(text);
            } else {
                new_texts.push(text);
            }
        }

        log::info!("[DB_SERVICE] Precheck completed: {} new texts, {} duplicate texts", new_texts.len(), duplicate_texts.len());
        Ok((new_texts, duplicate_texts))
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

    pub async fn get_all_wake_words_raw(&self) -> Result<Vec<WakeWordRow>> {
        log::info!("[DB_SERVICE] Getting all wake words with raw data");
        
        let rows = sqlx::query_as::<_, WakeWordRow>(
            "SELECT id, text, audio_file, created_at FROM wake_words ORDER BY id"
        )
        .fetch_all(&self.pool)
        .await?;

        log::info!("[DB_SERVICE] Retrieved {} wake words with raw data", rows.len());
        Ok(rows)
    }

    /// 创建或获取唤醒词ID（避免重复检查逻辑）
    async fn create_or_get_wake_word_internal(&self, text: &str, audio_file: Option<&str>) -> Result<i64> {
        // 首先检查是否已存在
        if let Some(existing_id) = self.check_wake_word_exists(text, audio_file).await? {
            log::info!("[DB_SERVICE] Wake word already exists: {} (ID: {})", text, existing_id);
            return Ok(existing_id);
        }

        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        // 使用 INSERT OR IGNORE 来处理唯一约束冲突
        let result = sqlx::query(
            "INSERT OR IGNORE INTO wake_words (text, created_at, audio_file) VALUES (?, ?, ?)"
        )
        .bind(text)
        .bind(now)
        .bind(audio_file)
        .execute(&self.pool)
        .await?;

        let inserted_id = result.last_insert_rowid();
        
        if inserted_id == 0 {
            // 如果没有插入成功，说明存在唯一约束冲突，重新获取现有ID
            if let Some(existing_id) = self.check_wake_word_exists(text, audio_file).await? {
                log::info!("[DB_SERVICE] Wake word already exists (after INSERT OR IGNORE): {} (ID: {})", text, existing_id);
                return Ok(existing_id);
            } else {
                return Err(anyhow::anyhow!("Failed to create wake word and could not find existing one: {}", text));
            }
        }

        log::info!("[DB_SERVICE] Created new wake word: {} (ID: {})", text, inserted_id);
        Ok(inserted_id)
    }

    pub async fn create_wake_word(&self, text: &str, audio_file: Option<&str>) -> Result<i64> {
        self.create_or_get_wake_word_internal(text, audio_file).await
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
        
        // 使用内部函数处理每个唤醒词，避免重复的检查逻辑
        for (text, audio_file) in wakewords {
            let wake_word_id = self.create_or_get_wake_word_internal(&text, audio_file.as_deref()).await?;
            created_ids.push(wake_word_id);
        }
        
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

    // 新增：检查唤醒词是否已存在（基于文本和音频文件路径）
    pub async fn check_wake_word_exists(&self, text: &str, audio_file: Option<&str>) -> Result<Option<i64>> {
        let row = sqlx::query_scalar::<_, i64>(
            "SELECT id FROM wake_words WHERE text = ? AND (audio_file = ? OR (audio_file IS NULL AND ? IS NULL))"
        )
        .bind(text)
        .bind(audio_file)
        .bind(audio_file)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    // 新增：检查测试语料是否已存在（基于文本和音频文件路径）
    pub async fn check_sample_exists(&self, text: &str, audio_file: Option<&str>) -> Result<Option<i64>> {
        let row = sqlx::query_scalar::<_, i64>(
            "SELECT id FROM test_samples WHERE text = ? AND (audio_file = ? OR (audio_file IS NULL AND ? IS NULL))"
        )
        .bind(text)
        .bind(audio_file)
        .bind(audio_file)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    // 新增：获取所有唤醒词（包含文本和音频文件路径信息）
    pub async fn get_all_wake_words_with_files(&self) -> Result<Vec<(String, Option<String>, i64)>> {
        let rows = sqlx::query_as::<_, WakeWordRow>("SELECT * FROM wake_words ORDER BY id")
            .fetch_all(&self.pool)
            .await?;

        let result = rows.into_iter()
            .map(|row| (row.text, row.audio_file, row.id))
            .collect();

        Ok(result)
    }

    // 新增：获取所有测试语料（包含文本和音频文件路径信息）
    pub async fn get_all_samples_with_files(&self) -> Result<Vec<(String, Option<String>, i64)>> {
        let rows = sqlx::query_as::<_, TestSampleRow>("SELECT * FROM test_samples ORDER BY id")
            .fetch_all(&self.pool)
            .await?;

        let result = rows.into_iter()
            .map(|row| (row.text, row.audio_file, row.id))
            .collect();

        Ok(result)
    }

    // 新增：预检查唤醒词（基于文本和音频文件路径）
    pub async fn precheck_wake_words(&self, wake_words_to_check: Vec<(String, Option<String>)>) -> Result<(Vec<(String, Option<String>)>, Vec<(String, Option<String>)>)> {
        log::info!("[DB_SERVICE] Starting precheck_wake_words with {} items", wake_words_to_check.len());
        
        if wake_words_to_check.is_empty() {
            log::info!("[DB_SERVICE] No wake words to check, returning empty result");
            return Ok((Vec::new(), Vec::new()));
        }

        let mut new_wake_words = Vec::new();
        let mut duplicate_wake_words = Vec::new();

        for (text, audio_file) in wake_words_to_check {
            let exists = self.check_wake_word_exists(&text, audio_file.as_deref()).await?;
            if exists.is_some() {
                duplicate_wake_words.push((text, audio_file));
            } else {
                new_wake_words.push((text, audio_file));
            }
        }

        log::info!("[DB_SERVICE] Precheck completed: {} new wake words, {} duplicate wake words", 
                   new_wake_words.len(), duplicate_wake_words.len());
        Ok((new_wake_words, duplicate_wake_words))
    }

    // 新增：预检查测试语料（基于文本和音频文件路径）
    pub async fn precheck_samples_with_files(&self, samples_to_check: Vec<(String, Option<String>)>) -> Result<(Vec<(String, Option<String>)>, Vec<(String, Option<String>)>)> {
        log::info!("[DB_SERVICE] Starting precheck_samples_with_files with {} items", samples_to_check.len());
        
        if samples_to_check.is_empty() {
            log::info!("[DB_SERVICE] No samples to check, returning empty result");
            return Ok((Vec::new(), Vec::new()));
        }

        let mut new_samples = Vec::new();
        let mut duplicate_samples = Vec::new();

        for (text, audio_file) in samples_to_check {
            let exists = self.check_sample_exists(&text, audio_file.as_deref()).await?;
            if exists.is_some() {
                duplicate_samples.push((text, audio_file));
            } else {
                new_samples.push((text, audio_file));
            }
        }

        log::info!("[DB_SERVICE] Precheck completed: {} new samples, {} duplicate samples", 
                   new_samples.len(), duplicate_samples.len());
        Ok((new_samples, duplicate_samples))
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

    // 时间数据相关操作
    pub async fn save_timing_data(
        &self,
        task_id: i64,
        sample_id: i64,
        timing: &TimingData,
    ) -> Result<()> {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO timing_data (
                task_id, sample_id, voice_command_start_time, first_char_appear_time,
                voice_command_end_time, full_text_appear_time, action_start_time,
                tts_first_frame_time, voice_recognition_time_ms, interaction_response_time_ms,
                tts_response_time_ms, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(task_id)
        .bind(sample_id)
        .bind(timing.voice_command_start_time.map(|t| t.to_rfc3339()))
        .bind(timing.first_char_appear_time.map(|t| t.to_rfc3339()))
        .bind(timing.voice_command_end_time.map(|t| t.to_rfc3339()))
        .bind(timing.full_text_appear_time.map(|t| t.to_rfc3339()))
        .bind(timing.action_start_time.map(|t| t.to_rfc3339()))
        .bind(timing.tts_first_frame_time.map(|t| t.to_rfc3339()))
        .bind(timing.voice_recognition_time_ms)
        .bind(timing.interaction_response_time_ms)
        .bind(timing.tts_response_time_ms)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_timing_data_by_task(
        &self,
        task_id: i64,
    ) -> Result<HashMap<u32, TimingData>> {
        #[derive(sqlx::FromRow)]
        struct TimingRow {
            sample_id: i64,
            voice_command_start_time: Option<String>,
            first_char_appear_time: Option<String>,
            voice_command_end_time: Option<String>,
            full_text_appear_time: Option<String>,
            action_start_time: Option<String>,
            tts_first_frame_time: Option<String>,
            voice_recognition_time_ms: Option<i64>,
            interaction_response_time_ms: Option<i64>,
            tts_response_time_ms: Option<i64>,
        }

        let rows = sqlx::query_as::<_, TimingRow>(
            r#"
            SELECT
                sample_id,
                voice_command_start_time,
                first_char_appear_time,
                voice_command_end_time,
                full_text_appear_time,
                action_start_time,
                tts_first_frame_time,
                voice_recognition_time_ms,
                interaction_response_time_ms,
                tts_response_time_ms
            FROM timing_data
            WHERE task_id = ?
            "#,
        )
        .bind(task_id)
        .fetch_all(&self.pool)
        .await?;

        log::info!("[DB_SERVICE] Found {} timing data rows for task_id: {}", rows.len(), task_id);

        let mut results = HashMap::new();
        for row in rows {
            let mut timing = TimingData::new();
            
            // 更健壮的时间解析，记录解析错误但不中断处理
            if let Some(time_str) = row.voice_command_start_time {
                match chrono::DateTime::parse_from_rfc3339(&time_str) {
                    Ok(dt) => {
                        timing.voice_command_start_time = Some(dt.with_timezone(&chrono::Utc));
                        log::debug!("[DB_SERVICE] Parsed voice_command_start_time: {}", time_str);
                    }
                    Err(e) => {
                        log::warn!("[DB_SERVICE] Failed to parse voice_command_start_time '{}': {}", time_str, e);
                    }
                }
            }
            
            if let Some(time_str) = row.first_char_appear_time {
                match chrono::DateTime::parse_from_rfc3339(&time_str) {
                    Ok(dt) => {
                        timing.first_char_appear_time = Some(dt.with_timezone(&chrono::Utc));
                        log::debug!("[DB_SERVICE] Parsed first_char_appear_time: {}", time_str);
                    }
                    Err(e) => {
                        log::warn!("[DB_SERVICE] Failed to parse first_char_appear_time '{}': {}", time_str, e);
                    }
                }
            }
            
            if let Some(time_str) = row.voice_command_end_time {
                match chrono::DateTime::parse_from_rfc3339(&time_str) {
                    Ok(dt) => {
                        timing.voice_command_end_time = Some(dt.with_timezone(&chrono::Utc));
                        log::debug!("[DB_SERVICE] Parsed voice_command_end_time: {}", time_str);
                    }
                    Err(e) => {
                        log::warn!("[DB_SERVICE] Failed to parse voice_command_end_time '{}': {}", time_str, e);
                    }
                }
            }
            
            if let Some(time_str) = row.full_text_appear_time {
                match chrono::DateTime::parse_from_rfc3339(&time_str) {
                    Ok(dt) => {
                        timing.full_text_appear_time = Some(dt.with_timezone(&chrono::Utc));
                        log::debug!("[DB_SERVICE] Parsed full_text_appear_time: {}", time_str);
                    }
                    Err(e) => {
                        log::warn!("[DB_SERVICE] Failed to parse full_text_appear_time '{}': {}", time_str, e);
                    }
                }
            }
            
            if let Some(time_str) = row.action_start_time {
                match chrono::DateTime::parse_from_rfc3339(&time_str) {
                    Ok(dt) => {
                        timing.action_start_time = Some(dt.with_timezone(&chrono::Utc));
                        log::debug!("[DB_SERVICE] Parsed action_start_time: {}", time_str);
                    }
                    Err(e) => {
                        log::warn!("[DB_SERVICE] Failed to parse action_start_time '{}': {}", time_str, e);
                    }
                }
            }
            
            if let Some(time_str) = row.tts_first_frame_time {
                match chrono::DateTime::parse_from_rfc3339(&time_str) {
                    Ok(dt) => {
                        timing.tts_first_frame_time = Some(dt.with_timezone(&chrono::Utc));
                        log::debug!("[DB_SERVICE] Parsed tts_first_frame_time: {}", time_str);
                    }
                    Err(e) => {
                        log::warn!("[DB_SERVICE] Failed to parse tts_first_frame_time '{}': {}", time_str, e);
                    }
                }
            }
            
            timing.voice_recognition_time_ms = row.voice_recognition_time_ms;
            timing.interaction_response_time_ms = row.interaction_response_time_ms;
            timing.tts_response_time_ms = row.tts_response_time_ms;
            
            log::info!("[DB_SERVICE] Timing data for sample {}: voice_recognition={}ms, interaction_response={}ms, tts_response={}ms", 
                row.sample_id, 
                timing.voice_recognition_time_ms.unwrap_or(-1),
                timing.interaction_response_time_ms.unwrap_or(-1),
                timing.tts_response_time_ms.unwrap_or(-1)
            );
            
            results.insert(row.sample_id as u32, timing);
        }

        log::info!("[DB_SERVICE] Successfully processed {} timing data entries for task_id: {}", results.len(), task_id);
        Ok(results)
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
