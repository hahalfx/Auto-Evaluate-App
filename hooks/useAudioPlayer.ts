// hooks/useAudioPlayer.ts
import { useState, useRef, useEffect } from 'react';

interface UseAudioPlayerProps {
  onPlayEnd?: () => void;
  onPlayError?: (error: string) => void;
}

export function useAudioPlayer({ onPlayEnd, onPlayError }: UseAudioPlayerProps = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
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
    stopAudio
  };
}