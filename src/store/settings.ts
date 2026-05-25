import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type DefaultQuality = '720p' | '1080p' | '4K';
export type PreferredSource = 'torrent' | 'direct' | 'ask';
export type PreferredExternalPlayer = 'system' | 'vlc' | 'mpv' | 'custom';

interface SettingsState {
    defaultQuality: DefaultQuality;
    preferredSource: PreferredSource;
    preferredExternalPlayer: PreferredExternalPlayer;
    customPlayerPath: string;
    setDefaultQuality: (q: DefaultQuality) => void;
    setPreferredSource: (s: PreferredSource) => void;
    setPreferredExternalPlayer: (p: PreferredExternalPlayer) => void;
    setCustomPlayerPath: (path: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            defaultQuality: '720p',
            preferredSource: 'ask',
            preferredExternalPlayer: 'system',
            customPlayerPath: '',
            setDefaultQuality: (defaultQuality) => set({ defaultQuality }),
            setPreferredSource: (preferredSource) => set({ preferredSource }),
            setPreferredExternalPlayer: (preferredExternalPlayer) => set({ preferredExternalPlayer }),
            setCustomPlayerPath: (customPlayerPath) => set({ customPlayerPath }),
        }),
        {
            name: 'streamvault-settings',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
