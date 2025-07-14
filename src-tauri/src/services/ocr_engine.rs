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

#[tauri::command]
pub async fn perform_ocr(
    image_data: Vec<u8>, // No longer need width and height from frontend
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    // 从 AppState 中获取 Channel 的【克隆】
    let channel_clone = match state.ocr_channel.lock().await.as_ref() {
        Some(channel) => channel.clone(), // 克隆 channel，这是一个轻量级的操作
        None => return Err("OCR session not started.".to_string()),
    };
    println!("Received image data from frontend. Performing OCR...");
    let ocr_engine_arc = state.ocr_engine.clone();
    // 3. 启动一个独立的异步任务，这样命令本身可以立刻返回
    tokio::spawn(async move {
        // Spawn a blocking task to avoid freezing the UI.
        let task_result = tokio::task::spawn_blocking(move || {
            let mut engine_guard = ocr_engine_arc.lock();

            // Decode the image from the bytes sent by the frontend.
            // FIX 1: Use anyhow! for proper error conversion with `?`.
            let img: DynamicImage =
                image::load_from_memory(&image_data).map_err(|e| anyhow!("图像解码失败: {}", e))?;

            // Extract width and height from the decoded image itself.
            let width = img.width();
            let height = img.height();

            // Take ownership of the Tesseract engine from the state.
            if let Some(tesseract) = engine_guard.take() {
                // FIX 2: Use `img.as_bytes()` to pass raw pixel data to the Tesseract API.
                // The tesseract API consumes the instance, so we chain the calls.
                let mut recognized_tesseract = tesseract.set_frame(
                    img.as_bytes(),
                    width as i32,
                    height as i32,
                    4,                // Bytes per pixel for RGBA
                    width as i32 * 4, // Bytes per line
                )?;

                // Get the recognition result as a TSV string.
                let tsv_data = recognized_tesseract.get_tsv_text(0)?;
                println!("-- RAW TSV DATA --\n{}\n------------------", &tsv_data); // 加上这行来调试

                // IMPORTANT: Place the Tesseract instance back into the state for reuse.
                *engine_guard = Some(recognized_tesseract);

                // 1. 解析 TSV 数据，得到基于行的结果
                let ocr_lines = parse_tsv_data(&tsv_data)?;

                // 2. ✅ 调用我们的新函数，将文本行合并成句子
                let final_sentences = merge_lines_into_sentences(&ocr_lines);

                // 3. 将最终的句子结果返回
                Ok(final_sentences)
            } else {
                Err(anyhow!(
                    "OCR engine not initialized. Please start the workflow first."
                ))
            }
        })
        .await;

        // 4. 根据 OCR 任务的结果，构建 OcrEvent
        let event = match task_result {
            // spawn_blocking 成功, OCR 也成功
            Ok(Ok(data)) => OcrEvent::Data(data),
            // spawn_blocking 成功, 但 OCR 失败
            Ok(Err(e)) => OcrEvent::Error(e.to_string()),
            // spawn_blocking 本身失败 (例如 panic)
            Err(join_error) => OcrEvent::Error(join_error.to_string()),
        };

        match serde_json::to_string(&event) {
            Ok(json_string) => {
                // 1. 显式地将 String 包装在 InvokeResponseBody::Json 枚举变体中
                let payload = InvokeResponseBody::Json(json_string);

                // 2. 发送这个已经完全符合类型的 payload
                if let Err(e) = channel_clone.send(payload) {
                    eprintln!("无法通过 channel 发送 OCR 结果: {}", e);
                }
            }
            Err(e) => {
                eprintln!("无法将事件序列化为 JSON 字符串: {}", e);
            }
        }
    });

    // 6. 命令立即成功返回，告知前端任务已启动
    Ok(())
}

/// Initializes the OCR engine and stores it in the application state.
/// This can be called from the frontend to explicitly start the engine.
#[tauri::command]
pub async fn initialize_ocr_engine(
    state: State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    load_ocr_engine_on_demand(&state, &app_handle)
        .await
        .map_err(|e| {
            eprintln!("Failed to initialize OCR engine: {}", e);
            e.to_string()
        })
}

/// Shuts down the OCR engine, releasing its resources.
#[tauri::command]
pub async fn shutdown_ocr_engine(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    println!("Shutting down OCR engine...");
    let mut engine_guard = state.ocr_engine.lock();

    if engine_guard.take().is_some() {
        // .take() replaces Some(engine) with None and returns the Some(engine),
        // which is then immediately dropped, releasing the resources.
        println!("OCR engine has been shut down and resources released.");
    } else {
        println!("OCR engine was not running.");
    }
    Ok(())
}


/// Loads the OCR engine on demand. This is a private helper function.
async fn load_ocr_engine_on_demand(
    state: &AppState,
    app_handle: &tauri::AppHandle,
) -> anyhow::Result<()> {
    // Lock and check if the engine is already there.
    if state.ocr_engine.lock().is_some() {
        println!("OCR engine already loaded.");
        return Ok(());
    }

    println!("Loading OCR engine...");

    let tessdata_path = app_handle
        .path()
        .resolve("tessdata", tauri::path::BaseDirectory::Resource)?;

    std::env::set_var("TESSDATA_PREFIX", &tessdata_path);

    // Clone the Arc so it can be moved into the blocking thread.
    let ocr_engine_state_clone = state.ocr_engine.clone();

    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        // Create the Tesseract instance
        let mut ocr_engine = Tesseract::new_with_oem(
            Some(
                tessdata_path
                    .to_str()
                    .ok_or_else(|| anyhow!("Invalid tessdata path"))?,
            ),
            Some("chi_sim+eng"),
            OcrEngineMode::LstmOnly,
        )?;

        // Configure the engine
        ocr_engine.set_page_seg_mode(PageSegMode::PsmAuto);

        println!("OCR engine loaded successfully. Acquiring lock to store it.");

        // Acquire the parking_lot lock
        let mut engine_guard = ocr_engine_state_clone.lock();

        // Store the engine
        *engine_guard = Some(ocr_engine);

        Ok(())
    })
    .await??; // Propagate JoinError and the internal anyhow::Error

    println!("OCR engine stored in state.");
    Ok(())
}

/// 将从 OCR 得到的、基于行的结果（OcrResultItem）合并成更符合逻辑的句子。
///
/// # Arguments
///
/// * `lines` - 一个 OcrResultItem 的切片，其中每个元素代表一个文本行。
///
/// # Returns
///
/// 一个 `MergedSentence` 的向量，其中每个元素代表一个完整的逻辑句子。
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
