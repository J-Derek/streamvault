import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type DefaultQuality = '720p' | '1080p' | '4K';
export type PreferredSource = 'torrent' | 'direct' | 'ask';

interface SettingsState {
    defaultQuality: DefaultQuality;
    preferredSource: PreferredSource;
    setDefaultQuality: (q: DefaultQuality) => void;
    setPreferredSource: (s: PreferredSource) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            defaultQuality: '720p',
            preferredSource: 'ask',
            setDefaultQuality: (defaultQuality) => set({ defaultQuality }),
            setPreferredSource: (preferredSource) => set({ preferredSource }),
        }),
        {
            name: 'streamvault-settings',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
