import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDownloadStore } from "@/store/downloads";
import { Button } from "@/components/ui/button";
import {
    Zap, Users, HardDrive, AlertCircle, XCircle,
    RefreshCw, Activity, CheckCircle2
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface DownloadDetailDialogProps {
    taskKey: string | null;
    onClose: () => void;
}

export const DownloadDetailDialog: React.FC<DownloadDetailDialogProps> = ({ taskKey, onClose }) => {
    const { tasks, removeTask, globalStats } = useDownloadStore();
    const task = taskKey ? tasks[taskKey] : null;

    if (!task) return null;

    const isStuck = task.progress === 0 && task.status === "downloading";
    const isError = task.status === "error";
    const isCompleted = task.status === "completed";
    const pct = Math.round(task.progress ?? 0);

    // Friendly status label
    let statusLabel = "Active Download";
    let statusDetail = `Streaming at ${task.speed ?? "---"}`;
    if (isError) { statusLabel = "Download Failed"; statusDetail = task.error ?? "Unknown error. Try starting again."; }
    else if (isStuck) { statusLabel = "Waiting for Peers"; statusDetail = "Searching for healthy seeders via trackers..."; }
    else if (isCompleted) { statusLabel = "Download Complete"; statusDetail = "File is ready for offline playback."; }

    const statusColor = isError
        ? "bg-[#E50914]/10 border-[#E50914]/20 text-[#E50914]"
        : isStuck
            ? "bg-[#FF9F0A]/10 border-[#FF9F0A]/20 text-[#FF9F0A]"
            : isCompleted
                ? "bg-[#34C759]/10 border-[#34C759]/20 text-[#34C759]"
                : "bg-[#00B4D8]/10 border-[#00B4D8]/20 text-[#00B4D8]";

    const StatusIcon = isError
        ? XCircle
        : isStuck
            ? AlertCircle
            : isCompleted
                ? CheckCircle2
                : Zap;

    const handleRetry = async () => {
        if (!task.media) return;
        // Remove current stuck/errored task so a fresh one can be created
        removeTask(taskKey!);
        // Re-kick the download via the manager if we have a magnet (infoHash present)
        // User will need to re-select from the title detail for a new magnet
        onClose();
    };

    const handleCancel = () => {
        removeTask(taskKey!);
        onClose();
    };

    return (
        <Dialog open={!!taskKey} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md bg-[#1C1C1E]/95 border-[#3A3A3C] backdrop-blur-2xl text-white overflow-hidden">
                <DialogHeader className="pb-4 border-b border-white/5">
                    <DialogTitle className="flex items-center gap-3 text-xl font-black">
                        <div className="w-10 h-10 rounded-lg bg-[#E50914]/10 flex items-center justify-center border border-[#E50914]/20 shrink-0">
                            <StatusIcon className="w-5 h-5 text-[#E50914]" />
                        </div>
                        <span className="truncate">{task.media?.title ?? "Unknown Title"}</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    {/* Status Banner */}
                    <div className={`p-4 rounded-xl border flex items-start gap-3 ${statusColor}`}>
                        <StatusIcon className="w-5 h-5 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-widest leading-none mb-1">
                                {statusLabel}
                            </p>
                            <p className="text-sm font-medium text-white/80 break-words">
                                {statusDetail}
                            </p>
                        </div>
                    </div>

                    {/* Progress */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Progress</span>
                            <span className="text-2xl font-black text-white">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-2 bg-white/5" />
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                        <MetricCard
                            icon={<Users className="w-4 h-4 text-[#00B4D8]" />}
                            label="Peers"
                            value={task.peers !== undefined ? `${task.peers} Connected` : "Searching..."}
                        />
                        <MetricCard
                            icon={<HardDrive className="w-4 h-4 text-[#BF5AF2]" />}
                            label="File Size"
                            value={task.size ? `${(task.size / (1024 ** 3)).toFixed(2)} GB` : "Calculating..."}
                        />
                    </div>

                    {/* Metadata row */}
                    <div className="flex items-center justify-between text-[10px] font-bold text-white/20 uppercase px-1">
                        <span>Protocol: BitTorrent (rqbit)</span>
                        {task.infoHash && <span>Hash: {task.infoHash.slice(0, 8)}…</span>}
                    </div>

                    {/* Engine Health */}
                    {globalStats && (
                        <div className="pt-4 border-t border-white/5 space-y-3">
                            <div className="flex items-center gap-2">
                                <Activity className="w-3 h-3 text-[#34C759]" />
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Engine Health</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="space-y-0.5">
                                    <p className="text-[9px] font-bold text-white/20 uppercase">Global Peers</p>
                                    <p className="font-black text-[#34C759]">{globalStats.live_peers} Active</p>
                                </div>
                                <div className="space-y-0.5 text-right">
                                    <p className="text-[9px] font-bold text-white/20 uppercase">Session Uptime</p>
                                    <p className="font-black text-white/60">
                                        {Math.floor(globalStats.uptime_seconds / 60)}m {globalStats.uptime_seconds % 60}s
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2 border-t border-white/5">
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        className="flex-1 border-white/10 text-white hover:bg-white/5 hover:text-[#E50914]"
                    >
                        Cancel Download
                    </Button>

                    {(isStuck || isError) ? (
                        <Button
                            className="flex-1 bg-[#E50914] hover:bg-[#B00610] text-white gap-2 font-bold"
                            onClick={handleRetry}
                        >
                            <RefreshCw className="w-4 h-4" />
                            Clear &amp; Retry
                        </Button>
                    ) : (
                        <Button
                            className="flex-1 bg-white/10 hover:bg-white/20 text-white gap-2 font-bold border border-white/10"
                            onClick={onClose}
                        >
                            Minimize
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const MetricCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <div className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-1">
        <div className="flex items-center gap-2 opacity-50">
            {icon}
            <span className="text-[10px] font-black uppercase tracking-tighter">{label}</span>
        </div>
        <p className="text-sm font-black text-white">{value}</p>
    </div>
);
