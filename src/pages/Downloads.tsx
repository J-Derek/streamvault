import { useState, useMemo, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { useDownloadStore, type DownloadTask } from "@/store/downloads";
import { getOfflineStreamUrl, scanAndSyncLibrary } from "@/lib/downloads/manager";
import MovieCard from "@/components/MovieCard";
import {
    Download, HardDrive, Trash2, ChevronLeft, ChevronDown, ChevronRight,
    PlaySquare, Users, Wifi, WifiOff, Activity, X, Tv, Film, Check, Clock,
    Power, Loader2, LayoutGrid, List, Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { DownloadDetailDialog } from "@/components/DownloadDetailDialog";
import { useToast } from "@/hooks/use-toast";
import { useSettingsStore } from "@/store/settings";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Platform detection — safe for both Tauri and web
const isTauri =
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || "isTauri" in window);

const openInExternalPlayer = async (id: number, downloadTask?: DownloadTask, toast?: any) => {
    if (!isTauri) return;
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        // Resolve the file path from the download task if possible
        let filePath: string | null = null;
        if (downloadTask?.filePath && downloadTask.filePath !== 'p2p-engine') {
            filePath = downloadTask.filePath;
        }
        
        const { preferredExternalPlayer, customPlayerPath } = useSettingsStore.getState();
        let pathArg: string | null = null;
        if (preferredExternalPlayer === 'vlc') {
            pathArg = 'vlc';
        } else if (preferredExternalPlayer === 'mpv') {
            pathArg = 'mpv';
        } else if (preferredExternalPlayer === 'custom') {
            pathArg = customPlayerPath || null;
        }

        await invoke("open_in_external_player", { id, filePath, playerPath: pathArg });
    } catch (e) {
        console.error("Failed to open external player:", e);
        if (toast) {
            toast({
                title: "Failed to open player",
                description: String(e),
                variant: "destructive",
            });
        }
    }
};

// ─── Engine Status Pill ────────────────────────────────────────────────────
const EngineStatusPill = ({
    ready,
    liveGlobalPeers,
}: {
    ready: boolean;
    liveGlobalPeers?: number;
}) => (
    <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${ready
            ? "bg-[#34C759]/10 border-[#34C759]/20 text-[#34C759]"
            : "bg-[#E50914]/10 border-[#E50914]/20 text-[#E50914]"
            }`}
    >
        {ready ? (
            <><Wifi className="w-3 h-3" /><span>Engine Online{liveGlobalPeers !== undefined ? ` · ${liveGlobalPeers} Peers` : ""}</span></>
        ) : (
            <><WifiOff className="w-3 h-3" /><span>Engine Offline</span></>
        )}
    </div>
);

// ─── Active Task Card ─────────────────────────────────────────────────────
const ActiveTaskCard = ({
    taskKey,
    onOpen,
    onCancel,
}: {
    taskKey: string;
    onOpen: () => void;
    onCancel: () => void;
}) => {
    const task = useDownloadStore((s) => s.tasks[taskKey]);
    if (!task?.media) return null;

    const isQueued = task.status === "queued";
    const isError = task.status === "error";
    const isStuck = !isQueued && task.progress === 0 && task.status === "downloading";
    const isTorrent = !!task.infoHash;
    const pct = Math.round(task.progress ?? 0);

    // Determine card status color and text
    const statusColor = isError
        ? "text-[#E50914]"
        : isQueued
            ? "text-[#AEAEB2]"
            : isStuck
                ? "text-[#FF9F0A]"
                : "text-[#00B4D8]";

    const progressBg = isError
        ? "bg-[#E50914]"
        : isQueued
            ? "bg-[#3A3A3C]"
            : isStuck
                ? "bg-[#FF9F0A]"
                : "bg-gradient-to-r from-[#00B4D8] to-[#BF5AF2]";

    const stuckText = isTorrent ? "Connecting to Peers..." : "Initializing...";
    const statusText = isError
        ? (task.error ?? "Download Failed")
        : isQueued
            ? "Waiting in Queue..."
            : isStuck
                ? stuckText
                : `${pct}% • ${task.speed ?? "Initializing"}`;

    return (
        <div className="group relative animate-in fade-in zoom-in-95 duration-300">
            <MovieCard
                media={task.media}
                onClick={onOpen}
                subtitle={statusText}
            />

            {/* Cancel button */}
            <button
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#E50914] z-10"
                aria-label="Cancel download"
            >
                <X className="w-3 h-3" />
            </button>

            <div className="mt-2 space-y-1.5 px-1">
                {isError ? (
                    <span className={`text-[10px] font-bold ${statusColor} uppercase leading-tight block truncate`}>
                        {task.error ?? "Download failed — try again"}
                    </span>
                ) : isQueued ? (
                    <>
                        <div className={`flex justify-between items-center text-[10px] font-black ${statusColor} uppercase tracking-wider`}>
                            <span className="truncate mr-2 flex items-center gap-1 text-[#AEAEB2]">
                                <Clock className="w-3 h-3 text-[#AEAEB2]" /> Waiting...
                            </span>
                            <span>0%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div
                                className={`h-full ${progressBg} transition-all duration-500`}
                                style={{ width: `0%` }}
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <div className={`flex justify-between text-[10px] font-black ${statusColor} uppercase tracking-wider`}>
                            <span className="truncate mr-2">{isStuck ? stuckText : (task.speed ?? "Starting...")}</span>
                            <span>{pct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div
                                className={`h-full ${progressBg} transition-all duration-500`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        {task.peers !== undefined && (
                            <div className={`flex items-center gap-1 text-[9px] font-bold ${isStuck ? 'text-[#FF9F0A]/70' : 'text-white/30'} uppercase`}>
                                <Users className="w-2.5 h-2.5" />
                                {task.peers} peers
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// ─── Offline Library Card ─────────────────────────────────────────────────
const OfflineCard = ({
    id,
    onDelete,
}: {
    id: number;
    onDelete: () => void;
}) => {
    const task = useDownloadStore((s) => s.offlineLibrary[id]);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    if (!task?.media) return null;

    const sizeMB = ((task.size ?? 0) / (1024 * 1024)).toFixed(0);

    return (
        <div className="group relative animate-in fade-in zoom-in-95 duration-300">
            <MovieCard
                media={task.media}
                onClick={() => {
                    navigate(`/watch/${task.media!.id}?offline=true`);
                }}
                subtitle={`${sizeMB} MB • ${task.media.year ?? ""}`}
            />

            {/* Delete button */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsDeleteDialogOpen(true);
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#E50914] z-10"
                        aria-label="Delete download"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete from Library?</AlertDialogTitle>
                        <AlertDialogDescription className="text-[#AEAEB2]">
                            Are you sure you want to permanently delete "{task.media.title}"? This action will remove the downloaded file from your device and cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="bg-transparent border-[#3A3A3C] text-white hover:bg-white/5 hover:text-white"
                            onClick={(e) => e.stopPropagation()}
                        >
                            Keep
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-[#E50914] hover:bg-[#B00610] text-white"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                                setIsDeleteDialogOpen(false);
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-[10px] font-bold text-[#34C759] uppercase flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
                    Ready
                </span>
                {isTauri && (
                    <button
                        onClick={(e) => { e.stopPropagation(); openInExternalPlayer(task.media.id, task, toast); }}
                        className="text-[10px] font-bold text-[#AEAEB2] hover:text-[#E50914] uppercase flex items-center gap-1 transition-colors"
                        title="Play in VLC"
                    >
                        <PlaySquare className="w-3 h-3" />
                        VLC
                    </button>
                )}
            </div>
        </div>
    );
};

// ─── Series Card (grouped view) ──────────────────────────────────────────
interface SeriesGroup {
    showId: number;
    title: string;
    episodes: { episodeKey: string; label: string; task: DownloadTask; sizeMB: string }[];
    activeTasks: { taskKey: string; label: string; task: DownloadTask }[];
}

const seasonDetailsCache: Record<string, Record<number, {
    name: string;
    still_path: string | null;
    overview: string;
}>> = {};

const useSeasonDetails = (showId: number, season: number) => {
    const [details, setDetails] = useState<
        Record<number, {
            name: string;
            still_path: string | null;
            overview: string;
        }>
    >({});

    useEffect(() => {
        const cacheKey = `${showId}:${season}`;
        if (seasonDetailsCache[cacheKey]) {
            setDetails(seasonDetailsCache[cacheKey]);
            return;
        }

        const token = import.meta.env.VITE_TMDB_READ_TOKEN;
        if (!token) return;
        fetch(
            `https://api.themoviedb.org/3/tv/${showId}/season/${season}`,
            { headers: { Authorization: `Bearer ${token}` } }
        )
        .then(r => r.json())
        .then(data => {
            const map: Record<number, any> = {};
            for (const ep of data.episodes || []) {
                map[ep.episode_number] = {
                    name: ep.name,
                    still_path: ep.still_path,
                    overview: ep.overview,
                };
            }
            seasonDetailsCache[cacheKey] = map;
            setDetails(map);
        })
        .catch(() => {});
    }, [showId, season]);

    return details;
};

const SeasonSection = ({
    showId,
    season,
    episodes,
    activeTasks,
    removeEpisodeDownload,
    removeTask,
    navigate
}: {
    showId: number;
    season: number;
    episodes: SeriesGroup['episodes'];
    activeTasks: SeriesGroup['activeTasks'];
    removeEpisodeDownload: (key: string) => void;
    removeTask: (key: string) => void;
    navigate: any;
}) => {
    const details = useSeasonDetails(showId, season);
    const tasks = useDownloadStore((s) => s.tasks);

    const seasonEpisodes = useMemo(() => {
        const list: Array<{
            episodeKey?: string;
            taskKey?: string;
            episodeNum: number;
            task: DownloadTask;
            isCompleted: boolean;
            sizeText: string;
            isQueuedSeasonPack?: boolean;
        }> = [];

        // Add completed
        for (const ep of episodes) {
            const match = ep.episodeKey.match(/s(\d+)e(\d+)/);
            const epNum = match ? parseInt(match[2]) : 1;
            list.push({
                episodeKey: ep.episodeKey,
                episodeNum: epNum,
                task: ep.task,
                isCompleted: true,
                sizeText: `${ep.sizeMB} MB`
            });
        }

        // Add active
        for (const at of activeTasks) {
            const match = at.taskKey.match(/:s(\d+)e(\d+)/i);
            const epNum = match ? parseInt(match[2]) : 1;
            
            // Check if this queued task shares an infoHash with a task that is currently downloading
            const isQueuedSeasonPack = at.task.status === 'queued' && 
                Object.values(tasks).some(t => t.infoHash === at.task.infoHash && t.status === 'downloading');

            list.push({
                taskKey: at.taskKey,
                episodeNum: epNum,
                task: at.task,
                isCompleted: false,
                sizeText: isQueuedSeasonPack 
                    ? 'Queued (Season Pack)' 
                    : at.task.status === 'queued' 
                        ? 'Queued' 
                        : 'Downloading',
                isQueuedSeasonPack
            });
        }

        // Sort by episode number
        return list.sort((a, b) => a.episodeNum - b.episodeNum);
    }, [episodes, activeTasks, tasks]);

    if (seasonEpisodes.length === 0) return null;

    return (
        <div className="px-4 py-3">
            <p className="text-[10px] font-bold text-[#636366] uppercase tracking-wider mb-3">
                Season {season}
            </p>
            <div className="flex flex-col gap-3">
                {seasonEpisodes.map((ep) => {
                    const epDetails = details[ep.episodeNum] || {
                        name: `Episode ${ep.episodeNum}`,
                        still_path: null,
                        overview: "No description available."
                    };

                    const stillUrl = epDetails.still_path
                        ? `https://image.tmdb.org/t/p/w300${epDetails.still_path}`
                        : null;

                    const pct = Math.round(ep.task.progress ?? 0);
                    const speed = ep.task.speed ?? "Initializing";

                    const handlePlay = () => {
                        navigate(`/watch/${showId}?type=tv&offline=true&s=${season}&e=${ep.episodeNum}`);
                    };

                    return (
                        <div
                            key={ep.episodeKey || ep.taskKey}
                            className="flex gap-4 p-3 rounded-lg bg-black/20 border border-[#3A3A3C]/40 hover:bg-white/[0.02] transition-colors relative"
                        >
                            {/* Still Image / Progress Bar */}
                            {!ep.isCompleted ? (
                                <div className="w-24 h-[54px] rounded-md overflow-hidden bg-black/40 border border-[#3A3A3C] flex flex-col justify-center px-2 shrink-0">
                                    {ep.task.status === 'queued' ? (
                                        <>
                                            <div className="flex justify-between text-[8px] font-black text-[#636366] uppercase mb-1">
                                                <span>0%</span>
                                                <span className="truncate max-w-[50px]">Queued</span>
                                            </div>
                                            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#3A3A3C]" style={{ width: '0%' }} />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex justify-between text-[8px] font-black text-[#FF9F0A] uppercase mb-1">
                                                <span>{pct}%</span>
                                                <span className="truncate max-w-[50px]">{speed}</span>
                                            </div>
                                            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#FF9F0A]" style={{ width: `${pct}%` }} />
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : stillUrl ? (
                                <img
                                    src={stillUrl}
                                    alt={epDetails.name}
                                    className="w-24 h-[54px] aspect-video object-cover rounded-md shrink-0 bg-black/40"
                                />
                            ) : (
                                <div className="w-24 h-[54px] aspect-video rounded-md bg-[#1C1C1E] border border-[#3A3A3C] flex items-center justify-center shrink-0">
                                    <Tv className="w-4 h-4 text-[#636366]" />
                                </div>
                            )}

                            {/* Details */}
                            <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                {/* Top Row: E{num} · {name} | Size */}
                                <div className="flex justify-between items-baseline gap-4">
                                    <h4 className="text-white text-sm font-semibold truncate">
                                        E{ep.episodeNum} · {epDetails.name}
                                    </h4>
                                    <span className="text-[#636366] text-[10px] font-bold shrink-0">
                                        {ep.sizeText}
                                    </span>
                                </div>

                                {/* Bottom Row: Overview | Actions */}
                                <div className="flex justify-between items-center gap-4 mt-1">
                                    <p className="text-[#AEAEB2] text-xs line-clamp-2 flex-1 leading-tight">
                                        {epDetails.overview || "No description available."}
                                    </p>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {ep.isCompleted ? (
                                            <>
                                                <button
                                                    onClick={handlePlay}
                                                    className="text-[#E50914] hover:text-white transition-colors p-1"
                                                    aria-label="Play episode"
                                                >
                                                    <Play className="w-3.5 h-3.5 fill-current" />
                                                </button>
                                                <button
                                                    onClick={() => removeEpisodeDownload(ep.episodeKey!)}
                                                    className="text-[#636366] hover:text-[#E50914] transition-colors p-1"
                                                    aria-label="Delete episode"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => removeTask(ep.taskKey!)}
                                                className="text-[#636366] hover:text-[#E50914] transition-colors p-1"
                                                aria-label="Cancel download"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const SeriesCard = ({ group }: { group: SeriesGroup }) => {
    const [expanded, setExpanded] = useState(group.activeTasks.length > 0);
    const navigate = useNavigate();
    const { removeEpisodeDownload, removeTask } = useDownloadStore();

    // Auto-expand when downloads begin
    useEffect(() => {
        if (group.activeTasks.length > 0) {
            setExpanded(true);
        }
    }, [group.activeTasks.length]);

    const completedCount = group.episodes.length;
    const totalSize = group.episodes.reduce((acc, e) => acc + (e.task.size ?? 0), 0);
    const totalSizeGB = (totalSize / (1024 ** 3)).toFixed(1);
    const totalSizeMB = (totalSize / (1024 ** 2)).toFixed(0);
    const sizeText = totalSize >= 1024 ** 3 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`;

    // Get poster path from any episode
    const posterPath = useMemo(() => {
        return group.episodes.find(e => e.task.media?.posterPath)?.task.media?.posterPath
            || group.activeTasks.find(t => t.task.media?.posterPath)?.task.media?.posterPath;
    }, [group.episodes, group.activeTasks]);

    // Find the chronologically first completed episode to play
    const firstEpisode = useMemo(() => {
        if (group.episodes.length === 0) return null;
        return [...group.episodes].sort((a, b) => {
            const matchA = a.episodeKey.match(/s(\d+)e(\d+)/);
            const matchB = b.episodeKey.match(/s(\d+)e(\d+)/);
            const sA = matchA ? parseInt(matchA[1]) : 1;
            const eA = matchA ? parseInt(matchA[2]) : 1;
            const sB = matchB ? parseInt(matchB[1]) : 1;
            const eB = matchB ? parseInt(matchB[2]) : 1;
            if (sA !== sB) return sA - sB;
            return eA - eB;
        })[0];
    }, [group.episodes]);

    // Get all unique seasons present (scanned or active)
    const seasonsList = useMemo(() => {
        const set = new Set<number>();
        for (const ep of group.episodes) {
            const match = ep.episodeKey.match(/s(\d+)/);
            if (match) set.add(parseInt(match[1]));
        }
        for (const at of group.activeTasks) {
            const match = at.taskKey.match(/:s(\d+)e(\d+)/i);
            if (match) set.add(parseInt(match[1]));
        }
        return Array.from(set).sort((a, b) => a - b);
    }, [group.episodes, group.activeTasks]);

    const seasonsText = seasonsList.length === 1 ? `Season ${seasonsList[0]}` : `${seasonsList.length} Seasons`;

    return (
        <div className="bg-[#1C1C1E] rounded-xl border border-[#3A3A3C] overflow-hidden transition-colors">
            {/* Header / Collapsed View */}
            <div
                onClick={() => setExpanded(!expanded)}
                className="w-full flex gap-4 p-4 hover:bg-white/[0.02] transition-colors cursor-pointer text-left items-center justify-between"
            >
                <div className="flex gap-4 items-center min-w-0 flex-1">
                    {/* Poster */}
                    {posterPath ? (
                        <img
                            src={`https://image.tmdb.org/t/p/w185${posterPath}`}
                            alt={group.title}
                            className="w-16 aspect-[2/3] object-cover rounded-lg shrink-0 border border-[#3A3A3C] bg-black/40"
                        />
                    ) : (
                        <div className="w-16 aspect-[2/3] rounded-lg bg-[#1D1D1F] border border-[#3A3A3C] flex items-center justify-center shrink-0">
                            <Tv className="w-6 h-6 text-[#636366]" />
                        </div>
                    )}

                    {/* Meta info */}
                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                        <h3 className="text-white text-base font-bold truncate leading-tight">
                            {group.title}
                        </h3>
                        <p className="text-[#AEAEB2] text-xs font-medium mt-1 leading-none">
                            {seasonsText} · {completedCount} episode{completedCount > 1 ? 's' : ''} · {sizeText}
                        </p>
                        
                        {/* Play First Button */}
                        {firstEpisode && (
                            <div className="flex">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const m = firstEpisode.episodeKey.match(/s(\d+)e(\d+)/);
                                        const s = m ? m[1] : '1';
                                        const ep = m ? m[2] : '1';
                                        navigate(`/watch/${group.showId}?type=tv&offline=true&s=${s}&e=${ep}`);
                                    }}
                                    className="mt-3 bg-[#E50914] hover:bg-[#B00610] text-white flex items-center gap-1.5 h-8 px-4 rounded-md text-xs font-semibold transition-colors"
                                >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    Play First
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Expand / Collapse Indicator & Actions */}
                <div className="flex items-center gap-3 shrink-0 px-2">
                    {group.activeTasks.length > 0 && (
                        <span className="text-[10px] font-bold text-[#FF9F0A] uppercase tracking-wider bg-[#FF9F0A]/10 border border-[#FF9F0A]/20 px-2 py-0.5 rounded-full">
                            {group.activeTasks.length} downloading
                        </span>
                    )}
                    {completedCount > 0 && (
                        <button
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm(`Are you sure you want to delete all ${completedCount} downloaded episodes of "${group.title}"?`)) {
                                    for (const ep of group.episodes) {
                                        await removeEpisodeDownload(ep.episodeKey);
                                    }
                                }
                            }}
                            className="text-[#636366] hover:text-[#E50914] transition-colors p-1"
                            title="Delete entire show"
                            aria-label="Delete entire show"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    {expanded ? <ChevronDown className="w-5 h-5 text-[#AEAEB2]" /> : <ChevronRight className="w-5 h-5 text-[#AEAEB2]" />}
                </div>
            </div>

            {/* Expanded List */}
            {expanded && (
                <div className="border-t border-[#3A3A3C] divide-y divide-[#3A3A3C]/50">
                    {seasonsList.map((seasonNum) => {
                        const seasonStr = String(seasonNum);
                        const eps = group.episodes.filter(ep => {
                            const match = ep.episodeKey.match(/s(\d+)/);
                            return match ? parseInt(match[1]) === seasonNum : false;
                        });
                        const activeForSeason = group.activeTasks.filter(at => {
                            const match = at.taskKey.match(/:s(\d+)e(\d+)/i);
                            const sNum = match ? parseInt(match[1]) : 1;
                            return sNum === seasonNum;
                        });

                        return (
                            <SeasonSection
                                key={seasonStr}
                                showId={group.showId}
                                season={seasonNum}
                                episodes={eps}
                                activeTasks={activeForSeason}
                                removeEpisodeDownload={removeEpisodeDownload}
                                removeTask={removeTask}
                                navigate={navigate}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── Page ────────────────────────────────────────────────────────────────
const DownloadsPage = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { offlineLibrary, episodeLibrary, tasks, deleteOfflineItem, removeEpisodeDownload, removeTask, clearTasks, p2pEngineReady, globalStats } =
        useDownloadStore();
    const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
    const [engineStarting, setEngineStarting] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [view, setView] = useState<'grid' | 'list'>('grid');
    const [activeTab, setActiveTab] = useState<'all' | 'movies' | 'tv'>('all');

    const handleScan = async () => {
        setScanning(true);
        try {
            await scanAndSyncLibrary();
            toast({ title: "Library scan complete", description: "Your offline library is up to date." });
        } catch (err) {
            toast({ title: "Scan failed", description: String(err), variant: "destructive" });
        } finally {
            setScanning(false);
        }
    };

    // Removed auto-start engine on mount to prevent unnecessary background processes.

    useEffect(() => {
        // Automatically scan and sync library on mount to clean up orphans instantly
        scanAndSyncLibrary().catch(e => console.error("On-mount library scan failed:", e));
    }, []);

    const handleStartEngine = async () => {
        if (!isTauri) return;
        setEngineStarting(true);
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("spawn_p2p_engine");
            useDownloadStore.getState().setP2pReady(true);
            toast({ title: "Engine started", description: "P2P engine is now online." });
        } catch (e) {
            console.error("Failed to start engine:", e);
            toast({
                title: "Engine failed to start",
                description: String(e),
                variant: "destructive",
            });
        } finally {
            setEngineStarting(false);
        }
    };

    const handleStopEngine = async () => {
        if (!isTauri) return;
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("kill_p2p_engine");
            useDownloadStore.getState().setP2pReady(false);
            useDownloadStore.getState().clearTasks();
            toast({ title: "Engine stopped", description: "P2P engine is now offline. All active torrents cleared." });
        } catch (e) {
            console.error("Failed to stop engine:", e);
            toast({
                title: "Failed to stop engine",
                description: String(e),
                variant: "destructive",
            });
        }
    };

    const offlineIds = useMemo(() => Object.keys(offlineLibrary).map(Number), [offlineLibrary]);
    const episodeKeys = useMemo(() => Object.keys(episodeLibrary), [episodeLibrary]);
    const taskKeys = useMemo(() => Object.keys(tasks), [tasks]);
    const activeEpTasks = useMemo(() => taskKeys.filter(k => k.includes(':s')), [taskKeys]);
    const regularTasks = useMemo(() => taskKeys.filter(k => !k.includes(':s')), [taskKeys]);

    const seriesGroups = useMemo(() => {
        const groups = new Map<number, SeriesGroup>();
        for (const epKey of episodeKeys) {
            const task = episodeLibrary[epKey];
            if (!task?.media) continue;
            const sid = task.media.id;
            const match = epKey.match(/^(\d+):s(\d+)e(\d+)/);
            const label = match ? `S${match[2]}:E${match[3]}` : epKey;
            const baseTitle = task.media.title.replace(/ - S\d+:E\d+$/, '');
            const sizeMB = ((task.size ?? 0) / (1024 * 1024)).toFixed(0);
            if (!groups.has(sid)) {
                groups.set(sid, { showId: sid, title: baseTitle, episodes: [], activeTasks: [] });
            }
            groups.get(sid)!.episodes.push({ episodeKey: epKey, label, task, sizeMB });
        }

        for (const tKey of activeEpTasks) {
            const task = tasks[tKey];
            if (!task?.media) continue;
            const sid = task.media.id;
            const baseTitle = task.media.title.replace(/ - S\d+:E\d+$/, '');
            const epLabel = task.media.title.match(/S\d+:E\d+/)?.[0] ?? tKey;
            if (!groups.has(sid)) {
                groups.set(sid, { showId: sid, title: baseTitle, episodes: [], activeTasks: [] });
            }
            const group = groups.get(sid)!;
            if (!group.activeTasks.find(a => a.taskKey === tKey)) {
                group.activeTasks.push({ taskKey: tKey, label: epLabel, task });
            }
        }
        return groups;
    }, [episodeKeys, episodeLibrary, activeEpTasks, tasks]);

    const isEmpty = offlineIds.length === 0 && regularTasks.length === 0 && episodeKeys.length === 0 && activeEpTasks.length === 0;

    const totalSizeBytes = [...offlineIds, ...episodeKeys].reduce((acc, id) => {
        const t = typeof id === 'number' ? offlineLibrary[id] : episodeLibrary[id as any];
        return acc + (t?.size ?? 0);
    }, 0);
    const totalSizeGB = (totalSizeBytes / (1024 ** 3)).toFixed(1);

    return (
        <div className="min-h-screen bg-[#0D0D0D] text-white">
            <Navbar />
            <div className="pt-24 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto">

                {/* ── Header ── */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-6 border-b border-white/5">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(-1)}
                            className="w-10 h-10 rounded-full bg-[#1C1C1E] border border-[#3A3A3C] text-[#AEAEB2] hover:text-white"
                            aria-label="Go back"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-[#E50914]/10 flex items-center justify-center border border-[#E50914]/20">
                                <Download className="w-6 h-6 text-[#E50914]" />
                            </div>
                            <div>
                                <div className="flex items-center gap-4">
                                    <h1 className="text-3xl font-black tracking-tight">Downloads</h1>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setView('grid')}
                                            className={`p-2 rounded-lg transition-colors ${
                                                view === 'grid'
                                                    ? 'bg-[#E50914]/10 text-[#E50914]'
                                                    : 'text-[#636366] hover:text-white'
                                            }`}
                                        >
                                            <LayoutGrid className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setView('list')}
                                            className={`p-2 rounded-lg transition-colors ${
                                                view === 'list'
                                                    ? 'bg-[#E50914]/10 text-[#E50914]'
                                                    : 'text-[#636366] hover:text-white'
                                            }`}
                                        >
                                            <List className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[#AEAEB2] text-sm font-medium">Your offline library</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        <EngineStatusPill ready={p2pEngineReady} liveGlobalPeers={globalStats?.live_peers} />

                        {!p2pEngineReady && isTauri && (
                            <Button
                                onClick={handleStartEngine}
                                disabled={engineStarting}
                                size="sm"
                                className="h-8 px-3 gap-1.5 bg-[#34C759]/10 hover:bg-[#34C759]/20 text-[#34C759] border border-[#34C759]/20 rounded-full text-[10px] font-black uppercase tracking-widest"
                            >
                                {engineStarting ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <Power className="w-3 h-3" />
                                )}
                                {engineStarting ? "Starting..." : "Start Engine"}
                            </Button>
                        )}

                        {p2pEngineReady && isTauri && (
                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={handleStopEngine}
                                    size="sm"
                                    className="h-8 px-3 gap-1.5 bg-[#E50914]/10 hover:bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/20 rounded-full text-[10px] font-black uppercase tracking-widest"
                                >
                                    <Power className="w-3 h-3" />
                                    Stop Engine
                                </Button>
                                <div className="flex items-center gap-2 bg-[#1C1C1E] border border-[#3A3A3C] px-4 py-2 rounded-xl">
                                    <Activity className="w-4 h-4 text-[#34C759]" />
                                    <span className="text-xs font-bold text-[#34C759] uppercase tracking-widest">
                                        {Math.floor((globalStats?.uptime_seconds ?? 0) / 60)}m uptime
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Empty State ── */}
                {isEmpty && (
                    <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in max-w-md mx-auto">
                        <div className="w-20 h-20 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-6 border border-[#3A3A3C]/40 shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                            <HardDrive className="w-10 h-10 text-[#636366]" />
                        </div>
                        <h2 className="text-xl font-bold mb-2 text-white">No Downloads Found</h2>
                        <p className="text-[#AEAEB2] text-sm max-w-sm mb-8 leading-relaxed">
                            Your offline library is currently empty. Explore trending movies and shows, and save them directly to your device to watch without internet.
                        </p>
                        <Button asChild className="bg-[#E50914] hover:bg-[#B00610] text-white px-8 h-11 rounded-md text-sm font-semibold transition-all shadow-[0_4px_14px_rgba(229,9,20,0.4)] hover:shadow-[0_6px_20px_rgba(229,9,20,0.6)]">
                            <Link to="/">Explore Trending Content</Link>
                        </Button>
                    </div>
                )}

                {/* ── Active Downloads Queue (movies only — episodes shown in series groups) ── */}
                {regularTasks.length > 0 && (
                    <section className="mb-12">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-sm font-black uppercase tracking-widest text-[#AEAEB2]">
                                Active Queue · {regularTasks.length}
                            </h2>
                            <button
                                onClick={clearTasks}
                                className="text-[11px] font-bold text-[#E50914]/60 hover:text-[#E50914] uppercase tracking-widest transition-colors"
                            >
                                Clear All
                            </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                            {regularTasks.map((key) => (
                                <ActiveTaskCard
                                    key={key}
                                    taskKey={key}
                                    onOpen={() => setSelectedTaskKey(key)}
                                    onCancel={() => removeTask(key)}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Offline Library ── */}
                {(offlineIds.length > 0 || seriesGroups.size > 0) && (
                    <section>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
                            <div className="flex items-center gap-6">
                                <h2 className="text-sm font-black uppercase tracking-widest text-[#AEAEB2]">
                                    Offline Library
                                </h2>
                                
                                {/* Tabs */}
                                <div className="flex items-center gap-1.5 bg-[#1C1C1E] p-1 rounded-xl border border-[#3A3A3C]">
                                    <button
                                        onClick={() => setActiveTab('all')}
                                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 ${
                                            activeTab === 'all'
                                                ? 'bg-[#E50914] text-white shadow-md shadow-[#E50914]/20'
                                                : 'text-[#AEAEB2] hover:text-white'
                                        }`}
                                    >
                                        All ({offlineIds.length + seriesGroups.size})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('movies')}
                                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${
                                            activeTab === 'movies'
                                                ? 'bg-[#E50914] text-white shadow-md shadow-[#E50914]/20'
                                                : 'text-[#AEAEB2] hover:text-white'
                                        }`}
                                    >
                                        <Film className="w-3 h-3" />
                                        Movies ({offlineIds.length})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('tv')}
                                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${
                                            activeTab === 'tv'
                                                ? 'bg-[#E50914] text-white shadow-md shadow-[#E50914]/20'
                                                : 'text-[#AEAEB2] hover:text-white'
                                        }`}
                                    >
                                        <Tv className="w-3 h-3" />
                                        TV Shows ({seriesGroups.size})
                                    </button>
                                </div>
                            </div>

                            <Button 
                                onClick={handleScan} 
                                disabled={scanning}
                                size="sm"
                                variant="outline"
                                className="h-8 text-[10px] uppercase font-bold tracking-widest bg-transparent border-[#3A3A3C] text-[#AEAEB2] hover:text-white hover:bg-white/5 self-end md:self-auto"
                            >
                                {scanning ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : null}
                                {scanning ? "Scanning..." : "Scan Library"}
                            </Button>
                        </div>

                        {/* Movies (individual cards) */}
                        {offlineIds.length > 0 && (activeTab === 'all' || activeTab === 'movies') && (
                            view === 'grid' ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 mb-8">
                                    {offlineIds.map((id) => (
                                        <OfflineCard
                                            key={id}
                                            id={id}
                                            onDelete={() => deleteOfflineItem(id)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 mb-8">
                                    {Object.values(offlineLibrary).map((task) => {
                                        if (!task?.media) return null;
                                        return (
                                            <div
                                                key={task.media.id}
                                                onClick={() => navigate(
                                                    `/watch/${task.media.id}?offline=true`
                                                )}
                                                className="flex items-center gap-4 p-3 
                                                rounded-xl bg-[#1C1C1E] border border-[#3A3A3C]
                                                hover:border-[#E50914]/50 cursor-pointer 
                                                transition-colors"
                                            >
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w92${task.media.posterPath}`}
                                                    className="w-[48px] aspect-[2/3] object-cover 
                                                    rounded-md shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white font-semibold truncate">
                                                        {task.media.title}
                                                    </p>
                                                    <p className="text-[#636366] text-xs mt-0.5">
                                                        {task.media.year} • {
                                                            ((task.size ?? 0) / (1024*1024*1024))
                                                            .toFixed(2)
                                                        } GB
                                                    </p>
                                                </div>
                                                <Play className="w-4 h-4 text-[#636366] shrink-0" />
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        )}

                        {/* Series (grouped by show) */}
                        {seriesGroups.size > 0 && (activeTab === 'all' || activeTab === 'tv') && (
                            <div className="space-y-3">
                                {Array.from(seriesGroups.values()).map(group => (
                                    <SeriesCard key={group.showId} group={group} />
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </div>

            <DownloadDetailDialog
                taskKey={selectedTaskKey}
                onClose={() => setSelectedTaskKey(null)}
            />
        </div>
    );
};

export default DownloadsPage;
