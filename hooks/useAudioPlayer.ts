// hooks/useAudioPlayer.ts
import { useState, useRef, useEffect, useCallback } from "react";
import { TauriApiService } from "@/services/tauri-api"; // Import Tauri API service
import type { TestSample, WakeWord } from "@/types/api"; // Import types

interface UseAudioPlayerProps {
  onPlayEnd?: () => void;
  onPlayError?: (error: string) => void;
}

export function useAudioPlayer({
  onPlayEnd,
  onPlayError,
}: UseAudioPlayerProps = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const savedAudioFiles = useRef<string[]>([]);
  const [wakeFiles, setWakeFiles] = useState<string[]>([]);
  const savedWakeFiles = useRef<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [dataStatus, setDataStatus] = useState("idle");

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 初始化时获取音频文件列表
  const fetchAllAudioData = useCallback(async () => {
    setDataStatus("loading");
    try {
      console.log("useAudioPlayer初始化 (Tauri)");
      
      // Fetch test samples
      console.log("Fetching test samples via Tauri...");
      const samples: TestSample[] = await TauriApiService.getAllSamples();
      const testAudioFileNames = samples
        .map(s => s.audio_file)
        .filter(f => f != null) as string[];
      setAudioFiles(testAudioFileNames);
      savedAudioFiles.current = testAudioFileNames;
      console.log("Tauri audioFiles (from samples) 加载完成", testAudioFileNames);

      // Fetch wake words
      console.log("Fetching wake words via Tauri...");
      const wakeWordsData: WakeWord[] = await TauriApiService.getAllWakeWords();
      const wakeAudioFileNames = wakeWordsData
        .map(w => w.audio_file)
        .filter(f => f != null) as string[];
      setWakeFiles(wakeAudioFileNames);
      savedWakeFiles.current = wakeAudioFileNames;
      console.log("Tauri wakeFiles (from wake words) 加载完成", wakeAudioFileNames);
      
      setDataStatus("succeeded");
    } catch (error) {
      console.error("获取 Tauri 音频数据失败:", error);
      onPlayError?.(`获取音频数据失败: ${error instanceof Error ? error.message : String(error)}`);
      setDataStatus("failed");
    }
  }, [onPlayError]);

  useEffect(() => {
    if (dataStatus === "idle") {
      fetchAllAudioData();
    }
  }, [dataStatus, fetchAllAudioData]);

  // 根据文本查找匹配的音频文件
  const findMatchingAudio = (
    currentAudioFiles: string[], // Parameter name clarified
    text: string
  ): string | null => {
    if (!text || !currentAudioFiles.length) return null;
    // The matching logic remains the same, assuming filenames still follow this pattern
    return (
      currentAudioFiles.find((file) => file.includes(text) && /^\d+/.test(file)) ||
      null
    );
  };

  // 参数：音频URL
  const playAudio = async (audioUrl: string) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      setIsPlaying(true);

      // Create audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Set up event listeners
      audio.onended = () => {
        console.log("音频播放结束，setIsPlaying(false)");
        setIsPlaying(false);
        if (onPlayEnd) onPlayEnd();
      };

      audio.onerror = (e) => {
        console.error("音频播放错误:", e);
        setIsPlaying(false);
        if (onPlayError) onPlayError("音频播放出错");
      };

      // Play audio
      await audio.play();
    } catch (error) {
      console.error("播放音频失败:", error);
      setIsPlaying(false);
      if (onPlayError) onPlayError("播放音频文件时出错");
    }
  };

  // 播放匹配当前文本的音频，参数：要匹配的音频名
  const playMatchedAudio = async (text: string) => {
    // Now directly use the `audioFiles` state, which is populated from Tauri
    const matchedFile = findMatchingAudio(audioFiles, text);
    
    if (!matchedFile) {
      // Fallback to savedAudioFiles.current if audioFiles is empty and it's the initial load phase
      // This might happen if playMatchedAudio is called before fetchAllAudioData completes fully
      // or if no audio_file was found for any sample.
      const fallbackMatchedFile = findMatchingAudio(savedAudioFiles.current, text);
      if (!fallbackMatchedFile) {
        onPlayError?.("未找到匹配的测试语料音频文件");
        return;
      }
      console.log("使用 savedAudioFiles.current 找到测试语料", text, fallbackMatchedFile);
      await playAudio(`/audio/${fallbackMatchedFile}`);
      return;
    }
    console.log("使用 audioFiles 找到测试语料", text, matchedFile);
    await playAudio(`/audio/${matchedFile}`);
  };

  // 带唤醒词播放测试语料，参数（唤醒词， 测试语料）
  const playWakeAudio = useCallback(
    async (text: string, sampleText: string) => {
      // Now directly use the `wakeFiles` state, populated from Tauri
      let matchedFile = findMatchingAudio(wakeFiles, text);

      if (!matchedFile) {
        // Fallback for wake words
        const fallbackMatchedFile = findMatchingAudio(savedWakeFiles.current, text);
        if (!fallbackMatchedFile) {
          onPlayError?.("未找到匹配的唤醒词音频文件");
          return;
        }
        console.log("使用 savedWakeFiles.current 找到唤醒词", text, fallbackMatchedFile);
        matchedFile = fallbackMatchedFile;
      } else {
        console.log("使用 wakeFiles 找到唤醒词", text, matchedFile);
      }
      
      console.log("测试语料 (Tauri)", text, sampleText);
      try {
        setIsPlaying(true);

        // Create audio element
        const audio = new Audio(`/audio/wakeword/${matchedFile}`); // URL construction assumes filename is in `matchedFile`
        audioRef.current = audio;

        // Set up event listeners
        audio.onended = () => {
          console.log(
            "唤醒词音频播放结束，接下来播放匹配的测试语料",
            sampleText
          );
          setIsPlaying(false);
          setTimeout(() => {
            playMatchedAudio(sampleText); // This will use the updated playMatchedAudio
          }, 1000);
        };

        audio.onerror = (e) => {
          console.error("音频播放错误:", e);
          setIsPlaying(false);
          if (onPlayError) onPlayError("音频播放出错");
        };

        // Play audio
        await audio.play();
      } catch (error) {
        console.error("播放音频失败:", error);
        setIsPlaying(false);
        if (onPlayError) onPlayError("播放音频文件时出错");
      }
    },
    [wakeFiles, audioFiles, onPlayError, playMatchedAudio] // Added audioFiles and playMatchedAudio to dependencies
  );

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }
  };

  return {
    isPlaying,
    playAudio,
    playMatchedAudio,
    playWakeAudio,
    stopAudio,
  };
}
