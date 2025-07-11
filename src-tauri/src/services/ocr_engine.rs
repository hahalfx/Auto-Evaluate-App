// src-tauri/src/services/ocr_engine.rs

use std::sync::Arc;

use crate::state::AppState;
use anyhow::anyhow;
use tauri::{Manager, State};
use tesseract::Tesseract;

// This struct definition remains correct.
#[derive(serde::Serialize, Clone)]
pub struct OcrResultItem {
    text: String,
    confidence: f32,
    bbox: [i32; 4], // [x, y, width, height]
}

/// A helper function to parse the TSV data provided by Tesseract.
fn parse_tsv_data(tsv: &str) -> anyhow::Result<Vec<OcrResultItem>> {
    let mut results = Vec::new();
    // Split the TSV string into lines and skip the header row.
    for line in tsv.lines().skip(1) {
        let columns: Vec<&str> = line.split('\t').collect();
        // A valid data line should have 12 columns.
        if columns.len() == 12 {
            // Parse confidence, only proceed if it's a valid number.
            if let Ok(confidence) = columns[10].parse::<f32>() {
                // Tesseract uses -1 for blocks that aren't recognized text.
                // We only care about lines with actual text and positive confidence.
                if confidence > 0.0 && !columns[11].trim().is_empty() {
                    // Parse bounding box dimensions.
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
    image_data: Vec<u8>,
    width: u32,
    height: u32,
    state: State<'_, Arc<AppState>>
) -> Result<Vec<OcrResultItem>, String> {
    let ocr_engine_arc = state.ocr_engine.clone();

    let task_result = tokio::task::spawn_blocking(move || {
        let mut engine_guard = ocr_engine_arc.lock();

        if let Some(tesseract) = engine_guard.take() {
            // --- FIX: Use the correct API based on the documentation ---

            // 1. Set the image using `set_frame`, which is designed for raw pixel data.
            //    The methods consume `self`, so we chain them.
            let mut recognized_tesseract = tesseract.set_frame(
                &image_data,
                width as i32,
                height as i32,
                4, // bytes_per_pixel for RGBA
                width as i32 * 4, // bytes_per_line
            )?;

            // 2. Get the results as a TSV string.
            //    The `get_tsv_text` method takes `&mut self`.
            let tsv_data = recognized_tesseract.get_tsv_text(0)?;

            // 3. IMPORTANT: Put the Tesseract instance back into the state so it can be reused.
            *engine_guard = Some(recognized_tesseract);

            // 4. Parse the TSV data to get structured results.
            parse_tsv_data(&tsv_data)
        } else {
            Err(anyhow!("OCR engine is not initialized. Please start the workflow first."))
        }
    })
    .await;

    match task_result {
        Ok(ocr_result) => ocr_result.map_err(|e| e.to_string()),
        Err(join_error) => Err(join_error.to_string()),
    }
}


// This function does not need any changes.
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
    std::env::set_var("TESSDATA_PREFIX", tessdata_path);
    
    let engine = tokio::task::spawn_blocking(|| {
        Tesseract::new(None, Some("chi_sim"))
    }).await??;

    *state.ocr_engine.lock() = Some(engine);

    println!("OCR engine loaded successfully.");
    Ok(())
}
