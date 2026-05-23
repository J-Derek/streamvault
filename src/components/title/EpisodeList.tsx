import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Check, Play, Square, CheckSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { downloadEpisode, downloadSeason } from "@/lib/downloads/manager";
import { useDownloadStore } from "@/store/downloads";
import { backdropUrl } from "@/lib/tmdb";

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
}

const EpisodeList = ({ seasons, seasonData, isLoadingSeason, selectedSeason, selectedEpisode, onSeasonChange, onEpisodeChange, numId, title, imdbId, isTauri, formatDate }: EpisodeListProps) => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [seasonDownloading, setSeasonDownloading] = useState(false);
    const [selectedEps, setSelectedEps] = useState<Set<number>>(new Set());

    const episodes = seasonData?.episodes ?? [];
    const allSelected = episodes.length > 0 && episodes.every((ep: any) => selectedEps.has(ep.episode_number));

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

    const downloadSelected = async () => {
        if (!imdbId || selectedEps.size === 0) return;
        setSeasonDownloading(true);
        toast({ title: "Downloading episodes", description: `Queuing ${selectedEps.size} episode(s)...` });
        const sorted = Array.from(selectedEps).sort((a, b) => a - b);
        for (const ep of sorted) {
            await downloadEpisode(numId, title, selectedSeason, ep, imdbId);
            await new Promise(r => setTimeout(r, 500));
        }
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
                        <div className="flex items-center gap-2">
                            <button
                                onClick={toggleAll}
                                className="text-[10px] font-bold text-[#AEAEB2] hover:text-white uppercase tracking-wider transition-colors"
                            >
                                {allSelected ? "Deselect All" : "Select All"}
                            </button>
                            {selectedEps.size > 0 ? (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={seasonDownloading}
                                    onClick={downloadSelected}
                                    className="text-[#E50914] hover:text-white border-[#E50914]/40 bg-[#E50914]/10 hover:bg-[#E50914]/20 h-8 px-3"
                                >
                                    {seasonDownloading ? (
                                        <span className="w-3.5 h-3.5 mr-1.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Download className="w-3.5 h-3.5 mr-1.5" />
                                    )}
                                    {seasonDownloading ? "Queuing..." : `Download (${selectedEps.size})`}
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={seasonDownloading || !imdbId}
                                    onClick={async () => {
                                        if (!imdbId) {
                                            toast({ title: "No IMDB ID", description: "Cannot start download without an IMDB ID.", variant: "destructive" });
                                            return;
                                        }
                                        setSeasonDownloading(true);
                                        toast({ title: "Downloading season", description: `Starting S${selectedSeason} downloads...` });
                                        await downloadSeason(numId, title, selectedSeason, imdbId, episodes.length);
                                        setSeasonDownloading(false);
                                    }}
                                    className="text-[#AEAEB2] hover:text-white border-[#3A3A3C] bg-[#1C1C1E] h-8 px-3"
                                >
                                    {seasonDownloading ? (
                                        <span className="w-3.5 h-3.5 mr-1.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Download className="w-3.5 h-3.5 mr-1.5" />
                                    )}
                                    {seasonDownloading ? "Queuing..." : "Download Season"}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
                {isLoadingSeason ? (
                    <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full bg-[#1C1C1E]" />)}</div>
                ) : (
                    <div className="grid gap-3">
                        {(seasonData?.episodes ?? []).map((ep: any) => {
                            const epKey = `${numId}:s${selectedSeason}e${ep.episode_number}`;
                            const epLib = useDownloadStore.getState().episodeLibrary;
                            const isDownloaded = !!epLib[epKey];
                            const isInTasks = Object.keys(useDownloadStore.getState().tasks).some(k => k.startsWith(epKey));
                            return (
                                <div
                                    key={ep.id}
                                    className={`group p-3 rounded-xl border transition-all flex items-center gap-4 ${selectedEpisode === ep.episode_number ? "bg-[#E50914]/10 border-[#E50914]/50" : "bg-[#1C1C1E] border-[#3A3A3C] hover:border-[#636366]"}`}
                                >
                                    {isTauri && !isDownloaded && !isInTasks && (
                                        <button
                                            onClick={() => toggleEp(ep.episode_number)}
                                            className="shrink-0 text-[#AEAEB2] hover:text-white transition-colors"
                                            aria-label={selectedEps.has(ep.episode_number) ? "Deselect episode" : "Select episode"}
                                        >
                                            {selectedEps.has(ep.episode_number) ? (
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
                                                <span className="flex items-center gap-1 text-[#34C759] text-xs font-medium">
                                                    <Check className="w-3.5 h-3.5" />
                                                    Downloaded
                                                </span>
                                            ) : isInTasks ? (
                                                <span className="text-[#FF9F0A] text-xs font-medium animate-pulse">Queued…</span>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => downloadEpisode(numId, title, selectedSeason, ep.episode_number, imdbId || '')}
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
