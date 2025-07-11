use crate::state::AppState;
use anyhow::anyhow;
use image::DynamicImage;
use std::sync::Arc;
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    Manager, State,
};
use tesseract::Tesseract;

#[derive(serde::Serialize, Clone)]
pub struct OcrResultItem {
    text: String,
    confidence: f32,
    bbox: [i32; 4], // [x, y, width, height]
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "lowercase")] // 这会让前端收到的JSON key为小驼峰，如 data 或 error
enum OcrEvent {
    Data(Vec<OcrResultItem>),
    Error(String),
}

/// Parses the TSV data from Tesseract into a structured Vec.
fn parse_tsv_data(tsv: &str) -> anyhow::Result<Vec<OcrResultItem>> {
    let mut results = Vec::new();
    // Skip the header row.
    for line in tsv.lines().skip(1) {
        let columns: Vec<&str> = line.split('\t').collect();
        // A valid data line should have 12 columns.
        if columns.len() == 12 {
            // Only proceed if confidence is a valid number greater than 0.
            if let Ok(confidence) = columns[10].parse::<f32>() {
                if confidence > 0.0 && !columns[11].trim().is_empty() {
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

                // IMPORTANT: Place the Tesseract instance back into the state for reuse.
                *engine_guard = Some(recognized_tesseract);

                // Parse the TSV data into our structured format.
                parse_tsv_data(&tsv_data)
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

/// Loads the OCR engine on demand and stores it in the application state.
// This function did not require changes.
pub async fn load_ocr_engine_on_demand(
    state: &AppState,
    app_handle: &tauri::AppHandle,
) -> anyhow::Result<()> {
    if state.ocr_engine.lock().is_some() {
        println!("OCR engine already loaded.");
        return Ok(());
    }

    println!("Loading OCR engine...");

    let tessdata_path = app_handle
        .path()
        .resolve("tessdata", tauri::path::BaseDirectory::Resource)?;

    // Set the TESSDATA_PREFIX environment variable so Tesseract knows where to find language files.
    std::env::set_var("TESSDATA_PREFIX", &tessdata_path);

    let engine = tokio::task::spawn_blocking(move || {
        Tesseract::new(Some(tessdata_path.to_str().unwrap()), Some("chi_sim"))
    })
    .await??;

    *state.ocr_engine.lock() = Some(engine);

    println!("OCR engine loaded successfully.");
    Ok(())
}
