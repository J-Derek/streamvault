import { useDownloadStore, type DownloadStatus } from "@/store/downloads";
export { useDownloadStore };
import { saveToDisk } from "@/lib/persistence";
import type { StreamVaultMedia } from "@/lib/tmdb-types";
import { matchFileToEpisode } from "@/lib/downloads/utils";
import { useSettingsStore } from "@/store/settings";

const qualityBoost: Record<string, Record<string, number>> = {
    '720p':  { '720p': 3000, '480p': 2000, '1080p': 1000, '4K': 500 },
    '1080p': { '1080p': 3000, '720p': 2000, '4K': 1500, '480p': 500 },
    '4K':    { '4K': 3000, '1080p': 2000, '720p': 1000, '480p': 500 },
};

export const pickBestTorrentioStream = (streams: any[], defaultQuality: string): any => {
    if (!streams || streams.length === 0) return null;

    const ranked = streams.map((s) => {
        const rawName = ((s.name ?? '') + ' ' + (s.title ?? '')).toLowerCase();
        const is4K = rawName.includes('2160') || rawName.includes('4k');
        const is1080 = rawName.includes('1080');
        const is720 = rawName.includes('720');

        const titleLines = (s.title ?? '').split('\n');
        const statsLine = titleLines.find((l: string) => l.includes('👤') || l.includes('💾') || l.includes('⚙')) || (titleLines[1] ?? '');

        const seedsMatch = statsLine.match(/(?:👤)\s*(\d+)/u);
        const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : (s.seeders ?? 0);

        const providerMatch = statsLine.match(/(?:⚙️?)\s*([^\n👤💾⚙]+)/u);
        const provider = providerMatch ? providerMatch[1].trim().toLowerCase() : '';
        const isTrustedProvider = provider.includes('piratebay') || provider.includes('yts') || provider.includes('1337x') || provider.includes('torrentgalaxy');

        const boosts = qualityBoost[defaultQuality] ?? qualityBoost['720p'];
        const streamQuality = is4K ? '4K'
            : is1080 ? '1080p'
            : is720 ? '720p'
            : '480p';

        let customRank = s.rank || 0;
        customRank += boosts[streamQuality] ?? 0;
        if (isTrustedProvider) customRank += 5000;
        customRank += seeds;

        return { stream: s, customRank };
    });

    ranked.sort((a, b) => b.customRank - a.customRank);
    return ranked[0].stream;
};

// Helper for platform detection
const isTauri = !!(
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.TAURI_ENV_PLATFORM) ||
    (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window))
);

let proxyPort = 8083;
export let P2P_BASE = "http://127.0.0.1:8083/p2p-proxy";

export const getProxyPort = () => proxyPort;

const setSeasonPackPriorities = async (
    infoHash: string,
    selectedEpisodes: { season: number; episode: number }[]
): Promise<void> => {
    const P2P_BASE = 'http://127.0.0.1:3030';
    console.log(`[SeasonPack] Starting rapid priority configuration for ${infoHash}`);

    let files: any[] = [];
    // Poll immediately and rapidly every 400ms up to 30 times (12s total) to detect metadata resolution as early as possible
    for (let attempt = 1; attempt <= 30; attempt++) {
        try {
            const res = await fetch(`${P2P_BASE}/torrents/${infoHash}/files`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    files = data;
                    console.log(`[SeasonPack] Metadata resolved on attempt ${attempt} (${attempt * 400}ms)`);
                    break;
                }
            }
        } catch (e) {
            // Silence errors during rapid resolution polling
        }
        await new Promise(r => setTimeout(r, 400));
    }

    if (files.length === 0) {
        console.error(`[SeasonPack] Failed to fetch file list for infoHash ${infoHash} after rapid polling`);
        return;
    }

    // Enforce disable-all-then-enable-selected pattern
    const priorities: Record<number, { priority: string }> = {};
    for (let i = 0; i < files.length; i++) {
        priorities[i] = { priority: 'skip' };
    }

    // Now enable only the selected episodes
    for (const ep of selectedEpisodes) {
        const fileIndex = files.findIndex(f =>
            matchFileToEpisode(f.name || f.path || "", ep.season, ep.episode)
        );
        if (fileIndex !== -1) {
            priorities[fileIndex] = { priority: 'normal' };
            console.log(`[SeasonPack] Enabled file [${fileIndex}] for S${ep.season}E${ep.episode}`);
        } else {
            console.warn(`[SeasonPack] Could not match file for S${ep.season}E${ep.episode}`);
        }
    }

    try {
        const res = await fetch(`${P2P_BASE}/torrents/${infoHash}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(priorities)
        });
        if (res.ok) {
            console.log(`[SeasonPack] Successfully applied priorities to rqbit for ${infoHash}`);
        } else {
            console.error(`[SeasonPack] Failed to POST priorities to rqbit: status ${res.status}`);
        }
    } catch (e) {
        console.error(`[SeasonPack] Error configuring priorities:`, e);
    }
};


const triggerActualDownload = async (taskKey: string, task: any) => {
    const store = useDownloadStore.getState();
    const media = task.media;
    const infoHash = task.infoHash;
    const magnetUrl = task.magnetUrl;
    const streamUrl = task.streamUrl || magnetUrl;

    const isEpisode = taskKey.includes(':s');
    const showId = media.id;

    console.log(`[QueueManager] Promoting task ${taskKey} to downloading. Media:`, media.title);

    if (isTauri) {
        try {
            const { invoke } = await import("@tauri-apps/api/core");

            if (magnetUrl || (streamUrl && streamUrl.startsWith('magnet:'))) {
                const finalMagnet = magnetUrl || streamUrl!;
                
                // Spawn engine if not already running
                if (!store.p2pEngineReady) {
                    try { await invoke("spawn_p2p_engine"); } catch { /* already running */ }
                    await new Promise(r => setTimeout(r, 1500)); // give engine a moment to bind
                }

                let seasonNum: number | undefined;
                let episodeNum: number | undefined;
                if (isEpisode) {
                    const match = taskKey.match(/:s(\d+)e(\d+)/i);
                    if (match) {
                        seasonNum = parseInt(match[1], 10);
                        episodeNum = parseInt(match[2], 10);
                    }
                }

                await invoke("start_p2p_download", {
                    id: showId,
                    magnet: finalMagnet,
                    season: seasonNum,
                    episode: episodeNum
                });

                // Check if this is a season pack task
                const taskEpisodeMatch = taskKey.match(
                    /(\d+):s(\d+)e(\d+)::/
                );
                if (taskEpisodeMatch && infoHash) {
                    const seasonNum = parseInt(taskEpisodeMatch[2]);
                    const episodeNum = parseInt(taskEpisodeMatch[3]);

                    // This is a season pack — configure file priority for only the single active episode in the pack
                    console.log(
                        `[SeasonPack] Setting file priority for S${seasonNum}E${episodeNum} in infoHash ${infoHash}.`
                    );
                    setSeasonPackPriorities(infoHash, [{ season: seasonNum, episode: episodeNum }]).catch(
                        e => console.error('[SeasonPack] Priority set failed:', e)
                    );
                }

                try {
                    await invoke('db_save_download', {
                        record: {
                            id: showId,
                            title: media.title || media.name || `Media ${showId}`,
                            year: media.year ? parseInt(String(media.year)) : null,
                            file_path: "",
                            file_size: null,
                            info_hash: infoHash || null,
                            status: 'downloading',
                            downloaded_at: new Date().toISOString(),
                        }
                    });
                } catch(e) {}
            } else if (streamUrl) {
                // Direct download
                (async () => {
                    try {
                        const resultPath = await invoke<string>("download_media", {
                            id: showId,
                            url: streamUrl
                        });
                        const finalSize = useDownloadStore.getState().tasks[taskKey]?.size || 5 * 1024 * 1024;
                        useDownloadStore.getState().completeDownload(taskKey, resultPath, finalSize);
                    } catch (error) {
                        console.error("HTTP Download failed:", error);
                        useDownloadStore.getState().setStatus(taskKey, 'error', String(error));
                    }
                })();
            } else {
                throw new Error("No download URL or magnet link available for this task.");
            }
        } catch (error) {
            console.error("Native queue trigger failed:", error);
            store.setStatus(taskKey, 'error', String(error));
        }
    } else {
        // Web flow
        if (magnetUrl || (streamUrl && streamUrl.startsWith('magnet:'))) {
            const finalMagnet = magnetUrl || streamUrl!;
            const p2pBase = `http://127.0.0.1:${proxyPort}/p2p-proxy`;
            try {
                const res = await fetch(`${p2pBase}/torrents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ magnet: finalMagnet })
                });
                if (!res.ok) {
                    console.warn("Proxy torrent add failed, using client-side mock progress simulator");
                }
            } catch (e) {
                console.warn("Web Torrent engine offline, starting client-side mock download mode");
            }
        } else {
            console.log("[QueueManager] Starting client-side mock download mode for web HTTP stream");
        }
    }
};

const promoteQueueIfReady = async () => {
    const state = useDownloadStore.getState();
    const activeTasks = Object.values(state.tasks).filter(t => t.status === 'downloading');
    
    // We only allow 1 concurrent download
    if (activeTasks.length >= 1) {
        return;
    }

    const queuedTasks = Object.entries(state.tasks)
        .filter(([_, t]) => t.status === 'queued')
        .sort((a, b) => (a[1].createdAt ?? 0) - (b[1].createdAt ?? 0));

    if (queuedTasks.length > 0) {
        const [taskKey, oldestTask] = queuedTasks[0];
        
        // Bug 2: Engine health check before promoting task
        try {
            const res = await fetch("http://127.0.0.1:3030/torrents", { signal: AbortSignal.timeout(1000) });
            if (!res.ok) throw new Error("Engine not ready");
        } catch (e) {
            if (isTauri) {
                try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("spawn_p2p_engine");
                    // Wait for it to boot
                    await new Promise(r => setTimeout(r, 2000));
                } catch (err) {}
            }
        }

        // Promote to downloading status
        state.setStatus(taskKey, 'downloading');
        // Trigger actual download engine
        await triggerActualDownload(taskKey, oldestTask);
    }
};

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

            // Query dynamic proxy port from Rust backend
            try {
                proxyPort = await invoke<number>("get_proxy_port");
                P2P_BASE = `http://127.0.0.1:${proxyPort}/p2p-proxy`;
                console.log(`DownloadManager: Dynamic proxy port loaded: ${proxyPort}`);
            } catch (e) {
                console.error("DownloadManager: Failed to fetch proxy port, using default 8083:", e);
            }

            await listen("download-progress", (event: any) => {
                const { id, progress, downloaded_bytes, total_bytes, speed, peers } = event.payload;
                const state = useDownloadStore.getState();
                const taskKey = Object.keys(state.tasks).find(k => {
                    const t = state.tasks[k];
                    return (k.startsWith(`${id}::`) || k.startsWith(`${id}:s`)) && t.status === 'downloading';
                }) || String(id);
                
                // Only update progress if the task is actively downloading
                if (state.tasks[taskKey]?.status === 'downloading') {
                    state.updateProgress(taskKey, progress, downloaded_bytes, total_bytes, speed, peers);
                }
            });

            console.log("DownloadManager: Tauri listeners initialized");

            // Auto-scan library on app launch
            setTimeout(() => {
                scanAndSyncLibrary().catch(e => console.error("Auto-scan failed:", e));
            }, 3000); // Give it a 3s delay so it doesn't block initial rendering

            // ── Unified status + progress reconciler (runs in Tauri too) ────────
            const reconcileTorrentStates = async () => {
                try {
                    await promoteQueueIfReady();
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
                        if (task.status !== 'downloading') continue; // Only reconcile active downloading tasks!

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
                                        const isEpisode = taskKey.includes(':s');
                                        let seasonNum: number | undefined;
                                        let episodeNum: number | undefined;
                                        if (isEpisode) {
                                            const match = taskKey.match(/:s(\d+)e(\d+)/i);
                                            if (match) {
                                                seasonNum = parseInt(match[1], 10);
                                                episodeNum = parseInt(match[2], 10);
                                            }
                                        }

                                        const res: any = await invoke("sync_download_path", {
                                            id: task.media.id,
                                            infoHash: taskHash,
                                            season: seasonNum,
                                            episode: episodeNum
                                        });
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

                                    // Scan for all video files this torrent produced
                                    try {
                                        const { invoke } = await import('@tauri-apps/api/core');
                                        const scanned: any[] = await invoke('scan_local_library');

                                        const allTasks = useDownloadStore.getState().tasks;

                                        // Find sibling episode tasks sharing this infoHash
                                        const siblings = Object.entries(allTasks).filter(
                                            ([k, t]) =>
                                                t.infoHash === taskHash &&
                                                k !== taskKey &&
                                                k.includes(':s')
                                        );

                                        for (const [sibKey, sibTask] of siblings) {
                                            const sibMatch = sibKey.match(/:s(\d+)e(\d+)/);
                                            if (!sibMatch) continue;

                                            const sibSeason = parseInt(sibMatch[1]);
                                            const sibEpisode = parseInt(sibMatch[2]);

                                            // Find the matching file from the scan
                                            const matched = scanned.find(f =>
                                                matchFileToEpisode(f.file_path, sibSeason, sibEpisode)
                                            );

                                            if (matched) {
                                                const episodeKey = sibKey.split('::')[0];
                                                liveState.completeEpisodeDownload(
                                                    episodeKey,
                                                    sibKey,
                                                    matched.file_path,
                                                    matched.file_size
                                                );
                                                console.log(
                                                    `[SeasonPack] Auto-completed sibling episode ` +
                                                    `${sibKey} → ${matched.file_path}`
                                                );
                                            }
                                        }
                                    } catch (e) {
                                        console.error('[SeasonPack] Post-completion scan failed:', e);
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
                            // Bug 3: If it's stuck in downloading state with 0 progress for > 30s, reset it to queued
                            const progress = task.progress ?? 0;
                            const createdAt = task.createdAt ?? Date.now();
                            if (progress === 0 && (Date.now() - createdAt > 30000)) {
                                console.log(`Task ${taskKey} stuck in downloading without engine presence for >30s. Resetting to queued.`);
                                state.setStatus(taskKey, 'queued');
                            }
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
            await promoteQueueIfReady();
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

                        // Find any tasks in our store that match this engine hash and are actively downloading
                        const taskEntries = Object.entries(state.tasks).filter(
                            ([_, task]) => task.infoHash?.toLowerCase() === engineHash && task.status === 'downloading'
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
    posterPath?: string | null,
    backdropPath?: string | null,
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

        // Select stream using user quality preference
        const { defaultQuality } = useSettingsStore.getState();
        let bestStream = pickBestTorrentioStream(data.streams, defaultQuality);
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
            posterPath: posterPath || null,
            backdropPath: backdropPath || null,
            year: '',
            rating: 0,
            genres: [],
            status: null,
        };

        state.addTask(episodeMedia, infoHash, magnetUrl || undefined, streamUrl || undefined, taskKey);
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
    posterPath?: string | null,
    backdropPath?: string | null,
): Promise<void> => {
    for (let ep = 1; ep <= episodeCount; ep++) {
        const episodeKey = `${showId}:s${season}e${ep}`;
        const state = useDownloadStore.getState();
        if (state.episodeLibrary[episodeKey] || Object.keys(state.tasks).some(k => k.startsWith(episodeKey))) {
            continue;
        }
        await downloadEpisode(showId, showName, season, ep, imdbId, posterPath, backdropPath);
        await new Promise(r => setTimeout(r, 500));
    }
};

export const startDownload = async (media: StreamVaultMedia, streamUrl?: string) => {
    const store = useDownloadStore.getState();
    const infoHash = streamUrl?.startsWith('magnet:') ? streamUrl.match(/btih:([a-fA-F0-9]+)/)?.[1] : undefined;
    const taskKey = infoHash ? `${media.id}::${infoHash}` : String(media.id);

    // Don't restart if already in progress or library
    if (store.tasks[taskKey] || store.offlineLibrary[media.id]) {
        return taskKey;
    }

    try {
        const isMagnet = streamUrl?.startsWith('magnet:');
        const magnetUrl = isMagnet ? streamUrl : undefined;
        const directUrl = !isMagnet ? streamUrl : undefined;
        
        store.addTask(media, infoHash, magnetUrl, directUrl, taskKey);
    } catch (e) {
        console.error("Failed to register download task:", e);
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
    const store = useDownloadStore.getState();
    let filePath: string | undefined;

    if (season !== undefined && episode !== undefined) {
        const episodeKey = `${id}:s${season}e${episode}`;
        filePath = store.episodeLibrary[episodeKey]?.filePath;
    } else {
        filePath = store.offlineLibrary[id]?.filePath;
    }

    console.log("[getOfflineStreamUrl] Searching for id:", id, "season:", season, "episode:", episode);
    console.log("[getOfflineStreamUrl] episodeLibrary contains:", Object.keys(store.episodeLibrary));
    console.log("[getOfflineStreamUrl] Selected filePath:", filePath);

    if (isTauri && filePath) {
        return `http://127.0.0.1:${proxyPort}/p2p-stream/?path=${encodeFilePath(filePath)}`;
    }

    // Web fallback
    if (season === undefined || episode === undefined) {
        const item = store.offlineLibrary[id];
        if (item?.blobId) {
            return item.blobId;
        }
    }
    
    return null;
};

function pathExists(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('HEAD', `http://127.0.0.1:${proxyPort}/p2p-stream/${encodeFilePath(filePath)}`);
        xhr.onload = () => resolve(xhr.status === 200 || xhr.status === 206);
        xhr.send();
    });
}

export interface ScannedFile {
    file_path: string;
    parsed_title: string;
    parsed_year: number | null;
    file_size: number;
    media_type: 'movie' | 'tv';
    season: number | null;
    episode: number | null;
}

export async function scanAndSyncLibrary(): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    const store = useDownloadStore.getState();

    // 1. Get all video files Rust found
    const scannedFiles: ScannedFile[] = await invoke('scan_local_library');

    const { searchMovies, searchTVShows } = await import('@/lib/tmdb');

    // 2. For each file, search TMDB and upsert to DB
    for (const file of scannedFiles) {
        try {
            if (file.media_type === 'tv') {
                const results = await searchTVShows(file.parsed_title);
                if (!results || !results.results || results.results.length === 0) continue;

                const match = results.results[0]; // Best match is always first
                const showId = match.id;
                const season = file.season ?? 1;
                const episode = file.episode ?? 1;

                const paddedSeason = String(season).padStart(2, '0');
                const paddedEpisode = String(episode).padStart(2, '0');
                const formattedTitle = `${match.name} - S${paddedSeason}:E${paddedEpisode}`;

                // 3. Upsert to SQLite
                await invoke('db_save_download', {
                    record: {
                        id: showId,
                        title: formattedTitle,
                        year: match.first_air_date
                            ? parseInt(match.first_air_date.substring(0, 4))
                            : file.parsed_year,
                        file_path: file.file_path,
                        file_size: file.file_size,
                        info_hash: null,
                        status: 'complete',
                        downloaded_at: new Date().toISOString(),
                    }
                });

                // Add to episodeLibrary in Zustand
                const episodeMedia = {
                    id: showId,
                    mediaType: 'tv',
                    title: `${match.name} - S${season}:E${episode}`,
                    posterPath: match.poster_path,
                    backdropPath: match.backdrop_path,
                    year: match.first_air_date ? match.first_air_date.substring(0, 4) : String(file.parsed_year || ""),
                    rating: match.vote_average ?? 0,
                    genres: [],
                    status: null,
                };

                const episodeKey = `${showId}:s${season}e${episode}`;
                const taskKey = `${episodeKey}::scanned`;

                if (!store.tasks[taskKey]) {
                    store.addTask(episodeMedia as any, undefined, undefined, undefined, taskKey);
                }

                store.completeEpisodeDownload(
                    episodeKey,
                    taskKey,
                    file.file_path,
                    file.file_size
                );
            } else {
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
            }

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

    // 6. Clean up TV episode orphans (files deleted from disk manually)
    const episodeLibrary = store.episodeLibrary;
    let episodeLibraryChanged = false;
    const newEpisodeLibrary = { ...episodeLibrary };

    for (const [episodeKey, item] of Object.entries(episodeLibrary)) {
        const normalizedItemPath = item.filePath ? item.filePath.replace(/\\/g, '/').toLowerCase() : "";
        
        const hasValidFileOnDisk = item.filePath && 
                                   item.filePath !== "p2p-engine" && 
                                   currentPaths.has(normalizedItemPath);

        if (!hasValidFileOnDisk) {
            delete newEpisodeLibrary[episodeKey];
            episodeLibraryChanged = true;
            console.log(`Removed orphaned episode record for ${episodeKey} (${item.filePath})`);
        }
    }

    if (episodeLibraryChanged) {
        useDownloadStore.setState({ episodeLibrary: newEpisodeLibrary });
        // Save the updated library to disk
        const latestState = useDownloadStore.getState();
        saveToDisk('downloads', {
            tasks: latestState.tasks,
            offlineLibrary: latestState.offlineLibrary,
            episodeLibrary: newEpisodeLibrary
        });
    }
}
