import { Download, Check, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDownloadStore } from "@/store/downloads";
import { StreamVaultMedia } from "@/lib/tmdb-types";
import { Button } from "@/components/ui/button";
import { startDownload } from "@/lib/downloads/manager";
import AppDownloadDialog from "./AppDownloadDialog";


interface DownloadButtonProps {
    media: StreamVaultMedia;
    onDownloadRequested?: () => void; // Trigger for scraping
    streamUrl?: string; // Real stream source
    infoHash?: string; // For Torrent isolation
    isScraping?: boolean; // Fast scraping state
    className?: string;
    variant?: "default" | "outline" | "ghost";
    size?: "default" | "sm" | "icon";
}

const DownloadButton = ({ media, streamUrl, infoHash, isScraping, onDownloadRequested, className, variant = "outline", size = "default" }: DownloadButtonProps) => {
    const isTauri = typeof window !== 'undefined' && 'isTauri' in window;
    const { tasks, offlineLibrary, addTask, removeTask, deleteOfflineItem } = useDownloadStore();
    const navigate = useNavigate();

    const taskKey = infoHash ? `${media.id}::${infoHash}` : String(media.id);
    const task = isTauri ? tasks[taskKey] : null;
    const isDownloaded = !!offlineLibrary[media.id];

    if (isDownloaded) {
        return (
            <Button
                variant={variant}
                size={size}
                className={`gap-2 rounded-full border-[#34C759]/40 bg-[#34C759]/10 text-[#34C759] hover:bg-[#34C759]/20 font-bold ${className}`}
                onClick={() => {
                    if (confirm("Remove this title from your offline library?")) {
                        deleteOfflineItem(media.id);
                    }
                }}
                title="Remove from Offline Library"
            >
                {size === "icon" ? <Check className="w-5 h-5" /> : (
                    <>
                        <Check className="w-4 h-4" />
                        Downloaded
                    </>
                )}
            </Button>
        );
    }

    if (task) {
        if (task.status === 'downloading') {
            return (
                <div className={`relative flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300 ${className}`}>
                    <div className="relative w-14 h-14 flex items-center justify-center">
                        <svg className="w-14 h-14 -rotate-90 drop-shadow-xl overflow-visible">
                            <circle
                                cx="28" cy="28" r="24"
                                fill="rgba(0, 0, 0, 0.4)"
                                stroke="rgba(255, 255, 255, 0.1)"
                                strokeWidth="4"
                                className="backdrop-blur-md"
                            />
                            <circle
                                cx="28" cy="28" r="24"
                                fill="none"
                                stroke="#E50914"
                                strokeWidth="4"
                                strokeDasharray={151}
                                strokeDashoffset={151 - (151 * task.progress) / 100}
                                strokeLinecap="round"
                                className="transition-all duration-300"
                            />
                        </svg>
                        <button
                            onClick={() => removeTask(taskKey)}
                            className="absolute inset-0 flex items-center justify-center text-[#E50914] hover:text-white transition-colors"
                            aria-label="Cancel download"
                        >
                            <div className="w-3 h-3 bg-current rounded-[2px] shadow-sm transform hover:scale-110 transition-transform" />
                        </button>
                    </div>
                    {size !== "icon" && (
                        <div className="flex flex-col select-none">
                            <span className="text-[10px] font-black text-white/50 tracking-[0.2em] uppercase leading-none mb-1">Downloading</span>
                            <span className="text-sm font-black text-white leading-none">{Math.round(task.progress)}%</span>
                        </div>
                    )}
                </div>
            );
        }

        if (task.status === "error") {
            return (
                <Button
                    variant={variant}
                    size={size}
                    className={`gap-2 rounded-full border-[#FF9F0A]/40 bg-[#FF9F0A]/10 text-[#FF9F0A] ${className}`}
                    onClick={() => removeTask(taskKey)}
                    title={task.error || "Download Failed"}
                >
                    <Download className="w-4 h-4" />
                    {size !== "icon" && "Retry"}
                </Button>
            );
        }

        return (
            <Button
                variant={variant}
                size={size}
                className={`gap-2 rounded-full border-[#E50914]/40 bg-[#E50914]/10 text-[#E50914] ${className}`}
                disabled
            >
                <Clock className="w-4 h-4 animate-pulse" />
                {size !== "icon" && "Queued..."}
            </Button>
        );
    }

    const isLoadingLinks = isScraping;
    const isReady = !!streamUrl;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isReady) {
            startDownload(media, streamUrl);
            navigate("/downloads");
        } else if (onDownloadRequested) {
            onDownloadRequested();
        }
    };

    if (isReady && size === "icon") {
        return (
            <Button
                variant={variant}
                size={size}
                className={`text-[#34C759] hover:text-white hover:bg-[#34C759] ${className}`}
                onClick={handleClick}
                title="Download this quality to Vault"
            >
                <Download className="w-4 h-4" />
            </Button>
        )
    }

    const mainButton = (
        <Button
            variant={variant}
            size={size}
            className={`gap-2 rounded-full border-[#3A3A3C] bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] font-bold ${className}`}
            onClick={handleClick}
            disabled={!isReady && !onDownloadRequested}
            title={!isReady ? "No stream source available for download" : ""}
            aria-label="Download for offline"
        >
            {isLoadingLinks ? (
                <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    {size !== "icon" && "Finding Links..."}
                </>
            ) : size === "icon" ? (
                <Download className={`w-4 h-4 ${!isReady && !onDownloadRequested && isTauri ? "opacity-20" : ""}`} />
            ) : (
                <>
                    <Download className={`w-4 h-4 ${!isReady && !onDownloadRequested && isTauri ? "opacity-20" : ""}`} />
                    Download
                </>
            )}
        </Button>
    );

    if (!isTauri && !isReady) {
        return <AppDownloadDialog>{mainButton}</AppDownloadDialog>;
    }

    return mainButton;
};

export default DownloadButton;
