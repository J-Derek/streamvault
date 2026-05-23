import { useState, useRef, useEffect } from "react";
import { Download, Magnet, HardDrive, Settings, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettingsStore } from "@/store/settings";
import { startDownload } from "@/lib/downloads/manager";
import { useDownloadStore } from "@/store/downloads";
import { findDirectOnlyLink, findBestDownloadLink } from "@/lib/downloads/scraper";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";

interface Props {
    media: any;
    torrentData: any;
    imdbId: string | undefined | null;
    details: any;
    mediaType: "movie" | "tv";
    isTauri: boolean;
}

export function UnifiedDownload({ media, torrentData, imdbId, details, mediaType, isTauri }: Props) {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const { defaultQuality, preferredSource } = useSettingsStore();
    const [duplicateDialog, setDuplicateDialog] = useState<{ type: 'torrent' | 'direct'; url: string } | null>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const findBestTorrent = () => {
        const streams = torrentData?.streams || [];
        if (!streams.length) return null;
        const norm: any[] = streams.map((s: any) => {
            const raw = ((s.name ?? '') + ' ' + (s.title ?? '')).toLowerCase();
            return { ...s, res: raw.includes('2160') ? '4K' : raw.includes('1080') ? '1080p' : raw.includes('720') ? '720p' : 'HD' };
        });
        const qualityOrder = defaultQuality === '4K' ? ['4K', '1080p', '720p', 'HD'] : defaultQuality === '1080p' ? ['1080p', '720p', 'HD', '4K'] : ['720p', 'HD', '1080p', '4K'];
        for (const q of qualityOrder) {
            const match = norm.find(s => s.res === q && (s.url || s.infoHash));
            if (match) return match;
        }
        return norm[0] || null;
    };

    const checkDuplicate = (url?: string): 'exists' | 'completed' | null => {
        const store = useDownloadStore.getState();
        const infoHash = url?.match(/btih:([a-fA-F0-9]+)/)?.[1];
        const taskKey = infoHash ? `${media.id}::${infoHash}` : String(media.id);
        if (store.tasks[taskKey] && (store.tasks[taskKey].status === 'downloading' || store.tasks[taskKey].status === 'queued')) {
            return 'exists';
        }
        if (store.offlineLibrary[media.id]) {
            return 'completed';
        }
        return null;
    };

    const startTorrentDownload = () => {
        setLoading("torrent");
        const stream = findBestTorrent();
        if (!stream) {
            toast({ title: "No torrent found", description: "No compatible torrent stream available.", variant: "destructive" });
            setLoading(null);
            return;
        }
        const url = stream.url || (stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(media.title || 'video')}` : null);
        if (!url) {
            toast({ title: "No URL", description: "Could not build download URL from stream.", variant: "destructive" });
            setLoading(null);
            return;
        }
        const dup = checkDuplicate(url);
        if (dup) {
            setDuplicateDialog({ type: 'torrent', url });
            setLoading(null);
            return;
        }
        doDownload(url);
    };

    const doDownload = (url: string) => {
        setOpen(false);
        setLoading(null);
        navigate("/downloads");
        startDownload(media, url).catch(e => console.error("Background download failed:", e));
    };

    const doRestartDownload = async (url: string) => {
        setDuplicateDialog(null);
        const store = useDownloadStore.getState();
        const infoHash = url.match(/btih:([a-fA-F0-9]+)/)?.[1];
        const taskKey = infoHash ? `${media.id}::${infoHash}` : String(media.id);
        if (store.tasks[taskKey]) await store.removeTask(taskKey);
        if (store.offlineLibrary[media.id]) await store.deleteOfflineItem(media.id);
        doDownload(url);
    };

    const startDirectDownload = async () => {
        setLoading("direct");
        try {
            const timeout = new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error("Scraper timed out")), 12000)
            );
            const linkUrl = await Promise.race([
                findDirectOnlyLink(media, imdbId || ''),
                timeout,
            ]);
            if (linkUrl) {
                const dup = checkDuplicate(linkUrl);
                if (dup) {
                    setDuplicateDialog({ type: 'direct', url: linkUrl });
                    setLoading(null);
                    return;
                }
                doDownload(linkUrl);
                setLoading(null);
                setOpen(false);
                return;
            }
            // Direct download has no sources — auto-fallback to torrent
            console.log("No direct HTTP sources, falling back to torrent download");
            const stream = findBestTorrent();
            if (stream) {
                const url = stream.url || (stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(media.title || 'video')}` : null);
                if (url) {
                    toast({
                        title: "Falling back to torrent",
                        description: "No direct HTTP source found. Starting torrent download instead.",
                    });
                    doDownload(url);
                    setLoading(null);
                    setOpen(false);
                    return;
                }
            }
            toast({
                title: "No sources available",
                description: "No direct HTTP or torrent sources found for this title.",
                variant: "destructive",
            });
        } catch (e) {
            console.error("Direct download failed:", e);
            toast({ title: "Direct download failed", description: "An error occurred while searching for sources.", variant: "destructive" });
        }
        setLoading(null);
        setOpen(false);
    };

    const handleClick = () => {
        if (preferredSource === 'torrent') {
            startTorrentDownload();
        } else if (preferredSource === 'direct') {
            startDirectDownload();
        } else {
            setOpen(true);
        }
    };

    return (
        <div ref={ref} className="relative">
            <AlertDialog open={!!duplicateDialog} onOpenChange={(v) => { if (!v) setDuplicateDialog(null); }}>
                <AlertDialogContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-[#FF9F0A]" />
                            Already in Library
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[#AEAEB2]">
                            This title is already in your download library or currently downloading.
                            What would you like to do?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction
                            className="bg-[#E50914] hover:bg-[#B00610] text-white"
                            onClick={() => {
                                if (duplicateDialog) doRestartDownload(duplicateDialog.url);
                            }}
                        >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Restart Download
                        </AlertDialogAction>
                        <AlertDialogCancel
                            className="bg-transparent border-[#3A3A3C] text-white hover:bg-white/5"
                            onClick={() => setDuplicateDialog(null)}
                        >
                            Keep Existing
                        </AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Button
                onClick={handleClick}
                disabled={!!loading}
                className="h-11 px-5 gap-2 bg-[#E50914] hover:bg-[#B00610] text-white font-bold rounded-full"
            >
                {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Download className="w-4 h-4" />
                )}
                {loading === "torrent" ? "Finding torrent..." : loading === "direct" ? "Finding direct link..." : "Download"}
            </Button>

            {open && (
                <div className="absolute top-full mt-2 left-0 w-72 bg-[#1C1C1E] border border-[#3A3A3C] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-3 py-2 border-b border-[#3A3A3C]">
                        <p className="text-[10px] font-black text-[#AEAEB2] uppercase tracking-widest">Choose download method</p>
                    </div>

                    <button
                        onClick={startTorrentDownload}
                        disabled={loading === "torrent"}
                        className="w-full flex items-center gap-3 px-3 py-3 hover:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
                    >
                        <div className="w-8 h-8 rounded-lg bg-[#BF5AF2]/10 flex items-center justify-center shrink-0">
                            <Magnet className="w-4 h-4 text-[#BF5AF2]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold">Torrent</p>
                            <p className="text-[#AEAEB2] text-[11px] truncate">
                                {torrentData?.streams?.length ? `Best ${defaultQuality} from P2P` : "No torrents available"}
                            </p>
                        </div>
                        {loading === "torrent" && <Loader2 className="w-4 h-4 animate-spin text-[#AEAEB2]" />}
                    </button>

                    <button
                        onClick={startDirectDownload}
                        disabled={loading === "direct"}
                        className="w-full flex items-center gap-3 px-3 py-3 hover:bg-white/[0.04] transition-colors text-left disabled:opacity-50 border-t border-[#3A3A3C]/50"
                    >
                        <div className="w-8 h-8 rounded-lg bg-[#00B4D8]/10 flex items-center justify-center shrink-0">
                            <HardDrive className="w-4 h-4 text-[#00B4D8]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold">Direct Download</p>
                            <p className="text-[#AEAEB2] text-[11px] truncate">
                                Best {defaultQuality} from scraped sources
                            </p>
                        </div>
                        {loading === "direct" && <Loader2 className="w-4 h-4 animate-spin text-[#AEAEB2]" />}
                    </button>

                    <div className="border-t border-[#3A3A3C] px-3 py-2">
                        <button
                            onClick={() => { setOpen(false); navigate("/settings"); }}
                            className="flex items-center gap-2 text-[10px] font-bold text-[#636366] hover:text-white uppercase tracking-widest transition-colors"
                        >
                            <Settings className="w-3 h-3" />
                            Download Settings
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
