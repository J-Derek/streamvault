import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Check, Play, Square, CheckSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { downloadEpisode } from "@/lib/downloads/manager";
import { useDownloadStore } from "@/store/downloads";
import { useSettingsStore } from "@/store/settings";
import { backdropUrl } from "@/lib/tmdb";
import { StreamVaultMedia } from "@/lib/tmdb-types";

interface EpisodeListProps {
    seasons: { id: number; season_number: number }[];
    seasonData: any;
    isLoadingSeason: boolean;
    selectedSeason: number;
    selectedEpisode: number;
    onSeasonChange: (season: number) => void;
    onEpisodeChange: (episode: number) => void;
    numId: number;
    title: string;
    imdbId: string | undefined;
    isTauri: boolean;
    /* Date formatting helper */
    formatDate: (str?: string) => string;
    posterPath?: string | null;
    backdropPath?: string | null;
}

const EpisodeList = ({ seasons, seasonData, isLoadingSeason, selectedSeason, selectedEpisode, onSeasonChange, onEpisodeChange, numId, title, imdbId, isTauri, formatDate, posterPath, backdropPath }: EpisodeListProps) => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [seasonDownloading, setSeasonDownloading] = useState(false);
    const [selectedEps, setSelectedEps] = useState<Set<number>>(new Set());

    const downloadsStore = useDownloadStore();
    const episodes = seasonData?.episodes ?? [];
    const allSelected = episodes.length > 0 && episodes.every((ep: any) => selectedEps.has(ep.episode_number));

    const isEpisodeAvailableOrQueued = (epNum: number) => {
        const epKey = `${numId}:s${selectedSeason}e${epNum}`;
        const isDownloaded = !!downloadsStore.episodeLibrary[epKey];
        const isInTasks = Object.keys(downloadsStore.tasks).some(k => k.startsWith(epKey));
        return isDownloaded || isInTasks;
    };

    const toggleEp = (num: number) => {
        setSelectedEps(prev => {
            const next = new Set(prev);
            if (next.has(num)) next.delete(num); else next.add(num);
            return next;
        });
    };

    const toggleAll = () => {
        if (allSelected) {
            setSelectedEps(new Set());
        } else {
            setSelectedEps(new Set(episodes.map((ep: any) => ep.episode_number)));
        }
    };

    const selectedList = Array.from(selectedEps);
    const selectedNotAlreadyDownloadedOrQueued = selectedList.filter(epNum => !isEpisodeAvailableOrQueued(epNum));
    const isDownloadDisabled = selectedEps.size === 0 || selectedNotAlreadyDownloadedOrQueued.length === 0;

    const downloadSelected = async () => {
        if (!imdbId || selectedNotAlreadyDownloadedOrQueued.length === 0) return;
        setSeasonDownloading(true);
        
        toast({ 
            title: "Adding to queue", 
            description: `Queuing ${selectedNotAlreadyDownloadedOrQueued.length} episode(s)...`,
        });

        // Loop over non-downloaded, non-queued selected episodes
        for (const ep of selectedNotAlreadyDownloadedOrQueued) {
            try {
                const torrentioUrl = `https://torrentio.strem.fun/stream/series/${imdbId}:${selectedSeason}:${ep}.json`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(torrentioUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                const data = await res.json();

                if (!data?.streams?.length) {
                    console.warn(`No streams found for ${title} S${selectedSeason}:E${ep}`);
                    continue;
                }

                // Parse resolution from stream name/title — preference: 1080p → 720p → 480p
                const getRes = (s: any): number => {
                    const raw = ((s.name ?? '') + ' ' + (s.title ?? '')).toLowerCase();
                    if (raw.includes('2160') || raw.includes('4k')) return 2160;
                    if (raw.includes('1080')) return 1080;
                    if (raw.includes('720')) return 720;
                    if (raw.includes('480') || raw.includes('hq')) return 480;
                    if (raw.includes('360')) return 360;
                    return 0;
                };

                const { defaultQuality } = useSettingsStore.getState();

                const qualityMap: Record<string, number[]> = {
                    '720p':  [720, 480, 1080],
                    '1080p': [1080, 720, 480],
                    '4K':    [2160, 1080, 720],
                };

                const fallbacks = qualityMap[defaultQuality] ?? [720, 480, 1080];

                let bestStream: any | undefined;
                for (const target of fallbacks) {
                    bestStream = data.streams.find((s: any) => getRes(s) === target);
                    if (bestStream) break;
                }
                if (!bestStream) bestStream = data.streams[0];

                const streamUrl = bestStream?.url;
                const streamInfoHash = bestStream?.infoHash;
                const magnetUrl = streamUrl?.startsWith('magnet:')
                    ? streamUrl
                    : streamInfoHash
                        ? `magnet:?xt=urn:btih:${streamInfoHash}`
                        : null;
                if (!magnetUrl) {
                    console.warn(`No magnet URL for ${title} S${selectedSeason}:E${ep}`);
                    continue;
                }

                const infoHash = streamInfoHash || magnetUrl.match(/btih:([a-fA-F0-9]+)/)?.[1];
                if (!infoHash) {
                    console.warn(`Could not extract infoHash for ${title} S${selectedSeason}:E${ep}`);
                    continue;
                }

                const episodeKey = `${numId}:s${selectedSeason}e${ep}`;
                const taskKey = `${episodeKey}::${infoHash}`;
                const episodeMedia: StreamVaultMedia = {
                    id: numId,
                    mediaType: 'tv',
                    title: `${title} - S${selectedSeason}:E${ep}`,
                    posterPath: posterPath || null,
                    backdropPath: backdropPath || null,
                    year: '',
                    rating: 0,
                    genres: [],
                    status: null,
                };

                downloadsStore.addTask(episodeMedia, infoHash, magnetUrl || undefined, streamUrl || undefined, taskKey);
            } catch (e) {
                console.error(`Failed to queue episode ${title} S${selectedSeason}:E${ep}:`, e);
            }
            // Add a small delay between requests to avoid overloading Torrentio API
            await new Promise(r => setTimeout(r, 500));
        }

        toast({
            title: "Queue updated",
            description: `Successfully added ${selectedNotAlreadyDownloadedOrQueued.length} episode(s) to the download queue!`,
        });

        setSelectedEps(new Set());
        setSeasonDownloading(false);
    };

    return (
        <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-48 shrink-0 space-y-2">
                <h3 className="text-white font-bold mb-3">Seasons</h3>
                <div className="flex flex-row md:flex-col gap-2 overflow-x-auto pb-2">
                    {seasons.filter((s: any) => s.season_number > 0).map((s: any) => (
                        <button
                            key={s.id}
                            onClick={() => { onSeasonChange(s.season_number); onEpisodeChange(1); setSelectedEps(new Set()); }}
                            className={`px-4 py-2 rounded-lg text-sm text-left transition-all whitespace-nowrap ${selectedSeason === s.season_number ? "bg-[#E50914] text-white" : "bg-[#1C1C1E] text-[#AEAEB2] hover:text-white border border-[#3A3A3C]"}`}
                        >
                            Season {s.season_number}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold">
                        {seasonData?.name || `Season ${selectedSeason}`}
                        <span className="text-[#636366] font-normal ml-2 text-sm">{episodes.length} Episodes</span>
                    </h3>
                    {isTauri && (
                        <div className="flex items-center gap-4">
                            <button
                                onClick={toggleAll}
                                className="text-xs font-bold text-[#AEAEB2] hover:text-white uppercase tracking-wider transition-colors"
                            >
                                {allSelected ? "Deselect All" : "Select All"}
                            </button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={isDownloadDisabled || seasonDownloading}
                                onClick={downloadSelected}
                                className={`h-8 px-4 transition-all duration-200 ${
                                    isDownloadDisabled
                                        ? "text-[#AEAEB2]/50 border-[#3A3A3C] bg-[#1C1C1E] cursor-not-allowed"
                                        : "text-[#E50914] hover:text-white border-[#E50914]/40 bg-[#E50914]/10 hover:bg-[#E50914]/20 font-semibold"
                                }`}
                            >
                                {seasonDownloading ? (
                                    <span className="w-3.5 h-3.5 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Download className="w-3.5 h-3.5 mr-2" />
                                )}
                                {seasonDownloading ? "Queuing..." : `Download Selected (${selectedEps.size} episodes)`}
                            </Button>
                        </div>
                    )}
                </div>
                {isLoadingSeason ? (
                    <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full bg-[#1C1C1E]" />)}</div>
                ) : (
                    <div className="grid gap-3">
                        {(seasonData?.episodes ?? []).map((ep: any) => {
                            const epKey = `${numId}:s${selectedSeason}e${ep.episode_number}`;
                            const epLib = downloadsStore.episodeLibrary;
                            const isDownloaded = !!epLib[epKey];
                            const isInTasks = Object.keys(downloadsStore.tasks).some(k => k.startsWith(epKey));
                            return (
                                <div
                                    key={ep.id}
                                    className={`group p-3 rounded-xl border transition-all flex items-center gap-4 ${selectedEpisode === ep.episode_number ? "bg-[#E50914]/10 border-[#E50914]/50" : "bg-[#1C1C1E] border-[#3A3A3C] hover:border-[#636366]"}`}
                                >
                                    {isTauri && (
                                        <button
                                            disabled={isDownloaded || isInTasks}
                                            onClick={() => toggleEp(ep.episode_number)}
                                            className={`shrink-0 transition-colors p-1 rounded-md ${
                                                isDownloaded || isInTasks
                                                    ? "text-[#3A3A3C] cursor-not-allowed"
                                                    : "text-[#AEAEB2] hover:text-white hover:bg-white/5"
                                            }`}
                                            aria-label={selectedEps.has(ep.episode_number) ? "Deselect episode" : "Select episode"}
                                        >
                                            {isDownloaded ? (
                                                <CheckSquare className="w-5 h-5 text-[#34C759]/40" />
                                            ) : isInTasks ? (
                                                <CheckSquare className="w-5 h-5 text-[#FF9F0A]/40 animate-pulse" />
                                            ) : selectedEps.has(ep.episode_number) ? (
                                                <CheckSquare className="w-5 h-5 text-[#E50914]" />
                                            ) : (
                                                <Square className="w-5 h-5" />
                                            )}
                                        </button>
                                    )}
                                    <div className="relative w-32 aspect-video shrink-0 rounded-lg overflow-hidden bg-[#0D0D0D]">
                                        <img src={backdropUrl(ep.still_path, "w300")} alt={ep.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                        <button
                                            onClick={() => { onEpisodeChange(ep.episode_number); navigate(`/watch/${numId}?type=tv&s=${selectedSeason}&e=${ep.episode_number}`); }}
                                            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Play className="w-8 h-8 text-white fill-current" />
                                        </button>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[#E50914] text-xs font-bold uppercase tracking-wider">Episode {ep.episode_number}</span>
                                            <span className="text-[#636366] text-xs">•</span>
                                            <span className="text-[#636366] text-xs">{formatDate(ep.air_date)}</span>
                                        </div>
                                        <h4 className="text-white font-semibold truncate group-hover:text-[#E50914] transition-colors">{ep.name}</h4>
                                        <p className="text-[#AEAEB2] text-xs line-clamp-2 mt-1 pr-4">{ep.overview || "No overview available for this episode."}</p>
                                    </div>
                                    {isTauri && (
                                        <div className="shrink-0 flex items-center gap-2">
                                            {isDownloaded ? (
                                                <span className="flex items-center gap-1.5 bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/20 px-2.5 py-1 rounded-full text-xs font-semibold">
                                                    <Check className="w-3.5 h-3.5" />
                                                    Downloaded
                                                </span>
                                            ) : isInTasks ? (
                                                <span className="flex items-center gap-1.5 bg-[#FF9F0A]/10 text-[#FF9F0A] border border-[#FF9F0A]/20 px-2.5 py-1 rounded-full text-xs font-semibold animate-pulse">
                                                    In Queue
                                                </span>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => downloadEpisode(numId, title, selectedSeason, ep.episode_number, imdbId || '', posterPath, backdropPath)}
                                                    className="text-[#AEAEB2] hover:text-white hover:bg-white/10 h-8 px-3"
                                                >
                                                    <Download className="w-3.5 h-3.5 mr-1" />
                                                    DL
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EpisodeList;
