/**
 * YTSDownloadPanel — shows quality options from YTS and triggers a download.
 *
 * The user picks a quality. We build a magnet URI from the torrent hash and
 * hand it to the download manager. No .torrent file is ever created or shown.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchYTSMovie, buildMagnet, qualityLabel, type YTSTorrent } from '@/lib/yts';
import { startDownload } from '@/lib/downloads/manager';
import { StreamVaultMedia } from '@/lib/tmdb-types';

interface Props {
    imdbId: string | null | undefined;
    media: StreamVaultMedia;
}

// Quality badge colours
function qualityBadgeClass(q: string): string {
    if (q.includes('2160')) return 'bg-[#BF5AF2]/20 text-[#BF5AF2] border border-[#BF5AF2]/40';
    if (q.includes('1080')) return 'bg-[#00B4D8]/20 text-[#00B4D8] border border-[#00B4D8]/40';
    return 'bg-[#34C759]/20 text-[#34C759] border border-[#34C759]/40';
}

export function YTSDownloadPanel({ imdbId, media }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['yts', imdbId],
        queryFn: () => fetchYTSMovie(imdbId!),
        enabled: !!imdbId && expanded,
        staleTime: 1000 * 60 * 30, // 30 min cache
        retry: 1,
    });

    const torrents: YTSTorrent[] = data?.movie?.torrents ?? [];

    const handleDownload = async (torrent: YTSTorrent) => {
        const magnet = buildMagnet(torrent.hash, media.title);
        setDownloading(torrent.quality);
        try {
            await startDownload(media, magnet);
        } finally {
            setDownloading(null);
        }
    };

    return (
        <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            {/* Header — toggle */}
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-[#E50914]" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-white/70">
                        Download · YTS Quality Options
                    </span>
                </div>
                {expanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-[#636366]" />
                ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-[#636366]" />
                )}
            </button>

            {expanded && (
                <div className="px-3 pb-3 space-y-1.5 border-t border-white/[0.05] pt-2">
                    {!imdbId && (
                        <p className="text-[#636366] text-xs py-2">No IMDB ID available for this title.</p>
                    )}

                    {isLoading && (
                        <div className="flex items-center gap-2 py-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#636366]" />
                            <span className="text-[#636366] text-xs">Checking YTS catalogue…</span>
                        </div>
                    )}

                    {isError || data?.error ? (
                        <div className="flex items-center gap-2 py-2">
                            <AlertCircle className="w-3.5 h-3.5 text-[#FF9F0A]" />
                            <span className="text-[#636366] text-xs">
                                {data?.error ?? 'Not available on YTS'}
                            </span>
                        </div>
                    ) : null}

                    {torrents.length > 0 && (
                        <>
                            <p className="text-[#636366] text-[10px] font-semibold uppercase tracking-widest pt-1 pb-0.5">
                                Select quality to download
                            </p>
                            {torrents.map(t => (
                                <button
                                    key={t.hash}
                                    onClick={() => handleDownload(t)}
                                    disabled={!!downloading}
                                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md
                             bg-white/[0.03] border border-white/[0.06]
                             hover:bg-white/[0.07] hover:border-white/[0.18]
                             transition-all duration-150 group text-left disabled:opacity-50"
                                >
                                    {/* Quality pill */}
                                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${qualityBadgeClass(t.quality)}`}>
                                        {t.quality.replace('.x265', '')}
                                    </span>

                                    {/* Details */}
                                    <span className="flex-1 text-[11px] text-white/80 font-medium">
                                        {qualityLabel(t)}
                                    </span>

                                    {/* Seeds */}
                                    <span className="shrink-0 text-[10px] text-[#34C759] font-bold">
                                        {t.seeds}↑
                                    </span>

                                    {/* Download icon / spinner */}
                                    <div className="shrink-0 w-6 h-6 rounded flex items-center justify-center
                                  text-[#E50914] hover:bg-[#E50914]/10 transition-colors">
                                        {downloading === t.quality ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Download className="w-3.5 h-3.5" />
                                        )}
                                    </div>
                                </button>
                            ))}
                            <p className="text-[#636366] text-[9px] pt-1 opacity-60">
                                Downloads are sourced from YTS and processed inside the app — no torrent files.
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
