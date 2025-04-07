// hooks/useAudioPlayer.ts
import { useState, useRef, useEffect } from 'react';

interface UseAudioPlayerProps {
  onPlayEnd?: () => void;
  onPlayError?: (error: string) => void;
}

export function useAudioPlayer({ onPlayEnd, onPlayError }: UseAudioPlayerProps = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
  useEffect(() => {
    fetchAudioFiles();
  }, []);

  const fetchAudioFiles = async () => {
    try {
      const res = await fetch('/api/audio-files');
      const data = await res.json();
      setAudioFiles(data.files);
    } catch (error) {
      console.error('获取音频文件列表失败:', error);
    }
  };

  // 根据文本查找匹配的音频文件
  const findMatchingAudio = (text: string): string | null => {
    if (!text || !audioFiles.length) return null;
    return audioFiles.find(file => 
      file.includes(text) && /^\d+/.test(file)
    ) || null;
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
        console.log("音频播放结束");
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
    const matchedFile = findMatchingAudio(text);
    if (!matchedFile) {
      onPlayError?.('未找到匹配的音频文件');
      return;
    }
    await playAudio(`/audio/${matchedFile}`);
  };

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
    stopAudio
  };
}