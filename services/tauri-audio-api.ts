import { invoke } from '@tauri-apps/api/core';

export class TauriAudioApiService { 
    static async playMatchAudio(keyword: string): Promise<void> {
        await invoke('play_match_audio', { keyword });
    }

    static async playMatchAudioWithurl(keyword: string, url: string): Promise<void> {
        await invoke('play_match_audio_with_url', { keyword, url });
    }
}