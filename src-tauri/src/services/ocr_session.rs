use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// OCR会话结果，包含时间检测和稳定性检测信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrSessionResult {
    /// 首次检测到文本的时间戳（前端提供）
    pub first_text_detected_time: Option<u64>,
    /// 文本稳定的时间戳（前端提供）
    pub text_stabilized_time: Option<u64>,
    /// 稳定后的完整文本内容
    pub final_text: String,
    /// 会话是否完成
    pub is_session_complete: bool,
    /// 是否应停止OCR
    pub should_stop_ocr: bool,
    /// 当前帧数
    pub current_frame: usize,
}

/// OCR会话管理器，跟踪整个OCR会话的状态
#[derive(Debug)]
pub struct OcrSessionManager {
    /// 是否已经检测到文本
    has_detected_text: bool,
    /// 首次检测到文本的时间戳
    first_text_timestamp: Option<u64>,
    /// 最后一次检测到文本的时间戳
    last_text_seen_timestamp: Option<u64>,
    /// 文本历史记录（最多30条）（1秒内的数据）
    text_history: VecDeque<(String, u64)>,
    /// 稳定性阈值（帧数）
    stability_threshold: usize,
    /// 文本相似度阈值
    similarity_threshold: f64,
    /// 无文本稳定超时（毫秒）
    no_text_stabilization_timeout: u64,
    /// 当前会话帧数
    current_frame: usize,
}

impl OcrSessionManager {
    /// 创建新的OCR会话管理器
    pub fn new() -> Self {
        Self {
            has_detected_text: false,
            first_text_timestamp: None,
            last_text_seen_timestamp: None,
            text_history: VecDeque::with_capacity(30),
            stability_threshold: 30,
            similarity_threshold: 0.95,
            no_text_stabilization_timeout: 5000, // 5秒
            current_frame: 0,
        }
    }

    /// 重置会话状态
    pub fn reset(&mut self) {
        self.has_detected_text = false;
        self.first_text_timestamp = None;
        self.last_text_seen_timestamp = None;
        self.text_history.clear();
        self.current_frame = 0;
    }

    /// 处理新的OCR结果，仅更新状态并返回待检查的数据
    pub fn process_frame(
        &mut self,
        text: String,
        timestamp: u64,
    ) -> (OcrSessionResult, Option<VecDeque<(String, u64)>>) {
        self.current_frame += 1;

        let clean_text = text.trim().to_string();
        let mut no_text_timeout_stabilized = false;

        if !clean_text.is_empty() {
            if !self.has_detected_text {
                self.has_detected_text = true;
                self.first_text_timestamp = Some(timestamp);
            }
            self.last_text_seen_timestamp = Some(timestamp);
        } else if self.has_detected_text {
            if let Some(last_seen) = self.last_text_seen_timestamp {
                if timestamp - last_seen > self.no_text_stabilization_timeout {
                    no_text_timeout_stabilized = true;
                }
            }
        }

        let mut history_for_check: Option<VecDeque<(String, u64)>> = None;
        if self.has_detected_text && !no_text_timeout_stabilized {
            self.text_history
                .push_back((clean_text.clone(), timestamp));

            if self.text_history.len() > self.stability_threshold {
                self.text_history.pop_front();
            }

            if self.text_history.len() >= self.stability_threshold {
                history_for_check = Some(self.text_history.clone());
            }
        }

        let is_stable = no_text_timeout_stabilized;

        let result = OcrSessionResult {
            first_text_detected_time: self.first_text_timestamp,
            text_stabilized_time: if is_stable { Some(timestamp) } else { None },
            final_text: self.get_latest_text(),
            is_session_complete: is_stable,
            should_stop_ocr: is_stable,
            current_frame: self.current_frame,
        };

        (result, history_for_check)
    }

    /// 检查文本是否稳定（连续多帧相似）
    pub fn is_text_stable(&self) -> bool {
        if self.text_history.len() < self.stability_threshold {
            return false;
        }

        let reference_text = &self.text_history[0].0;

        // 新增：如果参考文本为空，不进行稳定性检查
        if reference_text.is_empty() {
            return false;
        }

        // 计算所有文本与参考文本的相似度
        let similarities: Vec<f64> = self
            .text_history
            .iter()
            .map(|(text, _)| Self::calculate_similarity(reference_text, text))
            .collect();

        // 检查所有相似度是否都超过阈值
        similarities
            .iter()
            .all(|&sim| sim >= self.similarity_threshold)
    }

    /// 计算两个字符串的相似度（编辑距离算法）
    pub fn calculate_similarity(a: &str, b: &str) -> f64 {
        if a.is_empty() && b.is_empty() {
            return 1.0;
        }
        if a.is_empty() || b.is_empty() {
            return 0.0;
        }

        let distance = Self::levenshtein_distance(a, b);
        let max_len = a.len().max(b.len()) as f64;
        1.0 - (distance as f64 / max_len)
    }

    /// 计算编辑距离
    pub fn levenshtein_distance(a: &str, b: &str) -> usize {
        let a_chars: Vec<char> = a.chars().collect();
        let b_chars: Vec<char> = b.chars().collect();
        let a_len = a_chars.len();
        let b_len = b_chars.len();

        if a_len == 0 {
            return b_len;
        }
        if b_len == 0 {
            return a_len;
        }

        let mut dp = vec![vec![0; b_len + 1]; a_len + 1];

        for i in 0..=a_len {
            dp[i][0] = i;
        }
        for j in 0..=b_len {
            dp[0][j] = j;
        }

        for i in 1..=a_len {
            for j in 1..=b_len {
                let cost = if a_chars[i - 1] == b_chars[j - 1] {
                    0
                } else {
                    1
                };
                dp[i][j] = (dp[i - 1][j] + 1)
                    .min(dp[i][j - 1] + 1)
                    .min(dp[i - 1][j - 1] + cost);
            }
        }

        dp[a_len][b_len]
    }

    /// 获取最新的文本
    pub fn get_latest_text(&self) -> String {
        self.text_history
            .back()
            .map(|(text, _)| text.clone())
            .unwrap_or_default()
    }

    /// 获取稳定后的文本（使用出现频率最高的文本）
    pub fn get_stable_text(&self) -> String {
        if self.text_history.is_empty() {
            return String::new();
        }

        // 使用出现频率最高的文本作为最终结果
        use std::collections::HashMap;
        let mut frequency: HashMap<&str, usize> = HashMap::new();

        for (text, _) in &self.text_history {
            *frequency.entry(text).or_insert(0) += 1;
        }

        frequency
            .into_iter()
            .max_by_key(|&(_, count)| count)
            .map(|(text, _)| text.to_string())
            .unwrap_or_else(|| self.get_latest_text())
    }
}

// #[cfg(test)]
// mod tests {
//     use super::*;

//     #[test]
//     fn test_session_manager_initial_state() {
//         let manager = OcrSessionManager::new();
//         assert!(!manager.has_detected_text);
//         assert_eq!(manager.first_text_timestamp, None);
//         assert_eq!(manager.text_history.len(), 0);
//     }

//     #[test]
//     fn test_first_text_detection() {
//         let mut manager = OcrSessionManager::new();
//         let (result, _) = manager.process_frame("Hello".to_string(), 1000);

//         assert!(manager.has_detected_text);
//         assert_eq!(manager.first_text_timestamp, Some(1000));
//         assert_eq!(result.first_text_detected_time, Some(1000));
//     }

//     // 这个测试需要重写，因为它依赖于旧的同步逻辑
//     // #[test]
//     // fn test_text_stability() {
//     //     let mut manager = OcrSessionManager::new();

//     //     // 添加10帧相同文本
//     //     for i in 0..10 {
//     //         let result = manager.process_frame("Stable text".to_string(), 1000 + i * 100);
//     //         if i == 9 {
//     //             assert!(result.is_session_complete);
//     //             assert!(result.should_stop_ocr);
//     //             assert_eq!(result.text_stabilized_time, Some(1900));
//     //         }
//     //     }
//     // }

//     #[test]
//     fn test_text_similarity() {
//         let similarity = OcrSessionManager::calculate_similarity("hello", "hello");
//         assert!((similarity - 1.0).abs() < f64::EPSILON);

//         let similarity = OcrSessionManager::calculate_similarity("hello", "world");
//         assert!(similarity < 0.5);
//     }

//     #[test]
//     fn test_levenshtein_distance() {
//         assert_eq!(
//             OcrSessionManager::levenshtein_distance("kitten", "sitting"),
//             3
//         );
//         assert_eq!(OcrSessionManager::levenshtein_distance("hello", "hello"), 0);
//         assert_eq!(OcrSessionManager::levenshtein_distance("", "abc"), 3);
//     }
// }
