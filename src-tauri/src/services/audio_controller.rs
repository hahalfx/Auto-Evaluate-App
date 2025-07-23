use anyhow::{Context, Result};
use rodio::{Decoder, OutputStream, Sink, Source};
// 引入更多标准库模块用于路径操作
use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};
use tokio::sync::mpsc;

// 音频库的目录名
const MUSIC_DIRECTORY: &str = "/Volumes/应用/LLM Analysis Interface/public/audio";

/// 命令定义
#[derive(Debug)]
enum AudioCommand {
    Play(String),             // 播放指定路径的文件
    PlayMatching(String),     // 查找并播放匹配关键字的文件
    PlaySync(String),         // 同步播放指定路径的文件
    PlayMatchingSync(String, Option<String>), // 同步播放匹配关键字的文件
    Pause,
    Resume,
    Stop,
}

/// AudioController 的接口和实现完全保持不变。
#[derive(Clone, Debug)]
pub struct AudioController {
    sender: mpsc::Sender<AudioCommand>,
}

impl AudioController {
    pub fn new() -> (Self, tokio::task::JoinHandle<Result<()>>) {
        let (tx, rx) = mpsc::channel(32);
        let handle = tokio::spawn(audio_task(rx));
        (Self { sender: tx }, handle)
    }

    pub async fn play(&self, path: String) -> Result<()> {
        self.sender
            .send(AudioCommand::Play(path))
            .await
            .context("无法发送 Play 命令")
    }

    /// 新增方法：异步请求播放匹配关键字的音频。
    ///
    /// # Arguments
    ///
    /// * `keyword` - 用于在音乐库中搜索文件名的关键字。
    pub async fn play_matching(&self, keyword: String) -> Result<()> {
        self.sender
            .send(AudioCommand::PlayMatching(keyword))
            .await
            .context("无法发送 PlayMatching 命令")
    }

    /// 同步播放指定路径的音频文件，阻塞直到播放完成。
    ///
    /// # Arguments
    ///
    /// * `path` - 音频文件的完整路径。
    ///
    /// # Returns
    ///
    /// 当音频播放完成时返回Ok(())，如果播放失败则返回错误。
    pub async fn play_sync(&self, path: String) -> Result<()> {
        self.sender
            .send(AudioCommand::PlaySync(path))
            .await
            .context("无法发送 PlaySync 命令")
    }

    /// 同步播放匹配关键字的音频文件，阻塞直到播放完成。
    ///
    /// # Arguments
    ///
    /// * `keyword` - 用于在音乐库中搜索文件名的关键字。
    ///
    /// # Returns
    ///
    /// 当音频播放完成时返回Ok(())，如果找不到匹配文件或播放失败则返回错误。
    pub async fn play_matching_sync(&self, keyword: String, dir: Option<String>) -> Result<()> {
        self.sender
            .send(AudioCommand::PlayMatchingSync(keyword, dir))
            .await
            .context("无法发送 PlayMatchingSync 命令")
    }

    pub async fn pause(&self) -> Result<()> {
        self.sender
            .send(AudioCommand::Pause)
            .await
            .context("无法发送 Pause 命令")
    }

    pub async fn resume(&self) -> Result<()> {
        self.sender
            .send(AudioCommand::Resume)
            .await
            .context("无法发送 Resume 命令")
    }

    pub async fn stop(&self) -> Result<()> {
        self.sender
            .send(AudioCommand::Stop)
            .await
            .context("无法发送 Stop 命令")
    }
}

/// 在指定目录中查找第一个文件名包含关键字的音频文件。
fn find_matching_audio(dir: &Path, keyword: &str) -> Option<PathBuf> {
    // 确保音乐目录存在
    if !dir.is_dir() {
        eprintln!(
            "[Audio Task] 错误: 音乐目录 '{}' 未找到或不是一个目录。",
            dir.display()
        );
        return None;
    }

    // 读取目录条目，并进行迭代
    match fs::read_dir(dir) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    // 确保是文件而不是子目录
                    if path.is_file() {
                        // 获取文件名并转换为字符串
                        if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                            // 核心匹配逻辑：文件名是否包含关键字
                            if filename.contains(keyword) {
                                // 找到匹配，立即返回文件路径
                                return Some(path);
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            eprintln!(
                "[Audio Task] 错误: 无法读取音乐目录 '{}': {}",
                dir.display(),
                e
            );
        }
    }

    // 循环结束仍未找到匹配
    None
}

/// 同步播放音频文件的辅助函数
pub fn play_audio_sync(path: &Path) -> Result<()> {
    println!("[Audio Sync] 开始同步播放: {}", path.display());

    // 为每次同步播放创建独立的音频流和sink
    let (_stream, stream_handle) = OutputStream::try_default().context("无法创建音频输出流")?;
    let sink = Sink::try_new(&stream_handle).context("无法创建音频sink")?;

    // 打开并解码音频文件
    let file = File::open(path).with_context(|| format!("无法打开音频文件: {}", path.display()))?;
    let source = BufReader::new(file);
    let decoder =
        Decoder::new(source).with_context(|| format!("无法解码音频文件: {}", path.display()))?;

    let sample_rate = decoder.sample_rate();
    let channels = decoder.channels();
    println!(
        "[Audio Sync] 音频格式 - 采样率: {}Hz, 声道数: {}",
        sample_rate, channels
    );

    // 添加到sink并开始播放
    sink.append(decoder);

    println!("[Audio Sync] 开始播放，等待完成...");
    let start_time = std::time::Instant::now();

    // 等待播放完成
    sink.sleep_until_end();

    let duration = start_time.elapsed();
    println!("[Audio Sync] 播放完成，耗时: {:?}", duration);

    Ok(())
}

/// 同步播放指定路径的音频文件
pub fn play(path: &str) -> Result<()> {
    println!("[Audio Sync] 开始同步播放: {}", path);
    
    let path_buf = PathBuf::from(path);
    play_audio_sync(&path_buf)
}

/// 同步播放匹配关键字的音频文件的直接函数
pub fn play_matching_sync(keyword: &str, music_dir: Option<String>) -> Result<()> {
    println!("[Audio Sync] 查找匹配关键字 '{}' 的音频文件", keyword);

    // 使用map_or_else处理Option，同时确保music_dir变量在外部可用
    let music_dir = music_dir.map_or_else(
        || PathBuf::from(MUSIC_DIRECTORY), // None时使用默认目录
        PathBuf::from,                     // Some时直接转换为PathBuf
    );

    // 检查目录是否存在
    if !music_dir.is_dir() {
        let error_msg = format!("音乐目录 '{}' 不存在或不可访问", music_dir.display());
        eprintln!("[Audio Sync] {}", error_msg);
        return Err(anyhow::anyhow!(error_msg));
    }

    if let Some(found_path) = find_matching_audio(&music_dir, keyword) {
        println!(
            "[Audio Sync] 关键字 '{}' 匹配到文件: {}",
            keyword,
            found_path.display()
        );
        play_audio_sync(&found_path)
    } else {
        let error_msg = format!(
            "关键字 '{}' 在目录 '{}' 中未找到匹配的音频文件",
            keyword,
            music_dir.display()
        );
        eprintln!("[Audio Sync] {}", error_msg);
        Err(anyhow::anyhow!(error_msg))
    }
}

/// 后台音频任务
async fn audio_task(mut receiver: mpsc::Receiver<AudioCommand>) -> Result<()> {
    // 使用 tokio::task::spawn_blocking 来处理非 Send 的 rodio 组件
    let (audio_tx, mut audio_rx) = mpsc::channel::<AudioCommand>(32);

    // 在阻塞任务中处理音频
    let audio_handle = tokio::task::spawn_blocking(move || {
        // 为异步播放创建持久的音频流和sink
        let (_stream, stream_handle) = OutputStream::try_default()?;
        let sink = Sink::try_new(&stream_handle)?;

        println!("[Audio Task] 音频服务已启动，等待命令...");

        // 使用同步接收器
        let rt = tokio::runtime::Handle::current();
        loop {
            let command = match rt.block_on(audio_rx.recv()) {
                Some(cmd) => cmd,
                None => break,
            };

            println!("[Audio Task] 收到命令: {:?}", command);

            // 将异步播放逻辑提取为闭包
            let play_file_async = |path: &Path| {
                sink.stop(); // 播放前先停止当前内容
                match File::open(path) {
                    Ok(file) => {
                        let source = BufReader::new(file);
                        match Decoder::new(source) {
                            Ok(decoder) => {
                                let sample_rate = decoder.sample_rate();
                                let channels = decoder.channels();
                                println!(
                                    "[Audio Task] 音频格式 - 采样率: {}Hz, 声道数: {}",
                                    sample_rate, channels
                                );
                                sink.append(decoder);
                                println!(
                                    "[Audio Task] 开始播放文件: {} @ {:?}",
                                    path.display(),
                                    std::time::SystemTime::now()
                                );
                            }
                            Err(e) => eprintln!(
                                "[Audio Task] 解码音频文件 '{}' 失败: {:#?}",
                                path.display(),
                                e
                            ),
                        }
                    }
                    Err(e) => eprintln!("[Audio Task] 打开文件 '{}' 失败: {}", path.display(), e),
                }
            };

            match command {
                AudioCommand::Play(path) => {
                    play_file_async(&PathBuf::from(path));
                }
                // 异步播放匹配文件
                AudioCommand::PlayMatching(keyword) => {
                    let music_dir = Path::new(MUSIC_DIRECTORY);
                    if let Some(found_path) = find_matching_audio(music_dir, &keyword) {
                        println!(
                            "[Audio Task] 关键字 '{}' 匹配到文件: {}",
                            keyword,
                            found_path.display()
                        );
                        play_file_async(&found_path);
                    } else {
                        eprintln!(
                            "[Audio Task] 关键字 '{}' 在目录 '{}' 中未找到匹配的音频文件。",
                            keyword,
                            music_dir.display()
                        );
                    }
                }
                // 同步播放指定文件
                AudioCommand::PlaySync(path) => {
                    let file_path = PathBuf::from(path);
                    if let Err(e) = play_audio_sync(&file_path) {
                        eprintln!("[Audio Task] 同步播放失败: {}", e);
                    }
                }
                // 同步播放匹配文件
                AudioCommand::PlayMatchingSync(keyword, dir) => {
                    let music_dir = dir.map_or_else(
                        || PathBuf::from(MUSIC_DIRECTORY), // None时使用默认目录
                        PathBuf::from,                     // Some时直接转换为PathBuf
                    );

                    if let Some(found_path) = find_matching_audio(&music_dir, &keyword) {
                        println!(
                            "[Audio Task] 关键字 '{}' 匹配到文件: {}",
                            keyword,
                            found_path.display()
                        );
                        if let Err(e) = play_audio_sync(&found_path) {
                            eprintln!("[Audio Task] 同步播放失败: {}", e);
                        }
                    } else {
                        eprintln!(
                            "[Audio Task] 关键字 '{}' 在目录 '{}' 中未找到匹配的音频文件。",
                            keyword,
                            music_dir.display()
                        );
                    }
                }
                AudioCommand::Pause => {
                    sink.pause();
                    println!("[Audio Task] 音频已暂停");
                }
                AudioCommand::Resume => {
                    sink.play();
                    println!("[Audio Task] 音频已恢复");
                }
                AudioCommand::Stop => {
                    sink.stop();
                    println!("[Audio Task] 音频已停止");
                }
            }
        }

        println!("[Audio Task] 音频任务结束");
        Ok::<(), anyhow::Error>(())
    });

    println!("[Audio Task] 主服务已启动，等待命令...");

    // 转发命令到音频处理任务
    while let Some(command) = receiver.recv().await {
        if audio_tx.send(command).await.is_err() {
            eprintln!("[Audio Task] 音频处理任务已关闭");
            break;
        }
    }

    // 关闭音频发送器，让音频任务退出
    drop(audio_tx);

    // 等待音频任务完成
    if let Err(e) = audio_handle.await {
        eprintln!("[Audio Task] 音频任务错误: {}", e);
    }

    println!("[Audio Task] 接收器已关闭，任务结束");

    Ok(())
}

// // --- 主程序：演示如何使用新增功能 ---
// #[tokio::main]
// async fn main() -> Result<()> {
//     // 创建控制器
//     let (audio_controller, audio_task_handle) = AudioController::new();

//     println!("[Main] AudioController 已创建。");
//     println!("[Main] 请确保您已在项目目录下创建 'music' 文件夹并放入了音频文件。");

//     // --- 演示 play_matching ---

//     // 1. 尝试播放包含 "battle" 关键字的音乐
//     println!("\n[Main] 发送命令: 播放匹配 'battle' 的音乐...");
//     audio_controller.play_matching("battle".to_string()).await?;
//     tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

//     // 2. 尝试播放包含 "ending" 关键字的音乐
//     println!("\n[Main] 发送命令: 播放匹配 'ending' 的音乐...");
//     audio_controller.play_matching("ending".to_string()).await?;
//     tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

//     // 3. 暂停和继续
//     println!("\n[Main] 发送暂停命令...");
//     audio_controller.pause().await?;
//     tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

//     println!("\n[Main] 发送继续命令...");
//     audio_controller.resume().await?;
//     tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

//     // 4. 尝试播放一个不存在的关键字
//     println!("\n[Main] 发送命令: 播放匹配 'nonexistent' 的音乐...");
//     audio_controller.play_matching("nonexistent".to_string()).await?;
//     tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

//     // 销毁控制器并等待后台任务结束
//     drop(audio_controller);
//     audio_task_handle.await??;

//     println!("\n[Main] 程序执行完毕。");

//     Ok(())
// }
