import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StreamVaultStatus } from '@/lib/tmdb-types';
import { saveToDisk, loadFromDisk } from '@/lib/persistence';

export type WatchStatus = 'want' | 'watching' | 'done' | 'paused';

export interface WatchlistItem {
    id: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath: string | null;
    rating: number;
    year: string;
    genres: string[];
    status: WatchStatus;
    contentStatus: StreamVaultStatus;
    progress?: string;
    addedAt: string;
    leavingSoon?: boolean;
}

interface WatchlistStore {
    items: WatchlistItem[];
    addItem: (item: Omit<WatchlistItem, 'addedAt' | 'status'>) => void;
    removeItem: (id: number) => void;
    updateStatus: (id: number, status: WatchStatus) => void;
    updateProgress: (id: number, progress: string) => void;
    isInWatchlist: (id: number) => boolean;
    getItem: (id: number) => WatchlistItem | undefined;
    syncWithDisk: () => Promise<void>;
}

export const useWatchlist = create<WatchlistStore>()(
    persist(
        (set, get) => ({
            items: [],
            addItem: (item) => {
                set((state) => {
                    const newItems = state.items.some(i => i.id === item.id)
                        ? state.items
                        : [{ ...item, status: 'want' as WatchStatus, addedAt: new Date().toISOString() }, ...state.items];
                    saveToDisk('watchlist', { items: newItems });
                    return { items: newItems };
                });
            },
            removeItem: (id) => {
                set((state) => {
                    const newItems = state.items.filter(i => i.id !== id);
                    saveToDisk('watchlist', { items: newItems });
                    return { items: newItems };
                });
            },
            updateStatus: (id, status) => {
                set((state) => {
                    const newItems = state.items.map(i => i.id === id ? { ...i, status } : i);
                    saveToDisk('watchlist', { items: newItems });
                    return { items: newItems };
                });
            },
            updateProgress: (id, progress) => {
                set((state) => {
                    const newItems = state.items.map(i => i.id === id ? { ...i, progress } : i);
                    saveToDisk('watchlist', { items: newItems });
                    return { items: newItems };
                });
            },
            isInWatchlist: (id) => get().items.some(i => i.id === id),
            getItem: (id) => get().items.find(i => i.id === id),
            syncWithDisk: async () => {
                const diskData = await loadFromDisk('watchlist');
                if (diskData && diskData.items) {
                    set({ items: diskData.items });
                }
            }
        }),
        { name: 'sv_watchlist' }
    )
);
