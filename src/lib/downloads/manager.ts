import { useDownloadStore, type DownloadStatus } from "@/store/downloads";
export { useDownloadStore };
import { saveToDisk } from "@/lib/persistence";
import type { StreamVaultMedia } from "@/lib/tmdb-types";

// Helper for platform detection
const isTauri = !!(
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.TAURI_ENV_PLATFORM) ||
    (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window))
);

const P2P_BASE = "http://127.0.0.1:8083/p2p-proxy";

export const initDownloadManager = async () => {
    // Register Service Worker for Web Mode
    if ('serviceWorker' in navigator && !isTauri) {
        try {
            await navigator.serviceWorker.register('/sw.js');
            console.log("DownloadManager: ServiceWorker registered");
        } catch (e) {
            console.error("SW registration failed:", e);
        }
    }

    if (isTauri) {
        try {
            // Late import to avoid issues in pure web
            const { listen } = await import("@tauri-apps/api/event");
            const { invoke } = await import("@tauri-apps/api/core");
            await listen("download-progress", (event: any) => {
                const { id, progress, downloaded_bytes, total_bytes, speed, peers } = event.payload;
                const state = useDownloadStore.getState();
                const taskKey = Object.keys(state.tasks).find(k => k.startsWith(`${id}::`) || k.startsWith(`${id}:s`)) || String(id);
                state.updateProgress(taskKey, progress, downloaded_bytes, total_bytes, speed, peers);
            });

            console.log("DownloadManager: Tauri listeners initialized");

            // Auto-scan library on app launch
            setTimeout(() => {
                scanAndSyncLibrary().catch(e => console.error("Auto-scan failed:", e));
            }, 3000); // Give it a 3s delay so it doesn't block initial rendering

            // ── Unified status + progress reconciler (runs in Tauri too) ────────
            const reconcileTorrentStates = async () => {
                try {
                    // 1. Engine health check (regardless of active tasks — needed for manual start)
                    const torrentListRes = await fetch(`${P2P_BASE}/torrents`);
                    const isReady = torrentListRes.ok;
                    useDownloadStore.getState().setP2pReady(isReady);
                    if (!isReady) return;

                    // 2. Global stats
                    const statsRes = await fetch(`${P2P_BASE}/stats`);
                    if (statsRes.ok) {
                        const s = await statsRes.json();
                        useDownloadStore.getState().setGlobalStats({
                            fetched_bytes: s.counters?.fetched_bytes ?? 0,
                            uploaded_bytes: s.counters?.uploaded_bytes ?? 0,
                            uptime_seconds: s.uptime_seconds ?? 0,
                            live_peers: s.peers?.live ?? 0,
                        });
                    }

                    // 3. Reconcile each persisted task against engine state
                    const state = useDownloadStore.getState();

                    // We need the torrent list to know which torrents are actually in the engine
                    const torrents = await torrentListRes.json();
                    const engineHashes = (torrents.torrents || []).map((t: any) => t.info_hash.toLowerCase());

                    for (const [taskKey, task] of Object.entries(state.tasks)) {
                        if (!task.infoHash) continue;

                        const taskHash = task.infoHash.toLowerCase();

                        // Only try to poll stats if the engine actually knows about this torrent
                        if (engineHashes.includes(taskHash)) {
                            try {
                                const r = await fetch(`${P2P_BASE}/torrents/${taskHash}/stats/v1`);
                                if (!r.ok) continue;
                                const ts = await r.json();

                                const progress = ts.total_bytes > 0
                                    ? (ts.progress_bytes / ts.total_bytes) * 100
                                    : 0;

                                // Correct field paths from actual rqbit API response
                                const speedMbps: number = ts.live?.download_speed?.mbps ?? 0;
                                const speed = `${speedMbps.toFixed(2)} MB/s`;
                                const peers: number = ts.live?.snapshot?.peer_stats?.live ?? 0;

                                state.updateProgress(taskKey, progress, ts.progress_bytes, ts.total_bytes, speed, peers);
                                // Re-read live state after the mutation above
                                const liveState = useDownloadStore.getState();
                                if (ts.finished && liveState.tasks[taskKey] && (liveState.tasks[taskKey].status !== "completed" || liveState.tasks[taskKey].filePath === "p2p-engine")) {
                                    const { invoke } = await import("@tauri-apps/api/core");
                                    try {
                                        const res: any = await invoke("sync_download_path", { id: task.media.id, infoHash: taskHash });
                                        // Check if this is an episode download (taskKey contains season/episode info)
                                        const isEpisode = taskKey.includes(':s');
                                        if (isEpisode) {
                                            const episodeKey = taskKey.split('::')[0];
                                            liveState.completeEpisodeDownload(episodeKey, taskKey, res, ts.total_bytes);
                                        } else {
                                            liveState.completeDownload(taskKey, res, ts.total_bytes);
                                        }
                                    } catch (err) {
                                        console.error("Failed to finalize P2P download:", err);
                                        const isEpisode = taskKey.includes(':s');
                                        if (isEpisode) {
                                            const episodeKey = taskKey.split('::')[0];
                                            liveState.completeEpisodeDownload(episodeKey, taskKey, "p2p-engine", ts.total_bytes);
                                        } else {
                                            liveState.completeDownload(taskKey, "p2p-engine", ts.total_bytes);
                                        }
                                    } finally {
                                        await invoke("stop_torrent_engine", { infoHash: taskHash }).catch(() => {});
                                    }

                                    // Auto-trigger on download completion
                                    scanAndSyncLibrary().catch(console.error);

                                    // Check if this was the last active task
                                    const freshState = useDownloadStore.getState();
                                    const activeCount = Object.values(freshState.tasks).filter(t => t.status !== "completed" && t.status !== "error").length;
                                    if (activeCount === 0) {
                                        await invoke("kill_p2p_engine");
                                        console.log("All downloads finished. Engine killed down to save resources.");
                                    }
                                }
                            } catch (_) {
                                // Ignore network errors per-torrent
                            }
                        } else {
                            // The engine doesn't have this torrent (e.g. it was restarted and not re-added)
                            // If it's not completed, it's stuck. We leave the status alone, but the user 
                            // can clear/retry it in the UI.
                        }
                    }
                } catch (e) {
                    console.error("P2P reconcile error:", e);
                    useDownloadStore.getState().setP2pReady(false);
                }
            };

            // Run immediately on startup, then every 3 seconds
            reconcileTorrentStates();
            setInterval(reconcileTorrentStates, 3000);
        } catch (e) {
            console.error("Failed to init Tauri listeners:", e);
        }
    } else {
        // Web-based polling for rqbit via Native Proxy (Avoid CORS)
        const activeWebIntervals = new Map<string, boolean>();

        const webPoll = async () => {
            let isReady = false;
            try {
                const res = await fetch(`${P2P_BASE}/torrents`);
                isReady = res.ok;
                useDownloadStore.getState().setP2pReady(isReady);

                if (isReady) {
                    const torrents = await res.json();
                    const state = useDownloadStore.getState();

                    // Poll global stats
                    const statsRes = await fetch(`${P2P_BASE}/stats`);
                    if (statsRes.ok) {
                        const stats = await statsRes.json();
                        state.setGlobalStats({
                            fetched_bytes: stats.counters.fetched_bytes,
                            uploaded_bytes: stats.counters.uploaded_bytes,
                            uptime_seconds: stats.uptime_seconds,
                            live_peers: stats.peers.live
                        });
                    }

                    // Update individual progress safely based on infoHash
                    for (const t of (torrents.torrents || [])) {
                        const engineHash = t.info_hash.toLowerCase();

                        // Find any tasks in our store that match this engine hash
                        const taskEntries = Object.entries(state.tasks).filter(
                            ([_, task]) => task.infoHash?.toLowerCase() === engineHash
                        );

                        if (taskEntries.length > 0) {
                            const statsUrl = `${P2P_BASE}/torrents/${engineHash}/stats/v1`;
                            const sRes = await fetch(statsUrl);
                            if (sRes.ok) {
                                const s = await sRes.json();
                                const progress = s.total_bytes > 0 ? (s.progress_bytes / s.total_bytes) * 100 : 0;
                                const speedMbps: number = s.live?.download_speed?.mbps ?? 0;
                                const speed = `${speedMbps.toFixed(2)} MB/s`;
                                const peers: number = s.live?.snapshot?.peer_stats?.live ?? 0;

                                for (const [taskKey, _] of taskEntries) {
                                    state.updateProgress(taskKey, progress, s.progress_bytes, s.total_bytes, speed, peers);
                                    // Re-read live state after the mutation above
                                    const liveState = useDownloadStore.getState();
                                    if (s.finished && liveState.tasks[taskKey] && liveState.tasks[taskKey].status !== 'completed') {
                                        const isEpisode = taskKey.includes(':s');
                                        if (isEpisode) {
                                            const episodeKey = taskKey.split('::')[0];
                                            liveState.completeEpisodeDownload(episodeKey, taskKey, "web-p2p", s.total_bytes);
                                        } else {
                                            liveState.completeDownload(taskKey, "web-p2p", s.total_bytes);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                useDownloadStore.getState().setP2pReady(false);
            }

            // Client-side mock progress simulator for web testing
            if (!isReady) {
                const state = useDownloadStore.getState();
                const totalSize = 350 * 1024 * 1024; // 350 MB

                for (const [taskKey, task] of Object.entries(state.tasks)) {
                    if (task.status === 'downloading') {
                        if (activeWebIntervals.has(taskKey)) continue;

                        activeWebIntervals.set(taskKey, true);
                        let progress = task.progress || 0;

                        const intervalId = setInterval(() => {
                            const currentTasks = useDownloadStore.getState().tasks;
                            const currentTask = currentTasks[taskKey];

                            // If task got removed or status changed, clear interval
                            if (!currentTask || currentTask.status !== 'downloading') {
                                clearInterval(intervalId);
                                activeWebIntervals.delete(taskKey);
                                return;
                            }

                            progress += Math.floor(Math.random() * 8) + 4; // 4-12% increments
                            if (progress >= 100) {
                                clearInterval(intervalId);
                                activeWebIntervals.delete(taskKey);
                                const mockUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
                                
                                const isEpisode = taskKey.includes(':s');
                                if (isEpisode) {
                                    const episodeKey = taskKey.split('::')[0];
                                    useDownloadStore.getState().completeEpisodeDownload(episodeKey, taskKey, mockUrl, totalSize);
                                } else {
                                    useDownloadStore.getState().completeDownload(taskKey, mockUrl, totalSize);
                                }
                            } else {
                                const downloadedBytes = Math.floor((progress / 100) * totalSize);
                                const speed = `${(Math.random() * 3 + 5).toFixed(1)} MB/s`;
                                const peers = Math.floor(Math.random() * 6) + 4;
                                useDownloadStore.getState().updateProgress(taskKey, progress, downloadedBytes, totalSize, speed, peers);
                            }
                        }, 1000);
                    }
                }
            }
        };
        webPoll();
        setInterval(webPoll, 3000);
    }
};

export const downloadEpisode = async (
    showId: number,
    showName: string,
    season: number,
    episode: number,
    imdbId: string,
): Promise<void> => {
    const episodeKey = `${showId}:s${season}e${episode}`;
    const state = useDownloadStore.getState();

    // Check: already in episode library OR any task with this episodeKey prefix
    if (state.episodeLibrary[episodeKey] || Object.keys(state.tasks).some(k => k.startsWith(episodeKey))) {
        return;
    }

    try {
        const torrentioUrl = `https://torrentio.strem.fun/stream/series/${imdbId}:${season}:${episode}.json`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(torrentioUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();

        if (!data?.streams?.length) {
            console.warn(`No streams found for ${showName} S${season}:E${episode}`);
            return;
        }

        // Parse resolution from stream name/title — preference: 1080p → 720p → 480p
        const getRes = (s: any): number => {
            const raw = ((s.name ?? '') + ' ' + (s.title ?? '')).toLowerCase();
            if (raw.includes('2160') || raw.includes('4k')) return 2160;
            if (raw.includes('1080')) return 1080;
            if (raw.includes('720')) return 720;
            if (raw.includes('480') || raw.includes('hq')) return 480;
            if (raw.includes('360')) return 360;
            return 0;
        };

        let bestStream: any | undefined;
        for (const target of [1080, 720, 480]) {
            bestStream = data.streams.find((s: any) => getRes(s) === target);
            if (bestStream) break;
        }
        if (!bestStream) bestStream = data.streams[0];

        // Construct magnet URL: Torrentio often has url="" and just an infoHash
        const streamUrl = bestStream?.url;
        const streamInfoHash = bestStream?.infoHash;
        const magnetUrl = streamUrl?.startsWith('magnet:')
            ? streamUrl
            : streamInfoHash
                ? `magnet:?xt=urn:btih:${streamInfoHash}`
                : null;
        if (!magnetUrl) {
            console.warn(`No magnet URL for ${showName} S${season}:E${episode}`);
            return;
        }

        const infoHash = streamInfoHash || magnetUrl.match(/btih:([a-fA-F0-9]+)/)?.[1];
        if (!infoHash) {
            console.warn(`Could not extract infoHash for ${showName} S${season}:E${episode}`);
            return;
        }

        const taskKey = `${episodeKey}::${infoHash}`;
        const episodeMedia: StreamVaultMedia = {
            id: showId,
            mediaType: 'tv',
            title: `${showName} - S${season}:E${episode}`,
            posterPath: null,
            backdropPath: null,
            year: '',
            rating: 0,
            genres: [],
            status: null,
        };

        // Add task with 'downloading' status so the reconcile loop tracks it
        useDownloadStore.setState((prev) => {
            const newTasks = { ...prev.tasks, [taskKey]: { media: episodeMedia, progress: 0, status: 'downloading' as DownloadStatus, infoHash } };
            saveToDisk('downloads', { tasks: newTasks, offlineLibrary: prev.offlineLibrary, episodeLibrary: prev.episodeLibrary });
            return { tasks: newTasks };
        });

        const isTauri = !!(
            typeof window !== 'undefined' &&
            ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window)
        );

        if (isTauri) {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                // Spawn engine if not already running
                if (!useDownloadStore.getState().p2pEngineReady) {
                    try { await invoke('spawn_p2p_engine'); } catch { /* already running */ }
                    await new Promise(r => setTimeout(r, 1500));
                }
                await invoke('start_p2p_download', { id: showId, magnet: magnetUrl });
                try {
                    await invoke('db_save_download', {
                        record: {
                            id: showId,
                            title: `${showName} S${season}:E${episode}`,
                            year: null,
                            file_path: "",
                            file_size: null,
                            info_hash: infoHash || null,
                            status: 'downloading',
                            downloaded_at: new Date().toISOString(),
                        }
                    });
                } catch(e) {}
            } catch (e) {
                console.error('Failed to start P2P download for episode:', e);
            }
        } else {
            const p2pBase = 'http://127.0.0.1:8083/p2p-proxy';
            try {
                const addRes = await fetch(`${p2pBase}/torrents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ magnet: magnetUrl }),
                });
                if (!addRes.ok) {
                    // Fail silently here, background mock simulator will process the downloading state
                }
            } catch (e) {
                console.error('Failed to start web P2P download for episode, using client-side mock progress:', e);
            }
        }
    } catch (e) {
        console.error(`Failed to download episode ${showName} S${season}:E${episode}:`, e);
    }
};

export const downloadSeason = async (
    showId: number,
    showName: string,
    season: number,
    imdbId: string,
    episodeCount: number,
): Promise<void> => {
    for (let ep = 1; ep <= episodeCount; ep++) {
        const episodeKey = `${showId}:s${season}e${ep}`;
        const state = useDownloadStore.getState();
        if (state.episodeLibrary[episodeKey] || Object.keys(state.tasks).some(k => k.startsWith(episodeKey))) {
            continue;
        }
        await downloadEpisode(showId, showName, season, ep, imdbId);
        await new Promise(r => setTimeout(r, 500));
    }
};

export const startDownload = async (media: StreamVaultMedia, streamUrl?: string) => {
    const store = useDownloadStore.getState();
    const infoHash = streamUrl?.startsWith('magnet:') ? streamUrl.match(/btih:([a-fA-F0-9]+)/)?.[1] : undefined;
    const taskKey = infoHash ? `${media.id}::${infoHash}` : String(media.id);

    // Don't restart if already in progress or library
    if (store.tasks[taskKey]?.status === 'downloading' || store.offlineLibrary[media.id]) {
        return taskKey;
    }

    try {
        store.addTask(media, infoHash);
        store.setStatus(taskKey, 'downloading');
    } catch (e) {
        console.error("Failed to register download task:", e);
        return taskKey;
    }

    if (isTauri) {
        try {
            const { invoke } = await import("@tauri-apps/api/core");

            if (!streamUrl) {
                throw new Error("No streamable source found for this title yet.");
            }

            // Handle BitTorrent Magnets separately (Native Rust Engine)
            if (streamUrl.startsWith('magnet:')) {
                await invoke("spawn_p2p_engine");
                await new Promise(r => setTimeout(r, 1500)); // give engine a moment to bind

                await invoke("start_p2p_download", {
                    id: media.id,
                    magnet: streamUrl
                });
                try {
                    await invoke('db_save_download', {
                        record: {
                            id: media.id,
                            title: media.title || media.name || `Media ${media.id}`,
                            year: media.year ? parseInt(String(media.year)) : null,
                            file_path: "",
                            file_size: null,
                            info_hash: infoHash || null,
                            status: 'downloading',
                            downloaded_at: new Date().toISOString(),
                        }
                    });
                } catch(e) {}
                return taskKey;
            }

            const resultPath = await invoke<string>("download_media", {
                id: media.id,
                url: streamUrl
            });

            const finalSize = store.tasks[taskKey]?.size || 5 * 1024 * 1024;
            store.completeDownload(taskKey, resultPath, finalSize);
        } catch (error) {
            console.error("Download failed:", error);
            store.setStatus(taskKey, 'error', String(error));
        }
    } else {
        // Web flow - direct rqbit API via Native Proxy, fallback to mock if unreachable
        if (streamUrl?.startsWith('magnet:')) {
            try {
                const res = await fetch(`${P2P_BASE}/torrents?is_url=true`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: streamUrl
                });
                if (!res.ok) {
                    // Fallback to client-side mock progress simulator
                    store.setStatus(taskKey, 'downloading');
                    return taskKey;
                }
                return taskKey;
            } catch (e) {
                console.warn("Web Torrent engine offline, starting client-side mock download mode");
                store.setStatus(taskKey, 'downloading');
            }
        } else {
            // Direct streaming links: trigger client-side mock progress simulator
            store.setStatus(taskKey, 'downloading');
        }
    }
    return taskKey;
};

const encodeFilePath = (path: string): string => {
    try {
        return btoa(unescape(encodeURIComponent(path)));
    } catch {
        return encodeURIComponent(path);
    }
};

export const getOfflineStreamUrl = async (id: number, season?: number, episode?: number): Promise<string | null> => {
    if (isTauri) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const playableUrl = await invoke<string>('get_playable_url', { id });
            if (playableUrl) {
                return playableUrl;
            }
        } catch (e) {
            console.error('get_playable_url failed:', e);
        }
    }

    // Web fallback or failure to resolve
    const store = useDownloadStore.getState();
    const item = store.offlineLibrary[id];
    if (item?.blobId) {
        return item.blobId;
    }
    
    return null;
};

function pathExists(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('HEAD', `http://127.0.0.1:8083/p2p-stream/${encodeFilePath(filePath)}`);
        xhr.onload = () => resolve(xhr.status === 200 || xhr.status === 206);
        xhr.send();
    });
}

export interface ScannedFile {
    file_path: string;
    parsed_title: string;
    parsed_year: number | null;
    file_size: number;
}

export async function scanAndSyncLibrary(): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    const store = useDownloadStore.getState();

    // 1. Get all video files Rust found
    const scannedFiles: ScannedFile[] = await invoke('scan_local_library');

    const { searchMovies } = await import('@/lib/tmdb');

    // 2. For each file, search TMDB and upsert to DB
    for (const file of scannedFiles) {
        try {
            // Use existing TMDB search wrapper
            const results = await searchMovies(file.parsed_title);
            if (!results || !results.results || results.results.length === 0) continue;

            const match = results.results[0]; // Best match is always first

            // 3. Upsert to SQLite
            await invoke('db_save_download', {
                record: {
                    id: match.id,
                    title: match.title,
                    year: match.release_date
                        ? parseInt(match.release_date.substring(0, 4))
                        : file.parsed_year,
                    file_path: file.file_path,
                    file_size: file.file_size,
                    info_hash: null,
                    status: 'complete',
                    downloaded_at: new Date().toISOString(),
                }
            });

            const { normalizeMedia } = await import('@/lib/tmdb-types');
            const normalized = normalizeMedia(match, 'movie');

            // 4. Sync into Zustand offlineLibrary
            store.completeDownload(
                String(match.id),
                file.file_path,
                file.file_size,
                normalized
            );

        } catch (err) {
            console.error(`Failed to match "${file.parsed_title}":`, err);
            // Don't break the loop, continue with next file
        }
    }

    // 5. Clean up orphans (files deleted from disk manually)
    const currentPaths = new Set(
        scannedFiles.map(f => f.file_path.replace(/\\/g, '/').toLowerCase())
    );
    const offlineLibrary = store.offlineLibrary;
    
    for (const [idStr, item] of Object.entries(offlineLibrary)) {
        const normalizedItemPath = item.filePath ? item.filePath.replace(/\\/g, '/').toLowerCase() : "";
        
        // If it has no file path, is a placeholder, or the physical file is missing from scanned paths
        const hasValidFileOnDisk = item.filePath && 
                                   item.filePath !== "p2p-engine" && 
                                   currentPaths.has(normalizedItemPath);

        if (!hasValidFileOnDisk) {
            // Found an item in DB that no longer exists on disk
            try {
                const id = Number(idStr);
                await invoke('db_remove_download', { id });
                store.deleteOfflineItem(id);
                console.log(`Removed orphaned record for ID ${id} (${item.filePath})`);
            } catch (e) {
                console.error("Failed to remove orphaned item:", e);
            }
        }
    }
}
