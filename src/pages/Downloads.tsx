import { useState, useMemo, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { useDownloadStore, type DownloadTask } from "@/store/downloads";
import { getOfflineStreamUrl } from "@/lib/downloads/manager";
import MovieCard from "@/components/MovieCard";
import {
    Download, HardDrive, Trash2, ChevronLeft, ChevronDown, ChevronRight,
    PlaySquare, Users, Wifi, WifiOff, Activity, X, Tv, Film, Check, Clock,
    Power, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { DownloadDetailDialog } from "@/components/DownloadDetailDialog";
import { useToast } from "@/hooks/use-toast";

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
        await invoke("open_in_external_player", { id, filePath });
    } catch (e) {
        console.error("Failed to open external player:", e);
        if (toast) {
            toast({
                title: "File not found",
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

    const isError = task.status === "error";
    const isStuck = task.progress === 0 && task.status === "downloading";
    const isTorrent = !!task.infoHash;
    const pct = Math.round(task.progress ?? 0);

    // Determine card status color and text
    const statusColor = isError
        ? "text-[#E50914]"
        : isStuck
            ? "text-[#FF9F0A]"
            : "text-[#00B4D8]";

    const progressBg = isError
        ? "bg-[#E50914]"
        : isStuck
            ? "bg-[#FF9F0A]"
            : "bg-gradient-to-r from-[#00B4D8] to-[#BF5AF2]";

    const stuckText = isTorrent ? "Connecting to Peers..." : "Initializing...";
    const statusText = isError
        ? (task.error ?? "Download Failed")
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
                        <AlertDialogAction
                            className="bg-[#E50914] hover:bg-[#B00610] text-white"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                                setIsDeleteDialogOpen(false);
                            }}
                        >
                            Cancel Delete
                        </AlertDialogAction>
                        <AlertDialogCancel
                            className="bg-transparent border-[#3A3A3C] text-white hover:bg-white/5 hover:text-white"
                            onClick={(e) => e.stopPropagation()}
                        >
                            Keep
                        </AlertDialogCancel>
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

const SeriesCard = ({ group }: { group: SeriesGroup }) => {
    const [expanded, setExpanded] = useState(false);
    const navigate = useNavigate();
    const { removeEpisodeDownload, removeTask } = useDownloadStore();

    const completedCount = group.episodes.length;
    const totalSize = group.episodes.reduce((acc, e) => acc + (e.task.size ?? 0), 0);
    const totalSizeGB = (totalSize / (1024 ** 3)).toFixed(1);

    // Group episodes by season
    const seasonMap = useMemo(() => {
        const map = new Map<string, typeof group.episodes>();
        for (const ep of group.episodes) {
            const season = ep.episodeKey.match(/s(\d+)/)?.[1] ?? '1';
            const existing = map.get(season) || [];
            existing.push(ep);
            map.set(season, existing);
        }
        return map;
    }, [group.episodes]);

    return (
        <div className="bg-[#1C1C1E] rounded-xl border border-[#3A3A3C] overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors text-left"
            >
                <div className="w-14 h-14 rounded-xl bg-[#E50914]/10 flex items-center justify-center shrink-0 border border-[#E50914]/20">
                    <Tv className="w-6 h-6 text-[#E50914]" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold truncate">{group.title}</h3>
                    <p className="text-[#AEAEB2] text-xs mt-0.5">
                        {completedCount} episode{completedCount > 1 ? 's' : ''} · {totalSizeGB} GB
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {group.activeTasks.length > 0 && (
                        <span className="text-[10px] font-bold text-[#FF9F0A] uppercase">{group.activeTasks.length} active</span>
                    )}
                    {expanded ? <ChevronDown className="w-4 h-4 text-[#636366]" /> : <ChevronRight className="w-4 h-4 text-[#636366]" />}
                </div>
            </button>

            {expanded && (
                <div className="border-t border-[#3A3A3C] divide-y divide-[#3A3A3C]/50">
                    {/* Active tasks for this series */}
                    {group.activeTasks.length > 0 && (
                        <div className="px-4 py-2 bg-[#FF9F0A]/5">
                            <p className="text-[10px] font-bold text-[#FF9F0A] uppercase tracking-wider mb-2">Downloading</p>
                            {group.activeTasks.map((at) => {
                                const pct = Math.round(at.task.progress ?? 0);
                                return (
                                    <div key={at.taskKey} className="flex items-center gap-3 py-1.5">
                                        <Clock className="w-3.5 h-3.5 text-[#FF9F0A] shrink-0" />
                                        <span className="text-white text-xs flex-1 truncate">{at.label}</span>
                                        <span className="text-[#FF9F0A] text-xs font-bold">{pct}%</span>
                                        <button
                                            onClick={() => removeTask(at.taskKey)}
                                            className="text-[#636366] hover:text-[#E50914] transition-colors"
                                            aria-label={`Remove download ${at.label}`}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Completed episodes grouped by season */}
                    {Array.from(seasonMap.entries()).sort().map(([season, eps]) => (
                        <div key={season} className="px-4 py-2">
                            <p className="text-[10px] font-bold text-[#636366] uppercase tracking-wider mb-1">Season {season}</p>
                            {eps.map((ep) => (
                                <div key={ep.episodeKey} className="flex items-center gap-3 py-1.5 group/ep">
                                    <div
                                        onClick={() => navigate(`/watch/${group.showId}?type=tv&offline=true&s=${ep.episodeKey.match(/s(\d+)/)?.[1] ?? '1'}&e=${ep.episodeKey.match(/e(\d+)/)?.[1] ?? '1'}`)}
                                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/watch/${group.showId}?type=tv&offline=true&s=${ep.episodeKey.match(/s(\d+)/)?.[1] ?? '1'}&e=${ep.episodeKey.match(/e(\d+)/)?.[1] ?? '1'}`); }}
                                    >
                                        <Check className="w-3.5 h-3.5 text-[#34C759] shrink-0" />
                                        <span className="text-white text-xs truncate">{ep.label}</span>
                                    </div>
                                    <span className="text-[#636366] text-[10px] shrink-0">{ep.sizeMB} MB</span>
                                    <button
                                        onClick={() => removeEpisodeDownload(ep.episodeKey)}
                                        className="text-[#636366] hover:text-[#E50914] transition-colors opacity-0 group-hover/ep:opacity-100 shrink-0"
                                        aria-label={`Delete ${ep.label}`}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))}
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

    // Auto-start engine on mount if it's not running
    useEffect(() => {
        if (!p2pEngineReady && !engineStarting && isTauri) {
            handleStartEngine();
        }
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

    const offlineIds = Object.keys(offlineLibrary).map(Number);
    const episodeKeys = Object.keys(episodeLibrary);
    const taskKeys = Object.keys(tasks);
    const regularTasks = taskKeys.filter(k => !k.includes(':s')); // non-episode tasks for active queue
    const isEmpty = offlineIds.length === 0 && regularTasks.length === 0 && episodeKeys.length === 0;

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
                                <h1 className="text-3xl font-black tracking-tight">Downloads</h1>
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
                            <div className="flex items-center gap-2 bg-[#1C1C1E] border border-[#3A3A3C] px-4 py-2 rounded-xl">
                                <Activity className="w-4 h-4 text-[#34C759]" />
                                <span className="text-xs font-bold text-[#34C759] uppercase tracking-widest">
                                    {Math.floor((globalStats?.uptime_seconds ?? 0) / 60)}m uptime
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Empty State ── */}
                {isEmpty && (
                    <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in">
                        <div className="w-20 h-20 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-6">
                            <Download className="w-10 h-10 text-[#636366]" />
                        </div>
                        <h2 className="text-xl font-bold mb-2">No downloads yet</h2>
                        <p className="text-[#AEAEB2] max-w-sm mb-8">
                            Download movies and shows to watch them offline.
                        </p>
                        <Button asChild className="bg-[#E50914] hover:bg-[#B00610] text-white px-8">
                            <Link to="/browse">Start Browsing</Link>
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
                {(offlineIds.length > 0 || episodeKeys.length > 0) && (
                    <section>
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#AEAEB2] mb-5">
                            Offline Library · {offlineIds.length + episodeKeys.length}
                        </h2>

                        {/* Movies (individual cards) */}
                        {offlineIds.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 mb-8">
                                {offlineIds.map((id) => (
                                    <OfflineCard
                                        key={id}
                                        id={id}
                                        onDelete={() => deleteOfflineItem(id)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Series (grouped by show) */}
                        {episodeKeys.length > 0 && (() => {
                            // Group completed episodes by showId
                            const seriesGroups = new Map<number, SeriesGroup>();
                            for (const epKey of episodeKeys) {
                                const task = episodeLibrary[epKey];
                                if (!task?.media) continue;
                                const sid = task.media.id;
                                const match = epKey.match(/^(\d+):s(\d+)e(\d+)$/);
                                const label = match ? `S${match[2]}:E${match[3]}` : epKey;
                                const baseTitle = task.media.title.replace(/ - S\d+:E\d+$/, '');
                                const sizeMB = ((task.size ?? 0) / (1024 * 1024)).toFixed(0);
                                if (!seriesGroups.has(sid)) {
                                    seriesGroups.set(sid, { showId: sid, title: baseTitle, episodes: [], activeTasks: [] });
                                }
                                seriesGroups.get(sid)!.episodes.push({ episodeKey: epKey, label, task, sizeMB });
                            }

                            // Also find active episode tasks (keys containing ":s")
                            const activeEpTasks = taskKeys.filter(k => k.includes(':s'));
                            for (const tKey of activeEpTasks) {
                                const task = tasks[tKey];
                                if (!task?.media) continue;
                                const sid = task.media.id;
                                const baseTitle = task.media.title.replace(/ - S\d+:E\d+$/, '');
                                const epLabel = task.media.title.match(/S\d+:E\d+/)?.[0] ?? tKey;
                                if (!seriesGroups.has(sid)) {
                                    seriesGroups.set(sid, { showId: sid, title: baseTitle, episodes: [], activeTasks: [] });
                                }
                                const group = seriesGroups.get(sid)!;
                                if (!group.activeTasks.find(a => a.taskKey === tKey)) {
                                    group.activeTasks.push({ taskKey: tKey, label: epLabel, task });
                                }
                            }

                            return (
                                <div className="space-y-3">
                                    {Array.from(seriesGroups.values()).map(group => (
                                        <SeriesCard key={group.showId} group={group} />
                                    ))}
                                </div>
                            );
                        })()}
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
