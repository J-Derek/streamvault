import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { StreamVaultMedia } from '@/lib/tmdb-types';
import { saveToDisk, loadFromDisk } from '@/lib/persistence';

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'error' | 'completed';

export interface DownloadTask {
    media: StreamVaultMedia;
    progress: number;
    status: DownloadStatus;
    error?: string;
    size?: number; // total size in bytes
    downloadedBytes?: number;
    speed?: string; // e.g. "2.4 MB/s"
    peers?: number;
    filePath?: string; // For Tauri (local path to encrypted file)
    blobId?: string; // For Web (IndexedDB key)
    infoHash?: string;
}

export interface GlobalStats {
    fetched_bytes: number;
    uploaded_bytes: number;
    uptime_seconds: number;
    live_peers: number;
}

interface DownloadState {
    tasks: Record<string, DownloadTask>; // Key: id or id::infoHash
    offlineLibrary: Record<number, DownloadTask>; // Completed movie/whole-show downloads
    episodeLibrary: Record<string, DownloadTask>; // Completed episode downloads, key: "{showId}:s{season}e{episode}"
    p2pEngineReady: boolean;
    globalStats: GlobalStats | null;

    // Actions
    addTask: (media: StreamVaultMedia, infoHash?: string) => string;
    removeTask: (taskKey: string) => Promise<void>;
    updateProgress: (taskKey: string, progress: number, downloadedBytes?: number, totalSize?: number, speed?: string, peers?: number) => void;
    setStatus: (taskKey: string, status: DownloadStatus, error?: string) => void;
    completeDownload: (taskKey: string, pathOrBlob: string, size: number) => void;
    completeEpisodeDownload: (episodeKey: string, taskKey: string, pathOrBlob: string, size: number) => void;
    removeEpisodeDownload: (episodeKey: string) => Promise<void>;
    setP2pReady: (ready: boolean) => void;
    setGlobalStats: (stats: GlobalStats) => void;
    deleteOfflineItem: (id: number) => Promise<void>;
    clearTasks: () => void;
    syncWithDisk: () => Promise<void>;
}

export const useDownloadStore = create<DownloadState>()(
    persist(
        (set, get) => ({
            tasks: {},
            offlineLibrary: {},
            episodeLibrary: {},
            p2pEngineReady: false,
            globalStats: null,

            addTask: (media, infoHash) => {
                const taskKey = infoHash ? `${media.id}::${infoHash}` : String(media.id);
                set((state) => {
                    if (state.tasks[taskKey] || state.offlineLibrary[media.id]) return state;
                    const newTasks = {
                        ...state.tasks,
                        [taskKey]: {
                            media,
                            progress: 0,
                            status: 'queued' as DownloadStatus,
                            infoHash
                        }
                    };
                    saveToDisk('downloads', { tasks: newTasks, offlineLibrary: state.offlineLibrary, episodeLibrary: state.episodeLibrary });
                    return { tasks: newTasks };
                });
                return taskKey;
            },

            removeTask: async (taskKey) => {
                const task = get().tasks[taskKey];
                const mediaId = parseInt(taskKey.split('::')[0], 10);

                const isTauri = typeof window !== 'undefined' &&
                    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

                if (isTauri && task?.infoHash && !isNaN(mediaId)) {
                    try {
                        const { invoke } = await import("@tauri-apps/api/core");
                        await invoke("stop_p2p_download", { id: mediaId });
                    } catch (e) {
                        console.error("Failed to stop P2P download:", e);
                    }
                }

                set((state) => {
                    const newTasks = { ...state.tasks };
                    delete newTasks[taskKey];
                    saveToDisk('downloads', { tasks: newTasks, offlineLibrary: state.offlineLibrary, episodeLibrary: state.episodeLibrary });
                    return { tasks: newTasks };
                });
            },

            updateProgress: (taskKey, progress, downloadedBytes, totalSize, speed, peers) => {
                set((state) => {
                    if (!state.tasks[taskKey]) return state;
                    const newTasks = {
                        ...state.tasks,
                        [taskKey]: {
                            ...state.tasks[taskKey],
                            progress,
                            downloadedBytes,
                            speed,
                            peers,
                            size: totalSize ?? state.tasks[taskKey].size
                        }
                    };
                    saveToDisk('downloads', { tasks: newTasks, offlineLibrary: state.offlineLibrary, episodeLibrary: state.episodeLibrary });
                    return { tasks: newTasks };
                });
            },

            setStatus: (taskKey, status, error) => {
                set((state) => {
                    if (!state.tasks[taskKey]) return state;
                    const newTasks = {
                        ...state.tasks,
                        [taskKey]: {
                            ...state.tasks[taskKey],
                            status,
                            error
                        }
                    };
                    saveToDisk('downloads', { tasks: newTasks, offlineLibrary: state.offlineLibrary, episodeLibrary: state.episodeLibrary });
                    return { tasks: newTasks };
                });
            },

            completeDownload: async (taskKey, pathOrBlob, size) => {
                const state = get();
                const task = state.tasks[taskKey];
                if (!task) return;

                const isTauri = typeof window !== 'undefined' &&
                    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

                const completedTask: DownloadTask = {
                    ...task,
                    status: 'completed' as DownloadStatus,
                    progress: 100,
                    size,
                    filePath: isTauri ? pathOrBlob : undefined,
                    blobId: !isTauri ? pathOrBlob : undefined,
                };

                const newTasks = { ...state.tasks };
                delete newTasks[taskKey];

                const newLibrary = {
                    ...state.offlineLibrary,
                    [task.media.id]: completedTask
                };

                saveToDisk('downloads', { tasks: newTasks, offlineLibrary: newLibrary, episodeLibrary: state.episodeLibrary });

                set({ tasks: newTasks, offlineLibrary: newLibrary });

                // Persist to SQLite database (single source of truth)
                if (isTauri && task.media) {
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        await invoke('db_save_download', {
                            record: {
                                id: task.media.id,
                                title: task.media.title || task.media.name || `Movie ${task.media.id}`,
                                year: task.media.year ? parseInt(String(task.media.year)) : null,
                                file_path: pathOrBlob || '',
                                file_size: size || null,
                                info_hash: task.infoHash || null,
                                status: 'complete',
                                downloaded_at: new Date().toISOString(),
                            }
                        });
                    } catch (e) {
                        console.error('Failed to save download record:', e);
                    }
                }
            },

            completeEpisodeDownload: (episodeKey, taskKey, pathOrBlob, size) => {
                set((state) => {
                    const task = state.tasks[taskKey];
                    if (!task) return state;

                    const isTauri = typeof window !== 'undefined' &&
                        ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

                    const completedTask: DownloadTask = {
                        ...task,
                        status: 'completed' as DownloadStatus,
                        progress: 100,
                        size,
                        filePath: isTauri ? pathOrBlob : undefined,
                        blobId: !isTauri ? pathOrBlob : undefined,
                    };

                    const newTasks = { ...state.tasks };
                    delete newTasks[taskKey];

                    const newLibrary = {
                        ...state.episodeLibrary,
                        [episodeKey]: completedTask
                    };

                    saveToDisk('downloads', { tasks: newTasks, offlineLibrary: state.offlineLibrary, episodeLibrary: newLibrary });
                    return { tasks: newTasks, episodeLibrary: newLibrary };
                });
            },

            removeEpisodeDownload: async (episodeKey) => {
                const state = get();
                const task = state.episodeLibrary[episodeKey];
                if (!task) return;

                const isTauri = typeof window !== 'undefined' &&
                    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

                if (isTauri && task.media) {
                    try {
                        const { invoke } = await import("@tauri-apps/api/core");
                        await invoke("delete_media_file", { id: task.media.id });
                    } catch (e) {
                        console.error("Failed to delete episode media file:", e);
                    }
                }

                set((state) => {
                    const newLibrary = { ...state.episodeLibrary };
                    delete newLibrary[episodeKey];
                    saveToDisk('downloads', { tasks: state.tasks, offlineLibrary: state.offlineLibrary, episodeLibrary: newLibrary });
                    return { episodeLibrary: newLibrary };
                });
            },

            setP2pReady: (ready) => {
                set({ p2pEngineReady: ready });
            },

            setGlobalStats: (stats) => {
                set({ globalStats: stats });
            },

            deleteOfflineItem: async (id) => {
                const state = get();
                const task = state.offlineLibrary[id];
                if (!task) return;

                const isTauri = typeof window !== 'undefined' &&
                    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

                if (isTauri) {
                    try {
                        const { invoke } = await import("@tauri-apps/api/core");
                        await invoke("delete_media_file", { id });
                    } catch (e) {
                        console.error("Failed to delete media file:", e);
                    }
                }

                set((state) => {
                    const newLibrary = { ...state.offlineLibrary };
                    delete newLibrary[id];
                    saveToDisk('downloads', { tasks: state.tasks, offlineLibrary: newLibrary, episodeLibrary: state.episodeLibrary });
                    return { offlineLibrary: newLibrary };
                });
            },

            clearTasks: () => {
                set((state) => {
                    saveToDisk('downloads', { tasks: {}, offlineLibrary: state.offlineLibrary, episodeLibrary: state.episodeLibrary });
                    return { tasks: {} };
                });
            },

            syncWithDisk: async () => {
                const diskData = await loadFromDisk('downloads');
                if (diskData) {
                    // Check if we need to auto-resume engine before merging
                    const currentStoreTasks = get().tasks;
                    const mergedTasks = { ...(diskData.tasks || {}), ...currentStoreTasks };

                    const hasActiveTasks = Object.values(mergedTasks).some((t: any) =>
                        t.status === 'downloading' || t.status === 'queued' || t.status === 'paused'
                    );

                    // MERGE disk data with current in-memory state
                    // Disk data wins for offlineLibrary (it has the completed items)
                    // Current state wins for tasks (it has the live progress)
                    set((current) => ({
                        tasks: mergedTasks,
                        offlineLibrary: { ...current.offlineLibrary, ...(diskData.offlineLibrary || {}) },
                        episodeLibrary: { ...current.episodeLibrary, ...(diskData.episodeLibrary || {}) }
                    }));

                    const isTauri = typeof window !== 'undefined' &&
                        ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

                    if (hasActiveTasks && isTauri) {
                        try {
                            const { invoke } = await import("@tauri-apps/api/core");
                            await invoke("spawn_p2p_engine");
                            console.log("Persistence: Auto-resumed P2P engine for active tasks.");
                        } catch (e) {
                            console.error("Persistence: Failed to auto-resume P2P engine", e);
                        }
                    }

                    console.log("Persistence: Merged disk data with store",
                        Object.keys(diskData.offlineLibrary || {}).length, "offline items from disk");
                }
            }
        }),
        {
            name: 'streamvault-downloads',
            storage: createJSONStorage(() => localStorage),
            onRehydrateStorage: () => {
                return (_state, _error) => {
                    // After Zustand hydrates from localStorage, merge with Tauri disk data
                    // This ensures completed downloads survive across restarts
                    setTimeout(() => {
                        useDownloadStore.getState().syncWithDisk();
                    }, 500);
                };
            },
        }
    )
);
