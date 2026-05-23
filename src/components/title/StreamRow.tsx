import { Play, Users, Server, Download, ExternalLink } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import DownloadButton from "@/components/DownloadButton";
import { normalizeMedia } from "@/lib/tmdb-types";

interface StreamRowProps {
    stream: any;
    idx: number;
    numId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    selectedSeason: number;
    selectedEpisode: number;
    isTauri: boolean;
    details: any;
}

const isTauriDetect = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

const pillColor = (s: any) => {
    if (s.is4K) return 'bg-[#BF5AF2]/20 text-[#BF5AF2] border-[#BF5AF2]/40';
    if (s.is1080) return 'bg-[#00B4D8]/20 text-[#00B4D8] border-[#00B4D8]/40';
    if (s.is720) return 'bg-[#34C759]/20 text-[#34C759] border-[#34C759]/40';
    return 'bg-white/10 text-[#AEAEB2] border-white/10';
};

export const StreamRow = ({ stream, idx, numId, mediaType, title, selectedSeason, selectedEpisode, isTauri, details }: StreamRowProps) => {
    const navigate = useNavigate();
    const qualLabel = stream.is4K ? '4K' : stream.is1080 ? '1080P' : stream.is720 ? '720P' : 'HD';
    const fullLabel = stream.isHDR ? `${qualLabel} | HDR` : qualLabel;

    return (
        <div className="flex items-center gap-2 px-2 py-[6px] rounded-md bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.07] hover:border-white/[0.15] transition-all duration-150 group">
                <button
                    onClick={() => navigate(`/watch/${numId}?type=${mediaType}&source=torrentio&infoHash=${stream.infoHash}&fileIdx=${stream.fileIdx ?? 0}${mediaType === 'tv' ? `&s=${selectedSeason}&e=${selectedEpisode}` : ''}&title=${encodeURIComponent(title)}`)}
                    className="w-9 h-9 rounded-full bg-[#E50914] flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(229,9,20,0.35)] hover:scale-105 active:scale-95 transition-transform"
                    aria-label="Stream this source"
                >
                <Play className="w-3 h-3 fill-white text-white ml-0.5" />
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
                <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-wide ${pillColor(stream)}`}>
                    {fullLabel}
                </span>
                {stream.isHighlySeeded && (
                    <span className="px-1 py-0.5 rounded bg-[#FF9F0A]/20 text-[#FF9F0A] text-[8px] font-black uppercase tracking-tighter border border-[#FF9F0A]/40 shadow-[0_0_8px_rgba(255,159,10,0.3)]">
                        High Seeds
                    </span>
                )}
                {stream.rank >= 800 && !stream.isHighlySeeded && (
                    <span className="px-1 py-0.5 rounded bg-[#34C759]/10 text-[#34C759] text-[8px] font-black uppercase tracking-tighter border border-[#34C759]/20">
                        Trusted
                    </span>
                )}
            </div>

            <span className="shrink-0 flex items-center gap-[3px] text-[#AEAEB2] text-[10px] font-medium">
                <Users className="w-[10px] h-[10px]" />{stream.seeds}
            </span>

            {stream.sizeStr && (
                <span className="shrink-0 flex items-center gap-[3px] text-[#AEAEB2] text-[10px] font-medium">
                    <Server className="w-[10px] h-[10px]" />{stream.sizeStr}
                </span>
            )}

            {stream.provider && (
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[#AEAEB2] text-[9px] font-bold uppercase tracking-wider">
                    {stream.provider}
                </span>
            )}

            <span className="flex-1 min-w-0 text-[11px] font-semibold text-white/90 truncate">
                {stream.fileName}
            </span>

            <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {isTauri && (
                    <DownloadButton
                        media={normalizeMedia(details, mediaType)}
                        streamUrl={stream.url || (stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(stream.fileName)}` : undefined)}
                        infoHash={stream.infoHash}
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 text-[#AEAEB2] hover:text-white p-0"
                    />
                )}
                <button
                    onClick={() => navigate(`/watch/${numId}?type=${mediaType}&source=torrentio&infoHash=${stream.infoHash}&fileIdx=${stream.fileIdx ?? 0}${mediaType === 'tv' ? `&s=${selectedSeason}&e=${selectedEpisode}` : ''}&title=${encodeURIComponent(title)}`)}
                    className="w-8 h-8 rounded flex items-center justify-center text-[#E50914] hover:bg-[#E50914]/10"
                    aria-label="Open in player"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};
