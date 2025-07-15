use crate::state::AppState;
use anyhow::anyhow;
use image::DynamicImage;
use std::cmp::{max, min};
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
    state: &AppState,
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
                Some("chi_sim+eng"),
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
pub async fn shutdown_ocr_pool(state: &AppState) -> anyhow::Result<()> {
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

#[tauri::command]
pub async fn perform_ocr(
    image_data: Vec<u8>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let channel_clone = match state.ocr_channel.lock().await.as_ref() {
        Some(channel) => channel.clone(),
        None => return Err("OCR session not started.".to_string()),
    };
    
    println!("Received image data from frontend. Performing OCR...");
    
    // 使用引擎池获取OCR引擎
    let engine_arc = state.ocr_pool.get_engine();
    
    tokio::spawn(async move {
        let task_result = tokio::task::spawn_blocking(move || {
            let mut engine_guard = engine_arc.lock();

            // Decode the image from the bytes sent by the frontend.
            let img: DynamicImage =
                image::load_from_memory(&image_data).map_err(|e| anyhow!("图像解码失败: {}", e))?;

            // Extract width and height from the decoded image itself.
            let width = img.width();
            let height = img.height();

            // Take ownership of the Tesseract engine from the pool.
            if let Some(tesseract) = engine_guard.take() {
                let mut recognized_tesseract = tesseract.set_frame(
                    img.as_bytes(),
                    width as i32,
                    height as i32,
                    4,                // Bytes per pixel for RGBA
                    width as i32 * 4, // Bytes per line
                )?;

                // Get the recognition result as a TSV string.
                let tsv_data = recognized_tesseract.get_tsv_text(0)?;
                println!("-- RAW TSV DATA --\n{}\n------------------", &tsv_data);

                // IMPORTANT: Place the Tesseract instance back into the pool for reuse.
                *engine_guard = Some(recognized_tesseract);

                // 解析 TSV 数据，得到基于行的结果
                let ocr_lines = parse_tsv_data(&tsv_data)?;
                let final_sentences = merge_lines_into_sentences(&ocr_lines);

                Ok(final_sentences)
            } else {
                Err(anyhow!(
                    "OCR engine not initialized. Please start the workflow first."
                ))
            }
        })
        .await;

        // 根据 OCR 任务的结果，构建 OcrEvent
        let event = match task_result {
            Ok(Ok(data)) => OcrEvent::Data(data),
            Ok(Err(e)) => OcrEvent::Error(e.to_string()),
            Err(join_error) => OcrEvent::Error(join_error.to_string()),
        };

        match serde_json::to_string(&event) {
            Ok(json_string) => {
                let payload = InvokeResponseBody::Json(json_string);
                if let Err(e) = channel_clone.send(payload) {
                    eprintln!("无法通过 channel 发送 OCR 结果: {}", e);
                }
            }
            Err(e) => {
                eprintln!("无法将事件序列化为 JSON 字符串: {}", e);
            }
        }
    });

    Ok(())
}

/// 初始化OCR引擎池（兼容旧接口）
#[tauri::command]
pub async fn initialize_ocr_engine(
    state: State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    initialize_ocr_pool(&state, &app_handle, 2)
        .await
        .map_err(|e| {
            eprintln!("Failed to initialize OCR engine pool: {}", e);
            e.to_string()
        })
}

/// 关闭OCR引擎（兼容旧接口）
#[tauri::command]
pub async fn shutdown_ocr_engine(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    shutdown_ocr_pool(&state)
        .await
        .map_err(|e| {
            eprintln!("Failed to shutdown OCR engine pool: {}", e);
            e.to_string()
        })
}

/// 将从 OCR 得到的、基于行的结果（OcrResultItem）合并成更符合逻辑的句子。
pub fn merge_lines_into_sentences(lines: &[OcrResultItem]) -> Vec<MergedSentence> {
    if lines.is_empty() {
        return Vec::new();
    }

    let mut merged_sentences = Vec::new();
    let mut current_sentence_lines: Vec<&OcrResultItem> = Vec::new();
    let sentence_enders: &[char] = &['。', '！', '？', '.', '!', '?'];

    for line_item in lines {
        let trimmed_text = line_item.text.trim();
        if trimmed_text.is_empty() {
            continue;
        }

        // 将当前行加入到正在构建的句子中
        current_sentence_lines.push(line_item);

        // 检查当前行是否以句末标点结束
        if let Some(last_char) = trimmed_text.chars().last() {
            if sentence_enders.contains(&last_char) {
                // 如果是，说明一个句子构建完毕，进行处理
                finalize_sentence(&mut merged_sentences, &mut current_sentence_lines);
            }
        }
    }

    // 处理循环结束后剩余的、不成句的最后几行
    finalize_sentence(&mut merged_sentences, &mut current_sentence_lines);

    merged_sentences
}

/// 一个辅助函数，用于处理并终结一个句子的构建过程。
fn finalize_sentence<'a>(
    sentences_vec: &mut Vec<MergedSentence>,
    lines_to_merge: &mut Vec<&'a OcrResultItem>,
) {
    if lines_to_merge.is_empty() {
        return;
    }

    // 1. 合并文本
    let combined_text = lines_to_merge
        .iter()
        .map(|item| item.text.as_str())
        .collect::<String>();

    // 2. 计算整合后的边界框
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;

    for item in lines_to_merge.iter() {
        let bbox = item.bbox; // [left, top, width, height]
        min_x = min(min_x, bbox[0]);
        min_y = min(min_y, bbox[1]);
        max_x = max(max_x, bbox[0] + bbox[2]);
        max_y = max(max_y, bbox[1] + bbox[3]);
    }

    let combined_bbox = [min_x, min_y, max_x - min_x, max_y - min_y];

    // 3. 创建并添加新的 MergedSentence
    sentences_vec.push(MergedSentence {
        text: combined_text,
        combined_bbox,
    });

    // 4. 清空，为下一个句子做准备
    lines_to_merge.clear();
}
