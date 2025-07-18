use crate::state::AppState;
use crate::services::ocr_session::{OcrSessionManager, OcrSessionResult};
use anyhow::anyhow;
use image::DynamicImage;
use std::cmp::{max, min};
use std::collections::VecDeque;
use std::sync::Arc;
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    Manager, State,
};
use tesseract::{OcrEngineMode, PageSegMode, Tesseract};

#[derive(serde::Serialize, Clone)]
pub struct OcrResultItem {
    text: String,
    confidence: f32,
    bbox: [i32; 4], // [x, y, width, height]
}

/// 代表一个或多个 OCR 文本行合并后的逻辑句子。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MergedSentence {
    /// 合并后的完整句子文本
    pub text: String,
    /// 能完全包围所有被合并行的整合边界框 [left, top, width, height]
    pub combined_bbox: [i32; 4],
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "lowercase")] // 这会让前端收到的JSON key为小驼峰，如 data 或 error
enum OcrEvent {
    Data(Vec<MergedSentence>),
    Session(OcrSessionResult),
    Error(String),
}

/// Parses the TSV data from Tesseract into a structured Vec based on a specific text level.
/// This version uses `split_whitespace()` to robustly handle inconsistent separators.
///
/// Tesseract TSV levels:
/// 1: Page
/// 2: Block
/// 3: Paragraph
/// 4: Line
/// 5: Word
fn parse_tsv_data(tsv: &str) -> anyhow::Result<Vec<OcrResultItem>> {
    let mut results = Vec::new();
    const DESIRED_LEVEL: &str = "5"; // 目标层级：4 (文本行)

    for line in tsv.lines().skip(1) {
        // ✅ 关键改动：使用 split_whitespace() 替换 split('\t')
        let columns: Vec<&str> = line.split_whitespace().collect();

        if columns.len() == 12 {
            // 检查是否是我们想要的文本行层级
            if columns[0] == DESIRED_LEVEL {
                // 对于文本行，我们不再检查置信度是否大于0，
                // 只需要确保识别出的文本（最后一列）不为空。
                if !columns[11].trim().is_empty() {
                    let confidence = columns[10].parse::<f32>().unwrap_or(-1.0);
                    let left = columns[6].parse::<i32>()?;
                    let top = columns[7].parse::<i32>()?;
                    let width = columns[8].parse::<i32>()?;
                    let height = columns[9].parse::<i32>()?;

                    results.push(OcrResultItem {
                        text: columns[11].trim().to_string(),
                        confidence,
                        bbox: [left, top, width, height],
                    });
                }
            }
        } else {
            // (可选) 增加一个调试日志，看看哪些行没有被正确解析
            // e.g., eprintln!("Skipping line with {} columns: {:?}", columns.len(), line);
        }
    }
    Ok(results)
}

/// 初始化OCR引擎池
pub async fn initialize_ocr_pool(
    state: Arc<AppState>,
    app_handle: &tauri::AppHandle,
    pool_size: usize,
) -> anyhow::Result<()> {
    println!("Initializing OCR engine pool with size: {}", pool_size);
    
    let tessdata_path = app_handle
        .path()
        .resolve("tessdata", tauri::path::BaseDirectory::Resource)?;

    std::env::set_var("TESSDATA_PREFIX", &tessdata_path);

    let pool = &state.ocr_pool;
    
    // 并行初始化所有引擎
    let mut handles = vec![];
    for i in 0..pool_size {
        let tessdata_path_clone = tessdata_path.clone();
        let engine_arc = pool.engines[i].clone();
        
        let handle = tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
            let mut ocr_engine = Tesseract::new_with_oem(
                Some(
                    tessdata_path_clone
                        .to_str()
                        .ok_or_else(|| anyhow!("Invalid tessdata path"))?,
                ),
                Some("chi_sim"),
                OcrEngineMode::LstmOnly,
            )?;

            ocr_engine.set_page_seg_mode(PageSegMode::PsmAuto);
            *engine_arc.lock() = Some(ocr_engine);

            Ok(())
        });
        
        handles.push(handle);
    }
    
    // 等待所有引擎初始化完成
    for handle in handles {
        handle.await??;
    }
    
    println!("All OCR engines initialized successfully");
    Ok(())
}

/// 关闭OCR引擎池
pub async fn shutdown_ocr_pool(state: Arc<AppState>) -> anyhow::Result<()> {
    println!("Shutting down OCR engine pool...");
    
    let pool = &state.ocr_pool;
    for engine in &pool.engines {
        let mut engine_guard = engine.lock();
        if engine_guard.take().is_some() {
            println!("OCR engine instance shut down");
        }
    }
    
    println!("OCR engine pool has been shut down");
    Ok(())
}

pub async fn perform_ocr(
    image_data: Vec<u8>,
    timestamp: u64,
    state: Arc<AppState>,
) -> Result<OcrSessionResult, String> {
    let channel_clone = match state.ocr_channel.lock().await.as_ref() {
        Some(channel) => channel.clone(),
        None => {
            println!("OCR session not started or already stopped, skipping frame processing");
            return Err("OCR session not started.".to_string());
        }
    };
    
    println!("Received image data with timestamp: {}. Performing OCR...", timestamp);
    
    // 使用引擎池获取OCR引擎
    let engine_arc = state.ocr_pool.get_engine();
    
    // 获取会话管理器
    let session_manager = state.ocr_session_manager.clone();
    
    // 执行OCR处理
    let task_result = tokio::task::spawn_blocking(move || -> anyhow::Result<(Vec<MergedSentence>, OcrSessionResult)> {
        let ocr_text = {
            let mut engine_guard = engine_arc.lock();
            if let Some(tesseract) = engine_guard.take() {
                let mut recognized_tesseract = tesseract.set_image_from_mem(&image_data)?;
                let tsv_data = recognized_tesseract.get_tsv_text(0)?;
                *engine_guard = Some(recognized_tesseract); // 回收引擎

                let ocr_lines = parse_tsv_data(&tsv_data)?;
                let final_sentences = merge_lines_into_sentences(&ocr_lines);
                let all_text: String = final_sentences
                    .iter()
                    .map(|s| s.text.as_str())
                    .collect::<Vec<_>>()
                    .join(" ");
                Ok((all_text, final_sentences))
            } else {
                Err(anyhow!("OCR engine not available"))
            }
        }?;

        let (all_text, final_sentences) = ocr_text;

        // 1. 快速锁定、更新状态并获取待检查数据，然后立即解锁
        let (mut session_result, history_to_check) = {
            let mut session = session_manager.lock();
            session.process_frame(all_text, timestamp)
        }; // <-- 锁在这里被释放

        // 2. 在锁之外执行昂贵的稳定性检查
        if let Some(history) = history_to_check {
            // 直接在这里实现稳定性检查逻辑，避免 &self 依赖问题
            // 注意：这里的阈值是硬编码的，与 OcrSessionManager::new() 中的默认值匹配
            let stability_threshold = 30;
            let similarity_threshold = 0.95;

            let is_stable = if history.len() < stability_threshold {
                false
            } else {
                let reference_text = &history[0].0;
                if reference_text.is_empty() {
                    false
                } else {
                    history
                        .iter()
                        .all(|(text, _)| {
                            OcrSessionManager::calculate_similarity(reference_text, text)
                                >= similarity_threshold
                        })
                }
            };

            if is_stable {
                // 如果稳定，计算最终文本并更新 session_result
                let final_text = {
                    use std::collections::HashMap;
                    let mut frequency: HashMap<&str, usize> = HashMap::new();
                    for (text, _) in &history {
                        *frequency.entry(text).or_insert(0) += 1;
                    }
                    frequency
                        .into_iter()
                        .max_by_key(|&(_, count)| count)
                        .map(|(text, _)| text.to_string())
                        .unwrap_or_else(|| history.back().map(|(s, _)| s.clone()).unwrap_or_default())
                };

                let stabilized_time = history.back().map(|(_, ts)| *ts).unwrap_or(timestamp);

                session_result.is_session_complete = true;
                session_result.should_stop_ocr = true;
                session_result.final_text = final_text;
                session_result.text_stabilized_time = Some(stabilized_time);
            }
        }

        // 3. 返回最终结果（可能是临时的，也可能是稳定的）
        Ok((final_sentences, session_result))
    })
    .await;

    // 处理结果并发送到前端
    let session_result = match task_result {
        Ok(Ok((data, session_result))) => {
            let event = if session_result.should_stop_ocr {
                OcrEvent::Session(session_result.clone())
            } else {
                OcrEvent::Data(data)
            };

            // 发送结果到前端，添加错误处理
            if let Ok(json_string) = serde_json::to_string(&event) {
                let payload = InvokeResponseBody::Json(json_string);
                match channel_clone.send(payload) {
                    Ok(_) => {
                        // 发送成功
                    }
                    Err(e) => {
                        eprintln!("无法通过 channel 发送 OCR 结果: {}", e);
                        // Channel 已失效，返回错误以停止处理
                        return Err("Channel communication failed, stopping OCR processing".to_string());
                    }
                }
            }

            session_result
        }
        Ok(Err(e)) => {
            let event = OcrEvent::Error(e.to_string());
            if let Ok(json_string) = serde_json::to_string(&event) {
                let payload = InvokeResponseBody::Json(json_string);
                let _ = channel_clone.send(payload);
            }
            return Err(e.to_string());
        }
        Err(join_error) => {
            let event = OcrEvent::Error(join_error.to_string());
            if let Ok(json_string) = serde_json::to_string(&event) {
                let payload = InvokeResponseBody::Json(json_string);
                let _ = channel_clone.send(payload);
            }
            return Err(join_error.to_string());
        }
    };

    Ok(session_result)
}

// /// 初始化OCR引擎池（兼容旧接口）
// #[tauri::command]
// pub async fn initialize_ocr_engine(
//     state: State<'_, Arc<AppState>>,
//     app_handle: tauri::AppHandle,
// ) -> Result<(), String> {
//     initialize_ocr_pool(&state, &app_handle, 6)
//         .await
//         .map_err(|e| {
//             eprintln!("Failed to initialize OCR engine pool: {}", e);
//             e.to_string()
//         })
// }

/// 关闭OCR引擎（兼容旧接口）
// #[tauri::command]
// pub async fn shutdown_ocr_engine(state: State<'_, Arc<AppState>>) -> Result<(), String> {
//     shutdown_ocr_pool(&state)
//         .await
//         .map_err(|e| {
//             eprintln!("Failed to shutdown OCR engine pool: {}", e);
//             e.to_string()
//         })
// }

// ---------------------------------- 合并函数 ----------------------------------
fn merge_lines_into_sentences(lines: &[OcrResultItem]) -> Vec<MergedSentence> {
    // 原有逻辑完全一致，这里不重复贴出
    // 为了可编译仍放在文件底部
    if lines.is_empty() {
        return vec![];
    }
    let mut out = Vec::new();
    let mut buf = Vec::new();
    for l in lines {
        if l.text.trim().is_empty() {
            continue;
        }
        buf.push(l);
        if l.text.ends_with(&['。', '！', '？', '.', '!', '?']) {
            finalize_sentence(&mut out, &mut buf);
        }
    }
    finalize_sentence(&mut out, &mut buf);
    out
}
 
#[inline]
fn finalize_sentence(
    out: &mut Vec<MergedSentence>,
    buf: &mut Vec<&OcrResultItem>,
) {
    if buf.is_empty() {
        return;
    }
    let text = buf.iter().map(|b| b.text.as_str()).collect::<String>();
    let min_x = buf.iter().map(|b| b.bbox[0]).min().unwrap();
    let min_y = buf.iter().map(|b| b.bbox[1]).min().unwrap();
    let max_x = buf.iter().map(|b| b.bbox[0] + b.bbox[2]).max().unwrap();
    let max_y = buf.iter().map(|b| b.bbox[1] + b.bbox[3]).max().unwrap();
    out.push(MergedSentence {
        text,
        combined_bbox: [min_x, min_y, max_x - min_x, max_y - min_y],
    });
    buf.clear();
}
