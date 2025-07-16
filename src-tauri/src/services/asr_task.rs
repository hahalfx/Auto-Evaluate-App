// [!BEGIN!]
use async_trait::async_trait;
use base64::Engine;
use chrono::prelude::*;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use futures_util::{stream::SplitSink, SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::Sha256;
use std::cell::RefCell;
use std::env;
use std::error::Error;
// Add necessary imports for threading
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::Emitter;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot, watch};
use tokio_tungstenite::{
    connect_async, tungstenite::protocol::Message, MaybeTlsStream, WebSocketStream,
};
use url::Url;
use urlencoding::encode;

// Import your project's workflow definitions
use crate::services::workflow::{ControlSignal, Task, WorkflowContext};
use std::sync::Once;

static INIT_CRYPTO: Once = Once::new();
// --- Constants ---
const HOST_URL: &str = "wss://iat-api.xfyun.cn/v2/iat";
const SAMPLES_PER_FRAME: usize = 640;
const INTERVAL_MS: u64 = 40;

// --- Authentication Logic [No changes] ---
fn build_auth_url(api_key: &str, api_secret: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
    let url = Url::parse(HOST_URL)?;
    let host = url.host_str().ok_or("No host in URL")?;
    let date = Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    let request_line = format!("GET {} HTTP/1.1", url.path());
    let signature_origin = format!("host: {}\ndate: {}\n{}", host, date, request_line);
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(api_secret.as_bytes())?;
    mac.update(signature_origin.as_bytes());
    let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    let authorization_origin = format!(
        "api_key=\"{}\", algorithm=\"hmac-sha256\", headers=\"host date request-line\", signature=\"{}\"",
        api_key, signature
    );
    let authorization =
        base64::engine::general_purpose::STANDARD.encode(authorization_origin.as_bytes());
    let final_url = format!(
        "{}?authorization={}&date={}&host={}",
        HOST_URL,
        authorization,
        encode(&date),
        host
    );
    Ok(final_url)
}

// --- JSON Data Structures [No changes] ---
#[derive(Serialize)]
struct RequestFrame<'a> {
    common: Common,
    business: Business<'a>,
    data: Data<'a>,
}
#[derive(Serialize)]
struct Common {
    app_id: String,
}
#[derive(Serialize)]
struct Business<'a> {
    language: &'a str,
    domain: &'a str,
    accent: &'a str,
    dwa: &'a str,
}
#[derive(Serialize)]
struct Data<'a> {
    status: i32,
    format: &'a str,
    encoding: &'a str,
    audio: String,
}
#[derive(Deserialize, Debug)]
struct ResponseFrame {
    code: i32,
    message: String,
    sid: String,
    data: Option<ResponseData>,
}
#[derive(Deserialize, Debug)]
struct ResponseData {
    status: i32,
    result: Option<ResultData>,
}
#[derive(Deserialize, Debug)]
struct ResultData {
    sn: i32,
    ls: bool,
    pgs: Option<String>,
    rg: Option<Vec<i32>>,
    ws: Vec<Ws>,
}
#[derive(Deserialize, Debug)]
struct Ws {
    cw: Vec<Cw>,
}
#[derive(Deserialize, Debug)]
struct Cw {
    w: String,
}

// --- Dynamic Result Decoder [No changes] ---
#[derive(Debug, Clone)]
struct DecodedText {
    text: String,
    sn: i32,
    deleted: bool,
}
struct Decoder {
    texts: Vec<DecodedText>,
}
impl Decoder {
    fn new() -> Self {
        Decoder { texts: Vec::new() }
    }
    fn decode(&mut self, result: &ResultData) {
        let mut current_text = String::new();
        for ws in &result.ws {
            for cw in &ws.cw {
                current_text.push_str(&cw.w);
            }
        }
        if let Some(pgs) = &result.pgs {
            if pgs == "rpl" {
                if let Some(rg) = &result.rg {
                    for i in rg[0]..=rg[1] {
                        if let Some(t) = self.texts.iter_mut().find(|t| t.sn == i) {
                            t.deleted = true;
                        }
                    }
                }
            }
        }
        let decoded = DecodedText {
            text: current_text,
            sn: result.sn,
            deleted: false,
        };
        if let Some(t) = self.texts.iter_mut().find(|t| t.sn == result.sn) {
            *t = decoded;
        } else {
            self.texts.push(decoded);
        }
    }
    fn get_full_text(&self) -> String {
        let mut full_text = String::new();
        let mut sorted_texts = self.texts.clone();
        sorted_texts.sort_by_key(|t| t.sn);
        for text in sorted_texts {
            if !text.deleted {
                full_text.push_str(&text.text);
            }
        }
        full_text
    }
}

// --- Audio Processing Logic [No changes] ---
#[derive(Debug)]
enum AudioError {
    NoInputDevice,
    UnsupportedConfig,
    ResamplingFailed,
    DeviceError(String),
}
impl std::fmt::Display for AudioError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AudioError::NoInputDevice => write!(f, "No input device available"),
            AudioError::UnsupportedConfig => write!(f, "Unsupported audio configuration"),
            AudioError::ResamplingFailed => write!(f, "Audio resampling failed"),
            AudioError::DeviceError(e) => write!(f, "Device error: {}", e),
        }
    }
}
impl std::error::Error for AudioError {}
fn f32_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
        .collect()
}
fn find_best_f32_input_config(
    device: &cpal::Device,
) -> Result<(cpal::StreamConfig, cpal::SampleFormat), Box<dyn Error + Send + Sync>> {
    let supported_configs = device
        .supported_input_configs()
        .map_err(|e| Box::new(AudioError::DeviceError(e.to_string())))?;
    let best_supported_config = supported_configs
        .filter(|c| c.channels() == 1 && c.sample_format() == SampleFormat::F32)
        .max_by_key(|c| c.max_sample_rate())
        .ok_or_else(|| Box::new(AudioError::UnsupportedConfig) as Box<dyn Error + Send + Sync>)?
        .with_max_sample_rate();
    let sample_format = best_supported_config.sample_format();
    let config: cpal::StreamConfig = best_supported_config.into();
    Ok((config, sample_format))
}
fn create_resampler(input_rate: u32) -> Result<SincFixedIn<f32>, Box<dyn Error + Send + Sync>> {
    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };
    SincFixedIn::new(16000.0 / input_rate as f64, 2.0, params, 1024, 1)
        .map_err(|_| AudioError::ResamplingFailed.into())
}
fn resample_f32_audio(
    data: &[f32],
    resampler: &mut SincFixedIn<f32>,
) -> Result<Vec<f32>, AudioError> {
    let waves_in: &[&[f32]] = &[data];
    let mut waves_out = vec![vec![0.0; resampler.output_frames_max()]];
    resampler
        .process_into_buffer(waves_in, &mut waves_out, None)
        .map_err(|_| AudioError::ResamplingFailed)?;
    Ok(waves_out.into_iter().next().unwrap_or_default())
}

// --- NEW: Audio Capture Thread ---
// This function runs in its own OS thread and handles all `cpal` interactions.
fn audio_capture_thread(
    audio_sender: mpsc::Sender<Vec<f32>>,
    stop_signal: Arc<AtomicBool>,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or(AudioError::NoInputDevice)?;
    let (config, _sample_format) = find_best_f32_input_config(&device)?;
    let input_rate = config.sample_rate.0;
    let resampler = if input_rate != 16000 {
        Some(RefCell::new(create_resampler(input_rate)?))
    } else {
        None
    };

    let mut pre_resampling_buffer = Vec::new();
    let mut post_resampling_buffer = Vec::new();

    let stream = device.build_input_stream(
        &config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            pre_resampling_buffer.extend_from_slice(data);
            if let Some(resampler_cell) = &resampler {
                let mut resampler = resampler_cell.borrow_mut();
                while pre_resampling_buffer.len() >= resampler.input_frames_next() {
                    let required_len = resampler.input_frames_next();
                    let chunk_to_resample = pre_resampling_buffer
                        .drain(..required_len)
                        .collect::<Vec<f32>>();
                    if let Ok(resampled) = resample_f32_audio(&chunk_to_resample, &mut resampler) {
                        post_resampling_buffer.extend_from_slice(&resampled);
                    }
                }
            } else {
                post_resampling_buffer.extend_from_slice(&pre_resampling_buffer);
                pre_resampling_buffer.clear();
            }
            while post_resampling_buffer.len() >= SAMPLES_PER_FRAME {
                let frame_to_send = post_resampling_buffer
                    .drain(..SAMPLES_PER_FRAME)
                    .collect::<Vec<f32>>();
                // Use blocking send as we are in a dedicated thread.
                // If the receiver is dropped, this will error out and help terminate the thread.
                if audio_sender.blocking_send(frame_to_send).is_err() {
                    // Stop processing if receiver is gone
                    return;
                }
            }
        },
        |err| eprintln!("Audio stream error: {}", err),
        None,
    )?;
    stream.play()?;

    // Keep the thread alive while the stream is running
    while !stop_signal.load(Ordering::SeqCst) {
        thread::sleep(Duration::from_millis(50));
    }

    Ok(())
}

// --- Audio Sending Task [No changes] ---
async fn send_audio(
    mut sender: SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>,
    mut receiver: mpsc::Receiver<Vec<f32>>,
    appid: String,
    mut stop_rx: oneshot::Receiver<()>,
) {
    let mut status = 0;
    loop {
        tokio::select! {
            biased;
            _ = &mut stop_rx => {
                println!("\nASR send_audio task stopping, sending final frame...");
                let last_frame = json!({ "data": { "status": 2, "audio": "" } });
                if sender.send(Message::Text(last_frame.to_string().into())).await.is_err() { /* ... */ }
                sender.close().await.ok();
                println!("ASR send_audio task finished.");
                return;
            }
            Some(chunk_f32) = receiver.recv() => {
                 let chunk_i16 = f32_to_i16(&chunk_f32);
                 let chunk_bytes: Vec<u8> = chunk_i16.iter().flat_map(|&s| s.to_le_bytes()).collect();
                 let audio_base64 = base64::engine::general_purpose::STANDARD.encode(&chunk_bytes);
                 let msg = match status {
                     0 => {
                         let req = RequestFrame { common: Common { app_id: appid.clone() }, business: Business { language: "zh_cn", domain: "iat", accent: "mandarin", dwa: "wpgs" }, data: Data { status: 0, format: "audio/L16;rate=16000", encoding: "raw", audio: audio_base64 }, };
                         status = 1;
                         serde_json::to_string(&req).unwrap()
                     }
                     1 => { json!({ "data": { "status": 1, "audio": audio_base64 } }).to_string() }
                     _ => unreachable!(),
                 };
                 if sender.send(Message::Text(msg.into())).await.is_err() { return; }
            }
        }
    }
}

// --- Task Definition ---
#[derive(Debug, Clone)]
pub struct AsrTaskOutput {
    pub example: String,
    pub response: String,
}

// AsrSession no longer holds the cpal::Stream.
// It holds the tools to manage the capture thread.
struct AsrSession {
    ws_receiver: futures_util::stream::SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>,
    stop_audio_tx: oneshot::Sender<()>,
    decoder: Decoder,
    // NEW: Thread management
    stop_capture_signal: Arc<AtomicBool>,
    capture_thread_handle: Option<JoinHandle<()>>,
}

// Add a Drop implementation to ensure the thread is cleaned up
impl Drop for AsrSession {
    fn drop(&mut self) {
        println!("Dropping AsrSession, stopping audio capture thread...");
        self.stop_capture_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = self.capture_thread_handle.take() {
            let _ = handle
                .join()
                .map_err(|e| eprintln!("Failed to join audio thread: {:?}", e));
        }
    }
}

pub struct AsrTask {
    pub id: String,
    pub example: String,
    session: Option<AsrSession>,
}

impl AsrTask {
    // 创建一个公有的 `new` 函数
    pub fn new(id: String, example: String) -> Self {
        Self {
            id,
            example,
            // 在这里将私有字段正确地初始化为 None
            session: None,
        }
    }
}

#[async_trait]
impl Task for AsrTask {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn execute(
        &mut self,
        control_rx: &mut watch::Receiver<ControlSignal>,
        context: WorkflowContext,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        println!("开始ASR任务: [{}].", self.id);

        INIT_CRYPTO.call_once(|| {
            if let Err(e) = rustls::crypto::ring::default_provider().install_default() {
                eprintln!("Warning: Failed to install rustls crypto provider: {:?}", e);
            }
        });

        loop {
            let signal = *control_rx.borrow();
            match signal {
                ControlSignal::Running => {
                    if self.session.is_none() {
                        println!("[{}] Initializing ASR session...", self.id);

                        //控制ocr任务同步开始
                        // app_handle.emit("ocr_event", "start".to_string()).ok();

                        dotenv::dotenv().ok();
                        let appid = env::var("APPID").map_err(|e| e.to_string())?;
                        let api_key = env::var("API_KEY").map_err(|e| e.to_string())?;
                        let api_secret = env::var("API_SECRET").map_err(|e| e.to_string())?;

                        let (audio_sender, audio_receiver) = mpsc::channel::<Vec<f32>>(100);

                        // --- Spawn the dedicated audio capture thread ---
                        let stop_capture_signal = Arc::new(AtomicBool::new(false));
                        let signal_clone = stop_capture_signal.clone();
                        let capture_thread_handle = thread::spawn(move || {
                            if let Err(e) = audio_capture_thread(audio_sender, signal_clone) {
                                eprintln!("Audio capture thread exited with error: {}", e);
                            }
                        });
                        // ---

                        let auth_url = build_auth_url(&api_key, &api_secret)?;
                        let (ws_stream, _) = connect_async(auth_url).await?;
                        let (ws_sender, ws_receiver) = ws_stream.split();
                        let (stop_audio_tx, stop_audio_rx) = oneshot::channel();

                        tokio::spawn(send_audio(ws_sender, audio_receiver, appid, stop_audio_rx));

                        self.session = Some(AsrSession {
                            ws_receiver,
                            stop_audio_tx,
                            decoder: Decoder::new(),
                            stop_capture_signal,
                            capture_thread_handle: Some(capture_thread_handle),
                        });
                    }

                    if let Some(session) = self.session.as_mut() {
                        tokio::select! {
                            Ok(_) = control_rx.changed() => { continue; }
                            Some(msg) = session.ws_receiver.next() => {
                                match msg {
                                    Ok(Message::Text(text)) => {
                                        let resp: ResponseFrame = serde_json::from_str(&text)?;
                                        if resp.code != 0 { return Err(format!("Server error {}: {}", resp.code, resp.message).into()); }
                                        if let Some(data) = resp.data {
                                            if let Some(result) = data.result {
                                                session.decoder.decode(&result);
                                                let intermediate_text = session.decoder.get_full_text();
                                                app_handle.emit("asr_intermediate_result", &intermediate_text).ok();
                                                print!("\rASR intermediate: {}", intermediate_text);
                                            }
                                            if data.status == 2 {
                                                println!("\n[{}] ASR session completed by server.", self.id);
                                                let final_text = session.decoder.get_full_text();
                                                let output = AsrTaskOutput { example: self.example.clone(), response: final_text };
                                                context.write().await.insert(self.id(), Box::new(output));
                                                self.session = None;
                                                app_handle.emit("asr_event", "complete".to_string()).ok();
                                                //同时结束osr任务
                                                // app_handle.emit("ocr_event", "stop".to_string()).ok();
                                                return Ok(());
                                            }
                                        }
                                    }
                                    Ok(Message::Close(_)) => { self.session = None;
                                        // app_handle.emit("ocr_event", "stop".to_string()).ok();
                                        return Err("WebSocket closed unexpectedly".into()); }
                                    Err(e) => { self.session = None; //app_handle.emit("ocr_event", "stop".to_string()).ok();
                                    return Err(Box::new(e)); }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                ControlSignal::Paused => {
                    println!("[{}] Paused.", self.id);
                    if self.session.is_some() {
                        println!("[{}] Tearing down session for pause.", self.id);
                        app_handle.emit("asr_event", "pause".to_string()).ok();
                        //app_handle.emit("ocr_event", "stop".to_string()).ok();
                        self.session = None;
                    }
                    if control_rx.changed().await.is_err() {
                        return Ok(());
                    }
                }
                ControlSignal::Stopped => {
                    println!("[{}] Stopped gracefully.", self.id);
                    if self.session.is_some() {
                        self.session = None;
                    }
                    return Ok(());
                }
            }
        }
    }
}
// [!END!]
