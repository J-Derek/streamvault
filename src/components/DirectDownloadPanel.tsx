import { useState } from 'react';
import { Download, Loader2, AlertCircle, HardDrive, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { findAllLinks, type DirectLink } from '@/lib/downloads/scraper';
import { startDownload } from '@/lib/downloads/manager';
import { StreamVaultMedia } from '@/lib/tmdb-types';

interface Props {
    imdbId: string | null | undefined;
    media: StreamVaultMedia;
    season?: number;
    episode?: number;
    isAccordionMode?: boolean;
}

function qualityBadgeClass(q: string): string {
    if (q === '4K') return 'bg-[#BF5AF2]/20 text-[#BF5AF2] border border-[#BF5AF2]/40';
    if (q === '1080p') return 'bg-[#00B4D8]/20 text-[#00B4D8] border border-[#00B4D8]/40';
    if (q === '720p') return 'bg-[#34C759]/20 text-[#34C759] border border-[#34C759]/40';
    return 'bg-white/10 text-[#AEAEB2] border-white/10';
}

export function DirectDownloadPanel({ imdbId, media, season, episode, isAccordionMode = false }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);

    const isActuallyExpanded = isAccordionMode ? true : expanded;

    const { data: links = [], isLoading, isError, refetch } = useQuery({
        queryKey: ['directLinks', imdbId, media.mediaType, season, episode],
        queryFn: () => findAllLinks(media, imdbId!, season, episode),
        enabled: !!imdbId && isActuallyExpanded,
        staleTime: 1000 * 60 * 15,
    });

    const handleDirectDownload = async (link: DirectLink) => {
        setDownloading(link.url.slice(0, 40));
        try {
            await startDownload(media, link.url);
            setExpanded(false);
        } catch (e) {
            console.error("Direct download failed:", e);
        } finally {
            setDownloading(null);
        }
    };

    if (isAccordionMode) {
        return (
            <div className="space-y-1.5 pt-2">
                {!imdbId && (
                    <p className="text-[#636366] text-xs py-2">No IMDB ID available for this title.</p>
                )}

                {isError && (
                    <div className="flex items-center gap-2 py-2">
                        <AlertCircle className="w-3.5 h-3.5 text-[#FF9F0A]" />
                        <span className="text-[#636366] text-xs">Failed to find sources.</span>
                        <button onClick={() => refetch()} className="text-[#E50914] text-xs ml-auto hover:underline">Retry</button>
                    </div>
                )}

                {links.length > 0 ? (
                    <div className="space-y-1 max-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-[#3A3A3C]">
                        {links.map((link, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleDirectDownload(link)}
                                disabled={!!downloading}
                                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md
                                  bg-white/[0.03] border border-white/[0.06]
                                  hover:bg-white/[0.07] hover:border-white/[0.18]
                                  transition-all duration-150 text-left disabled:opacity-50"
                            >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${qualityBadgeClass(link.quality)}`}>
                                        {link.quality}
                                    </span>
                                    {link.isMagnet ? (
                                        <span className="text-[9px] font-bold text-[#FF9F0A] uppercase tracking-wider shrink-0">P2P</span>
                                    ) : (
                                        <span className="text-[9px] font-bold text-[#34C759] uppercase tracking-wider shrink-0">Direct</span>
                                    )}
                                    <span className="text-[10px] text-white/60 truncate">{link.source}</span>
                                    {link.size && (
                                        <span className="text-[9px] text-[#636366] shrink-0">{link.size}</span>
                                    )}
                                </div>
                                <div className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-[#E50914] hover:bg-[#E50914]/10">
                                    {downloading === link.url.slice(0, 40) ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Download className="w-3.5 h-3.5" />
                                    )}
                                </div>
                            </button>
                        ))}
                        <p className="text-[#636366] text-[9px] pt-1 opacity-60">
                            Sources found from {links.length > 1 ? `${links.length} providers` : `1 provider`}.
                            {links.some(l => l.isMagnet) && ' P2P sources require the rqbit engine.'}
                        </p>
                    </div>
                ) : !isLoading && imdbId ? (
                    <p className="text-[#636366] text-xs py-2">No direct download sources found.</p>
                ) : isLoading ? (
                    <div className="flex items-center gap-2 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E50914]" />
                        <span className="text-[#636366] text-xs">Finding Direct & P2P Sources...</span>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5 text-[#E50914]" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-white/70">
                        Direct Download Sources
                    </span>
                    {isLoading && (
                        <Loader2 className="w-3 h-3 animate-spin text-[#636366]" />
                    )}
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

                    {isError && (
                        <div className="flex items-center gap-2 py-2">
                            <AlertCircle className="w-3.5 h-3.5 text-[#FF9F0A]" />
                            <span className="text-[#636366] text-xs">Failed to find sources.</span>
                            <button onClick={() => refetch()} className="text-[#E50914] text-xs ml-auto hover:underline">Retry</button>
                        </div>
                    )}

                    {links.length > 0 ? (
                        <div className="space-y-1 max-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-[#3A3A3C]">
                            {links.map((link, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleDirectDownload(link)}
                                    disabled={!!downloading}
                                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md
                                      bg-white/[0.03] border border-white/[0.06]
                                      hover:bg-white/[0.07] hover:border-white/[0.18]
                                      transition-all duration-150 text-left disabled:opacity-50"
                                >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${qualityBadgeClass(link.quality)}`}>
                                            {link.quality}
                                        </span>
                                        {link.isMagnet ? (
                                            <span className="text-[9px] font-bold text-[#FF9F0A] uppercase tracking-wider shrink-0">P2P</span>
                                        ) : (
                                            <span className="text-[9px] font-bold text-[#34C759] uppercase tracking-wider shrink-0">Direct</span>
                                        )}
                                        <span className="text-[10px] text-white/60 truncate">{link.source}</span>
                                        {link.size && (
                                            <span className="text-[9px] text-[#636366] shrink-0">{link.size}</span>
                                        )}
                                    </div>
                                    <div className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-[#E50914] hover:bg-[#E50914]/10">
                                        {downloading === link.url.slice(0, 40) ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Download className="w-3.5 h-3.5" />
                                        )}
                                    </div>
                                </button>
                            ))}
                            <p className="text-[#636366] text-[9px] pt-1 opacity-60">
                                Sources found from {links.length > 1 ? `${links.length} providers` : `1 provider`}.
                                {links.some(l => l.isMagnet) && ' P2P sources require the rqbit engine.'}
                            </p>
                        </div>
                    ) : !isLoading && imdbId ? (
                        <p className="text-[#636366] text-xs py-2">No direct download sources found.</p>
                    ) : null}
                </div>
            )}
        </div>
    );
}
