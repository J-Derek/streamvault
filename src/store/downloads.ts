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
    createdAt?: number;
    magnetUrl?: string;
    streamUrl?: string;
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
    addTask: (media: StreamVaultMedia, infoHash?: string, magnetUrl?: string, streamUrl?: string, customTaskKey?: string) => string;
    removeTask: (taskKey: string) => Promise<void>;
    updateProgress: (taskKey: string, progress: number, downloadedBytes?: number, totalSize?: number, speed?: string, peers?: number) => void;
    setStatus: (taskKey: string, status: DownloadStatus, error?: string) => void;
    completeDownload: (taskKey: string, pathOrBlob: string, size: number, directMedia?: StreamVaultMedia) => Promise<void>;
    completeEpisodeDownload: (episodeKey: string, taskKey: string, pathOrBlob: string, size: number) => Promise<void>;
    removeEpisodeDownload: (episodeKey: string) => Promise<void>;
    setP2pReady: (ready: boolean) => void;
    setGlobalStats: (stats: GlobalStats) => void;
    deleteOfflineItem: (id: number) => Promise<void>;
    clearTasks: () => Promise<void>;
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

            addTask: (media, infoHash, magnetUrl, streamUrl, customTaskKey) => {
                const isEpisode = media.title.includes(' - S') && media.title.includes(':E');
                let calculatedKey = infoHash ? `${media.id}::${infoHash}` : String(media.id);
                if (infoHash && isEpisode) {
                    const match = media.title.match(/(.*)\s+-\s+S(\d+):E(\d+)/);
                    if (match) {
                        const showId = media.id;
                        const season = match[2];
                        const episode = match[3];
                        const episodeKey = `${showId}:s${season}e${episode}`;
                        calculatedKey = `${episodeKey}::${infoHash}`;
                    }
                }
                const taskKey = customTaskKey || calculatedKey;

                set((state) => {
                    if (state.tasks[taskKey] || state.offlineLibrary[media.id]) return state;
                    const newTasks = {
                        ...state.tasks,
                        [taskKey]: {
                            media,
                            progress: 0,
                            status: 'queued' as DownloadStatus,
                            infoHash,
                            createdAt: Date.now(),
                            magnetUrl,
                            streamUrl
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

            completeDownload: async (taskKey, pathOrBlob, size, directMedia?) => {
                const state = get();
                const task = state.tasks[taskKey];
                const media = directMedia || task?.media;
                if (!media) return;

                const isTauri = typeof window !== 'undefined' &&
                    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

                const finalPath = (pathOrBlob && pathOrBlob !== 'p2p-engine') ? pathOrBlob : (task?.downloadPath || '');
                const completedTask: DownloadTask = {
                    media,
                    status: 'completed' as DownloadStatus,
                    progress: 100,
                    size,
                    filePath: isTauri ? finalPath : undefined,
                    blobId: !isTauri ? pathOrBlob : undefined,
                };

                const newTasks = { ...state.tasks };
                delete newTasks[taskKey];

                const newLibrary = {
                    ...state.offlineLibrary,
                    [media.id]: completedTask
                };

                saveToDisk('downloads', { tasks: newTasks, offlineLibrary: newLibrary, episodeLibrary: state.episodeLibrary });

                set({ tasks: newTasks, offlineLibrary: newLibrary });

                // Persist to SQLite database (single source of truth)
                if (isTauri) {
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        await invoke('db_save_download', {
                            record: {
                                id: media.id,
                                title: media.title || media.name || `Movie ${media.id}`,
                                year: media.year ? parseInt(String(media.year)) : null,
                                file_path: finalPath,
                                file_size: size || null,
                                info_hash: task?.infoHash || null,
                                status: 'complete',
                                downloaded_at: new Date().toISOString(),
                            }
                        });
                    } catch (e) {
                        console.error('Failed to save download record:', e);
                    }
                }
            },

            completeEpisodeDownload: async (episodeKey, taskKey, pathOrBlob, size) => {
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

                // Persist to SQLite database (single source of truth)
                const isTauri = typeof window !== 'undefined' &&
                    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

                if (isTauri) {
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        const state = get();
                        const completedTask = state.episodeLibrary[episodeKey];
                        if (completedTask && completedTask.media) {
                            const [showIdStr, epMatch] = episodeKey.split(':s');
                            const showId = parseInt(showIdStr, 10);
                            let seasonNum = null;
                            let episodeNum = null;
                            if (epMatch) {
                                const [sStr, eStr] = epMatch.split('e');
                                seasonNum = parseInt(sStr, 10);
                                episodeNum = parseInt(eStr, 10);
                            }

                            await invoke('db_save_download', {
                                record: {
                                    id: showId,
                                    title: completedTask.media.title || completedTask.media.name || `TV Show ${showId}`,
                                    year: completedTask.media.year ? parseInt(String(completedTask.media.year)) : null,
                                    file_path: completedTask.filePath || '',
                                    file_size: completedTask.size || null,
                                    info_hash: completedTask.infoHash || null,
                                    status: 'complete',
                                    downloaded_at: new Date().toISOString()
                                }
                            });
                        }
                    } catch (e) {
                        console.error('Failed to save episode download record:', e);
                    }
                }
            },

            removeEpisodeDownload: async (episodeKey) => {
                const state = get();
                const task = state.episodeLibrary[episodeKey];
                if (!task) return;

                const isTauri = typeof window !== 'undefined' &&
                    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

                if (isTauri) {
                    try {
                        const { invoke } = await import("@tauri-apps/api/core");
                        if (task.filePath) {
                            await invoke("delete_file_by_path", { path: task.filePath });
                        } else if (task.media) {
                            await invoke("delete_media_file", { id: task.media.id });
                        }
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

            clearTasks: async () => {
                const isTauri = typeof window !== 'undefined' &&
                    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

                if (isTauri) {
                    try {
                        const { invoke } = await import("@tauri-apps/api/core");
                        await invoke("kill_p2p_engine");
                        console.log("Killed P2P engine because all tasks were cleared.");
                    } catch (e) {
                        console.error("Failed to kill P2P engine on clear:", e);
                    }
                }

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
