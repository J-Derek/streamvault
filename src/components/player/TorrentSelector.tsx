import React, { useState, useEffect } from 'react';
import { TorrentioStream, fetchTorrentioStreams, normalizeTorrentioStream } from '@/lib/providers/torrentio';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Zap, Wifi, Signal, PlayCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/settings';

interface TorrentSelectorProps {
    imdbId: string;
    mediaType: 'movie' | 'tv';
    season?: number;
    episode?: number;
    onSelect: (stream: { infoHash: string; fileIdx?: number }) => void;
}

export const TorrentSelector: React.FC<TorrentSelectorProps> = ({
    imdbId,
    mediaType,
    season,
    episode,
    onSelect
}) => {
    const { defaultQuality } = useSettingsStore();
    const [streams, setStreams] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadStreams = async () => {
            setLoading(true);
            setError(null);

            const result = await fetchTorrentioStreams(imdbId, mediaType, season, episode);

            if (result.error) {
                setError(result.error);
            } else {
                const qualityScore = (stream: any): number => {
                    const raw = (
                        (stream.name ?? '') + ' ' + (stream.title ?? '')
                    ).toLowerCase();
                    const is4K   = raw.includes('2160') || raw.includes('4k');
                    const is1080 = raw.includes('1080');
                    const is720  = raw.includes('720');

                    const streamQuality = is4K ? '4K' 
                        : is1080 ? '1080p' 
                        : is720 ? '720p' 
                        : '480p';

                    const boostMap: Record<string, Record<string, number>> = {
                        '720p':  { '720p': 3000, '480p': 2000, '1080p': 1000, '4K': 500 },
                        '1080p': { '1080p': 3000, '720p': 2000, '4K': 1500, '480p': 500 },
                        '4K':    { '4K': 3000, '1080p': 2000, '720p': 1000, '480p': 500 },
                    };

                    return boostMap[defaultQuality]?.[streamQuality] ?? 0;
                };

                const normalized = (result.streams || [])
                    .map(normalizeTorrentioStream)
                    .sort((a, b) =>
                        (b.rank + qualityScore(b)) - (a.rank + qualityScore(a))
                        || (b.seeds - a.seeds)
                    );
                setStreams(normalized);
            }
            setLoading(false);
        };

        if (imdbId) loadStreams();
    }, [imdbId, mediaType, season, episode]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 p-12">
                <Loader2 className="w-10 h-10 text-[#00B4D8] animate-spin" />
                <p className="text-white/60 text-sm font-medium animate-pulse">Initializing P2P Discovery...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 p-12 text-center max-w-sm mx-auto">
                <AlertCircle className="w-10 h-10 text-[#E50914]/50" />
                <p className="text-white font-bold text-lg">Discovery Failed</p>
                <p className="text-white/40 text-sm">{error}</p>
                <Button variant="outline" onClick={() => window.location.reload()} className="mt-4">Retry Search</Button>
            </div>
        );
    }

    if (streams.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
                <Wifi className="w-10 h-10 text-white/20" />
                <p className="text-white/60 text-sm font-bold">No High-Quality Streams Found</p>
                <p className="text-white/30 text-xs">Try switching back to Server 1 or 2.</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-2xl mx-auto h-full flex flex-col p-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h3 className="text-2xl font-black text-white flex items-center gap-2">
                        <Zap className="w-6 h-6 text-[#00B4D8] fill-[#00B4D8]/20" />
                        Select Quality
                    </h3>
                    <p className="text-[#AEAEB2] text-xs font-medium uppercase tracking-wider mt-1">Found {streams.length} optimized P2P nodes</p>
                </div>
            </div>

            <ScrollArea className="flex-1 -mx-2 px-2">
                <div className="grid gap-3">
                    {streams.map((s, idx) => (
                        <button
                            key={`${s.infoHash}-${idx}`}
                            onClick={() => onSelect({ infoHash: s.infoHash, fileIdx: s.fileIdx })}
                            className={cn(
                                "group relative overflow-hidden flex items-center gap-4 p-4 rounded-2xl transition-all duration-300",
                                "bg-[#1C1C1E]/50 border border-white/5 hover:bg-[#2C2C2E]/80 hover:border-[#00B4D8]/50 hover:scale-[1.02] active:scale-[0.98]",
                                "backdrop-blur-xl text-left"
                            )}
                        >
                            {/* Quality Badge Area */}
                            <div className="w-16 h-12 rounded-xl bg-white/5 flex flex-col items-center justify-center border border-white/5 group-hover:bg-[#00B4D8]/20 transition-colors">
                                <span className={cn(
                                    "text-xs font-black",
                                    s.quality.toLowerCase().includes('4k') ? "text-[#BF5AF2]" : "text-white"
                                )}>
                                    {s.quality}
                                </span>
                                <span className="text-[10px] text-white/40 font-bold uppercase">{s.size}</span>
                            </div>

                            {/* Info Area */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <p className="text-white text-sm font-bold truncate group-hover:text-[#00B4D8] transition-colors">{s.fileName}</p>
                                    {(s.rank >= 800) && (
                                        <span className="shrink-0 px-1.5 py-0.5 rounded-sm bg-[#34C759]/10 text-[#34C759] text-[8px] font-black uppercase tracking-tighter border border-[#34C759]/20">
                                            Trusted
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-white/60 font-bold uppercase tracking-tight">{s.provider}</span>
                                        <span className="text-white/20 text-[10px]">•</span>
                                        <div className="flex items-center gap-1">
                                            <Signal className={cn(
                                                "w-3 h-3",
                                                s.seeds > 50 ? "text-[#34C759]" : s.seeds > 10 ? "text-[#F5C518]" : "text-[#AEAEB2]"
                                            )} />
                                            <span className="text-[10px] text-white/50 font-medium">{s.seeds} Peers</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Play Action */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-[#00B4D8] rounded-full p-2 text-black shadow-[0_0_20px_rgba(0,180,216,0.3)]">
                                <PlayCircle className="w-6 h-6 fill-black" />
                            </div>
                        </button>
                    ))}
                </div>
                <div className="h-6" />
            </ScrollArea>
        </div>
    );
};
