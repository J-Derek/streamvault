import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Server, ChevronRight, Play } from "lucide-react";
import { normalizeTorrentioStream } from "@/lib/providers/torrentio";
import { normalizeMedia, PROVIDERS } from "@/lib/tmdb-types";
import { StreamRow } from "./StreamRow";
import { useSettingsStore } from '@/store/settings';

interface TorrentioStreamsProps {
    torrentData: any;
    isLoadingTorrents: boolean;
    numId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    selectedSeason: number;
    selectedEpisode: number;
    details: any;
    isTauri: boolean;
}

export const TorrentioStreams = ({ torrentData, isLoadingTorrents, numId, mediaType, title, selectedSeason, selectedEpisode, details, isTauri }: TorrentioStreamsProps) => {
    const navigate = useNavigate();
    const { defaultQuality } = useSettingsStore();

    let streamsContent;

    if (!torrentData?.streams?.length) {
        if (isLoadingTorrents) {
            streamsContent = (
                <div className="flex flex-col gap-[3px]">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-[6px] rounded-md bg-white/[0.03] border border-white/[0.05] animate-pulse">
                            <div className="w-7 h-7 rounded-full bg-white/10 shrink-0" />
                            <div className="w-10 h-4 rounded bg-white/10 shrink-0" />
                            <div className="w-6 h-3 rounded bg-white/10" />
                            <div className="w-16 h-3 rounded bg-white/10" />
                            <div className="flex-1 h-3 rounded bg-white/10" />
                        </div>
                    ))}
                </div>
            );
        } else {
            streamsContent = <p className="py-5 text-center text-[#636366] text-xs">No verified streams found for this title.</p>;
        }
    } else {
        const parsedStreams = [...(torrentData.streams || [])]
            .map(s => {
                const norm = { ...s, ...normalizeTorrentioStream(s) };
                const rawName = ((norm.name ?? '') + ' ' + (norm.title ?? '')).toLowerCase();
                const is4K = rawName.includes('2160') || rawName.includes('4k');
                const is1080 = rawName.includes('1080');
                const is720 = rawName.includes('720');
                const isHDR = rawName.includes('hdr') || (rawName.includes('.dv.') || rawName.includes(' dv '));

                const titleLines = (norm.title ?? '').split('\n');
                const fileName = titleLines[0]?.trim() || norm.behaviorHints?.filename || 'Unknown Release';
                const statsLine = titleLines.find(l => l.includes('👤') || l.includes('💾') || l.includes('⚙')) || (titleLines[1] ?? '');

                const seedsMatch = statsLine.match(/(?:👤)\s*(\d+)/u);
                const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : (norm.seeders ?? 0);

                const sizeMatch = statsLine.match(/(?:💾)\s*([\d.]+\s*(?:GB|MB|TB))/iu);
                const sizeStr = sizeMatch ? sizeMatch[1].trim() : norm.size ? `${(norm.size / 1073741824).toFixed(2)} GB` : '';

                const providerMatch = statsLine.match(/(?:⚙️?)\s*([^\n👤💾⚙]+)/u);
                const provider = providerMatch ? providerMatch[1].trim().toLowerCase() : '';

                const isTrustedProvider = provider.includes('piratebay') || provider.includes('yts') || provider.includes('1337x') || provider.includes('torrentgalaxy');

                const qualityBoost: Record<string, Record<string, number>> = {
                    '720p':  { '720p': 3000, '480p': 2000, '1080p': 1000, '4K': 500 },
                    '1080p': { '1080p': 3000, '720p': 2000, '4K': 1500, '480p': 500 },
                    '4K':    { '4K': 3000, '1080p': 2000, '720p': 1000, '480p': 500 },
                };

                const boosts = qualityBoost[defaultQuality] ?? qualityBoost['720p'];

                const streamQuality = is4K ? '4K' 
                    : is1080 ? '1080p' 
                    : is720 ? '720p' 
                    : '480p';

                let customRank = norm.rank || 0;
                customRank += boosts[streamQuality] ?? 0;
                if (isTrustedProvider) customRank += 5000;
                customRank += seeds;

                const isHighlySeeded = seeds > 50 && customRank > 3000;

                return { ...norm, is4K, is1080, is720, isHDR, fileName, seeds, sizeStr, provider, customRank, isHighlySeeded };
            })
            .sort((a: any, b: any) => b.customRank - a.customRank);

        streamsContent = (
            <div className="flex flex-col gap-[3px] max-h-[400px] overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-[#3A3A3C] [&::-webkit-scrollbar-thumb:hover]:bg-[#E50914]">
                {parsedStreams.map((s: any, idx: number) => (
                    <StreamRow
                        key={idx}
                        stream={s}
                        idx={idx}
                        numId={numId}
                        mediaType={mediaType}
                        title={title}
                        selectedSeason={selectedSeason}
                        selectedEpisode={selectedEpisode}
                        isTauri={isTauri}
                        details={details}
                    />
                ))}
            </div>
        );
    }

    return (
        <>
            {streamsContent}

            <div className="mt-3 pt-3 border-t border-white/[0.05]">
                <p className="text-[#636366] text-[8px] uppercase font-black tracking-[0.25em] mb-2 opacity-50">Multi-Source Fallback</p>
                <div className="flex flex-col gap-[3px]">
                    {PROVIDERS.filter(p => p.id !== 'torrentio').map((p) => (
                        <Link
                            key={p.id}
                            to={`/watch/${numId}?type=${mediaType}&source=${p.id}${mediaType === 'tv' ? `&s=${selectedSeason}&e=${selectedEpisode}` : ''}&title=${encodeURIComponent(title)}`}
                            className="flex items-center justify-between px-2 py-[5px] rounded-md bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] transition-all group"
                        >
                            <div className="flex items-center gap-2">
                                <Server className="w-3 h-3 text-[#636366]" />
                                <p className="text-white/60 text-[9px] font-black uppercase tracking-widest">{p.name}</p>
                            </div>
                            <ChevronRight className="w-3 h-3 text-[#636366] group-hover:text-white/40 transition-colors" />
                        </Link>
                    ))}
                </div>
            </div>
        </>
    );
};
