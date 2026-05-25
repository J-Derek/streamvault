import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import CinematicLoader from "@/components/ui/CinematicLoader";
import { ChevronLeft, ChevronRight, Play, Plus, Star, StarHalf, Check, ChevronDown, Server, Download, Copy, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import { getMovieDetails, getTVDetails, getTVSeasonDetails, getExternalIds, getWatchProviders, backdropUrl, posterUrl, profileUrl } from "@/lib/tmdb";
import { normalizeMedia, mapTMDBStatus, PROVIDERS } from "@/lib/tmdb-types";
import { useWatchlist, type WatchStatus } from "@/store/watchlist";
import { TorrentioStreams } from "@/components/title/TorrentioStreams";
import EpisodeList from "@/components/title/EpisodeList";
import { DirectDownloadPanel } from "@/components/DirectDownloadPanel";
import { UnifiedDownload } from "@/components/download/UnifiedDownload";
import { downloadEpisode, downloadSeason } from "@/lib/downloads/manager";
import { useDownloadStore } from "@/store/downloads";
import { useSettingsStore } from "@/store/settings";

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

const openInExternalPlayer = async (id: number, toast: any) => {
    if (!isTauri) return;
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        const item = useDownloadStore.getState().offlineLibrary[id];
        let filePath: string | null = null;
        if (item?.filePath && item.filePath !== 'p2p-engine') {
            filePath = item.filePath;
        }

        const { preferredExternalPlayer, customPlayerPath } = useSettingsStore.getState();
        let pathArg: string | null = null;
        if (preferredExternalPlayer === 'vlc') {
            pathArg = 'vlc';
        } else if (preferredExternalPlayer === 'mpv') {
            pathArg = 'mpv';
        } else if (preferredExternalPlayer === 'custom') {
            pathArg = customPlayerPath || null;
        }

        await invoke("open_in_external_player", { id, filePath, playerPath: pathArg });
    } catch (e) {
        console.error("Failed to open external player:", e);
        if (toast) {
            toast({
                title: "Failed to open player",
                description: String(e),
                variant: "destructive",
            });
        }
    }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatRuntime(minutes?: number): string {
    if (!minutes) return "";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatMoney(n?: number): string {
    if (!n || n === 0) return "";
    return `$${n.toLocaleString()}`;
}

function formatDate(str?: string): string {
    if (!str) return "";
    return new Date(str).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

interface StarRatingProps { score: number }
const StarRating = ({ score }: StarRatingProps) => {
    const stars = score / 2; // 10-point to 5-star
    return (
        <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => {
                const filled = i < Math.floor(stars);
                const half = !filled && i < Math.ceil(stars) && stars % 1 >= 0.3;
                return filled
                    ? <Star key={i} className="w-4 h-4 fill-[#F5C518] text-[#F5C518]" />
                    : half
                        ? <StarHalf key={i} className="w-4 h-4 fill-[#F5C518] text-[#F5C518]" />
                        : <Star key={i} className="w-4 h-4 text-[#3A3A3C]" />;
            })}
            <span className="text-[#F5C518] text-sm font-medium ml-1">{score.toFixed(1)}</span>
        </div>
    );
};

const STATUS_COLORS: Record<string, string> = {
    completed: "bg-[#34C759]/20 text-[#34C759]",
    ongoing: "bg-[#00B4D8]/20 text-[#00B4D8]",
    cancelled: "bg-[#636366]/20 text-[#636366]",
    new: "bg-[#BF5AF2]/20 text-[#BF5AF2]",
    leaving: "bg-[#FF9F0A]/20 text-[#FF9F0A]",
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TitleDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const [queryParams] = useSearchParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [showBack, setShowBack] = useState(false);
    const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
    const { addItem, removeItem, updateStatus, isInWatchlist, getItem } = useWatchlist();
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [selectedEpisode, setSelectedEpisode] = useState(1);
    const [showStreams, setShowStreams] = useState(true); // Default to true now for discovery

    const [seasonDownloading, setSeasonDownloading] = useState(false);

    const { preferredExternalPlayer } = useSettingsStore();
    const getPlayerLabel = () => {
        if (preferredExternalPlayer === 'vlc') return 'VLC';
        if (preferredExternalPlayer === 'mpv') return 'MPV';
        if (preferredExternalPlayer === 'custom') return 'Custom Player';
        return 'External Player';
    };

    const mediaType = (queryParams.get("type") ?? "movie") as "movie" | "tv";
    const numId = Number(id);
    const inWatchlist = isInWatchlist(numId);
    const watchlistEntry = getItem(numId);

    // Back button on scroll
    useEffect(() => {
        const onScroll = () => setShowBack(window.scrollY > 100);
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Fetch details
    const { data: details, isLoading, isError } = useQuery<any>({
        queryKey: ["titleDetail", numId, mediaType],
        queryFn: () => mediaType === "movie" ? getMovieDetails(numId) : getTVDetails(numId),
        enabled: !!numId,
        retry: 1,
    });

    const { data: providers } = useQuery<any>({
        queryKey: ["watchProviders", numId, mediaType],
        queryFn: () => getWatchProviders(numId, mediaType),
        enabled: !!numId,
    });

    const { data: seasonData, isLoading: isLoadingSeason } = useQuery<any>({
        queryKey: ["tvSeason", numId, selectedSeason],
        queryFn: () => getTVSeasonDetails(numId, selectedSeason),
        enabled: mediaType === "tv" && !!numId,
    });

    const { data: externalIds } = useQuery<any>({
        queryKey: ["externalIds", numId, mediaType],
        queryFn: () => getExternalIds(numId, mediaType),
        enabled: !!numId,
    });

    const imdbId = externalIds?.imdb_id;
    const torrentioType = mediaType === "movie" ? "movie" : "series";
    const torrentioId = mediaType === "movie" ? imdbId : `${imdbId}:${selectedSeason}:${selectedEpisode}`;

    const { data: torrentData, isLoading: isLoadingTorrents } = useQuery<any>({
        queryKey: ["torrentio", torrentioId],
        queryFn: async () => {
            if (!imdbId) return null;
            const res = await fetch(`https://torrentio.strem.fun/stream/${torrentioType}/${torrentioId}.json`);
            return res.json();
        },
        enabled: !!imdbId,
    });

    const handleWatchlist = () => {
        if (!details) return;
        const d = details as any;
        const title = mediaType === "movie" ? d.title : d.name;
        if (inWatchlist) {
            removeItem(numId);
            toast({ title: "Removed from watchlist", description: title });
        } else {
            addItem({
                id: numId,
                mediaType,
                title,
                posterPath: d.poster_path ?? null,
                rating: d.vote_average ?? 0,
                year: ((mediaType === "movie" ? d.release_date : d.first_air_date) ?? "").slice(0, 4),
                genres: (d.genres ?? []).map((g: any) => g.name),
                contentStatus: mapTMDBStatus(d.status),
            });
            toast({ title: "Added to watchlist", description: title });
        }
    };

    const handleStatusChange = (status: WatchStatus) => {
        if (!inWatchlist && details) {
            const d = details as any;
            addItem({
                id: numId, mediaType,
                title: mediaType === "movie" ? d.title : d.name,
                posterPath: d.poster_path ?? null,
                rating: d.vote_average ?? 0,
                year: ((mediaType === "movie" ? d.release_date : d.first_air_date) ?? "").slice(0, 4),
                genres: (d.genres ?? []).map((g: any) => g.name),
                contentStatus: mapTMDBStatus(d.status),
            });
        }
        updateStatus(numId, status);
        toast({ title: `Moved to ${status}` });
    };

    // ─── Loading skeleton ───
    if (isError) {
        return (
            <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
                <div className="text-center max-w-md px-4">
                    <div className="w-20 h-20 rounded-full bg-[#E50914]/10 flex items-center justify-center mx-auto mb-6">
                        <span className="text-3xl">?</span>
                    </div>
                    <h2 className="text-xl font-bold mb-2">Couldn't load this title</h2>
                    <p className="text-[#AEAEB2] mb-8">
                        We couldn't find details for this title. It might not exist or there was a network error.
                    </p>
                    <button
                        onClick={() => navigate(-1)}
                        className="bg-[#E50914] hover:bg-[#B00610] text-white px-8 py-2 rounded-lg font-semibold transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    if (isLoading || !details) {
        return <CinematicLoader text="Decrypting Title Details..." />;
    }

    const isMovie = mediaType === "movie";
    const d = details as any;
    const title = isMovie ? d.title : d.name;
    const year = ((isMovie ? d.release_date : d.first_air_date) ?? "").slice(0, 4);
    const runtime = isMovie ? formatRuntime(d.runtime) : d.number_of_seasons ? `${d.number_of_seasons} Seasons` : "";
    const status = mapTMDBStatus(d.status);
    const genres = (d.genres ?? []) as { id: number; name: string }[];
    const cast = (d.credits?.cast ?? []).slice(0, 15);
    const crew = d.credits?.crew ?? [];
    const directors = crew.filter((c: any) => c.job === "Director");
    const writers = crew.filter((c: any) => c.department === "Writing").slice(0, 8);
    const similar = (d.similar?.results ?? []).slice(0, 12);
    const reviews = (d.reviews?.results ?? []).slice(0, 5);
    const videos = (d.videos?.results ?? []).filter((v: any) => v.site === "YouTube" && v.type === "Trailer");

    const flatrateProviders = providers?.flatrate ?? [];
    const isLeaving = status === "leaving";

    return (
        <div className="min-h-screen bg-[#0D0D0D]">
            <Navbar />

            {/* Back button */}
            {showBack && (
                <button
                    onClick={() => navigate(-1)}
                    className="fixed top-20 left-4 z-40 flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#0D0D0D]/80 backdrop-blur-sm border border-[#3A3A3C] text-[#AEAEB2] hover:text-white transition-all text-sm"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                </button>
            )}

            {/* HERO */}
            <section
                className="relative w-full min-h-[65vh] flex items-end overflow-hidden"
                style={{ background: `url(${backdropUrl(d.backdrop_path, "w1280")}) center/cover no-repeat` }}
            >
                {/* Gradient overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-[#0D0D0D]/30 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D0D]/90 via-[#0D0D0D]/20 to-transparent" />

                {/* Poster â€” desktop only */}
                <div className="absolute right-8 bottom-0 hidden lg:block z-10">
                    <img
                        src={posterUrl(d.poster_path, "w342")}
                        alt={title}
                        className="w-[185px] rounded-xl shadow-2xl border border-[#3A3A3C]"
                    />
                </div>

                {/* Content */}
                <div className="relative z-10 w-full max-w-[1200px] mx-auto px-4 md:px-8 pb-12 pt-32">
                    <div className="max-w-[550px] space-y-4">
                        {/* Title */}
                        <h1 className="text-white font-black text-[28px] md:text-[48px] leading-tight">{title}</h1>

                        {/* Metadata */}
                        <div className="flex flex-wrap items-center gap-2 text-sm text-[#AEAEB2]">
                            {year && <span>{year}</span>}
                            {runtime && <><span className="w-1 h-1 rounded-full bg-current" /><span>{runtime}</span></>}
                            {d.original_language && (
                                <><span className="w-1 h-1 rounded-full bg-current" />
                                    <span className="uppercase">{d.original_language}</span></>
                            )}
                            {status && (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_COLORS[status] ?? ""}`}>
                                    {status}
                                </span>
                            )}
                        </div>

                        {/* Star rating */}
                        {d.vote_average > 0 && (
                            <div className="flex items-center gap-2">
                                <StarRating score={d.vote_average} />
                                <span className="text-[#AEAEB2] text-xs">({(d.vote_count ?? 0).toLocaleString()} votes)</span>
                            </div>
                        )}

                        {/* Genre pills */}
                        <div className="flex flex-wrap gap-2">
                            {genres.map((g) => (
                                <Link
                                    key={g.id}
                                    to={`/browse?genres=${g.id}`}
                                    className="px-3 py-1 rounded-full border border-[#3A3A3C] text-xs text-[#AEAEB2] hover:border-[#636366] hover:text-white transition-all"
                                >
                                    {g.name}
                                </Link>
                            ))}
                        </div>

                        {/* Synopsis */}
                        {d.overview && (
                            <p className="text-[#AEAEB2] text-sm md:text-base leading-relaxed line-clamp-3 max-w-md">
                                {d.overview}
                            </p>
                        )}

                        {/* CTA buttons */}
                        <div className="flex flex-wrap gap-3 pt-1">
                            {isTauri && useDownloadStore.getState().offlineLibrary[numId] ? (
                                <Button onClick={() => openInExternalPlayer(numId, toast)} className="gap-2 bg-[#E50914] hover:bg-[#B00610] text-white border-none h-11">
                                    <Play className="w-5 h-5 fill-current" />
                                    Play {mediaType === "tv" ? `S${selectedSeason}:E${selectedEpisode}` : "Now"} in {getPlayerLabel()}
                                </Button>
                            ) : (
                                <Link to={`/watch/${numId}?type=${mediaType}${mediaType === "tv" ? `&s=${selectedSeason}&e=${selectedEpisode}` : ""}`}>
                                    <Button className="gap-2 bg-[#E50914] hover:bg-[#B00610] text-white border-none h-11">
                                        <Play className="w-5 h-5 fill-current" />
                                        Play {mediaType === "tv" ? `S${selectedSeason}:E${selectedEpisode}` : "Now"}
                                    </Button>
                                </Link>
                            )}

                            {details?.videos?.results?.find((v: any) => v.type === 'Trailer') && (
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="gap-2 bg-[#1C1C1E] border-[#3A3A3C] text-white hover:bg-[#2C2C2E] h-11 px-5">
                                            <Play className="w-5 h-5" />
                                            Trailer
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-4xl p-0 bg-black border-none aspect-video">
                                        <iframe
                                            width="100%"
                                            height="100%"
                                            src={`https://www.youtube.com/embed/${details.videos.results.find((v: any) => v.type === 'Trailer').key}?autoplay=1`}
                                            title="Trailer"
                                            frameBorder="0"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        />
                                    </DialogContent>
                                </Dialog>
                            )}
                            <div className="flex">
                                <Button
                                    variant="outline"
                                    onClick={handleWatchlist}
                                    className={`gap-2 h-11 rounded-r-none border-r-0 ${inWatchlist
                                        ? "bg-[#34C759]/10 border-[#34C759]/40 text-[#34C759] hover:bg-[#34C759]/20"
                                        : "bg-[#2C2C2E] border-[#3A3A3C] text-white hover:bg-[#3A3A3C]"
                                        }`}
                                >
                                    {inWatchlist ? <Check className="w-4 h-4" /> : <Plus className="w-5 h-5" />}
                                    {inWatchlist ? "In Watchlist" : "Watchlist"}
                                </Button>
                                {inWatchlist && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="h-11 px-2 rounded-l-none bg-[#34C759]/10 border-[#34C759]/40 text-[#34C759] hover:bg-[#34C759]/20">
                                                <ChevronDown className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white">
                                            {(["watching", "done", "paused", "want"] as WatchStatus[]).map(s => (
                                                <DropdownMenuItem key={s} onClick={() => handleStatusChange(s)} className="hover:bg-[#2C2C2E] cursor-pointer capitalize">
                                                    Move to {s === "want" ? "Want to Watch" : s}
                                                </DropdownMenuItem>
                                            ))}
                                            <DropdownMenuItem onClick={() => { removeItem(numId); toast({ title: "Removed from watchlist" }); }} className="text-[#E50914] hover:bg-[#2C2C2E] cursor-pointer">
                                                Remove from list
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                            {/* Download button */}
                            {isTauri && (
                                <UnifiedDownload
                                    media={normalizeMedia(d, mediaType)}
                                    torrentData={torrentData}
                                    imdbId={imdbId}
                                    details={d}
                                    mediaType={mediaType}
                                    isTauri={isTauri}
                                />
                            )}
                        </div>
                        {/* Watch providers */}
                        <div className="flex items-center gap-3 flex-wrap mt-4">
                            <span className="text-[#636366] text-xs font-semibold uppercase tracking-wider">Official Streams:</span>
                            {flatrateProviders.length > 0 ? (
                                flatrateProviders.slice(0, 5).map((p: any) => (
                                    <div key={p.provider_id} className="relative group/prov">
                                        <img
                                            src={profileUrl(p.logo_path, "w92")}
                                            alt={p.provider_name}
                                            className="w-7 h-7 rounded-md object-cover border border-[#3A3A3C]"
                                        />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1C1C1E] text-white text-[10px] rounded opacity-0 group-hover/prov:opacity-100 transition-opacity whitespace-nowrap border border-[#3A3A3C] pointer-events-none">
                                            {p.provider_name}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <span className="text-[#636366] text-xs">Not available on official platforms</span>
                            )}
                        </div>

                        {/* Stream / Download sources consolidated Accordion */}
                        <Accordion type="single" collapsible defaultValue="streams" className="w-full mt-6 border-t border-white/[0.05]">
                            <AccordionItem value="streams" className="border-b border-white/[0.05]">
                                <AccordionTrigger className="hover:no-underline py-3 px-1 text-left [&[data-state=open]>svg]:rotate-180">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-3.5 bg-[#E50914] rounded-full shrink-0" />
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                                            Verified Real-Time Streams
                                            {isLoadingTorrents && (
                                                <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin inline-block" />
                                            )}
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="pt-1 pb-3 px-1">
                                    <TorrentioStreams
                                        torrentData={torrentData}
                                        isLoadingTorrents={isLoadingTorrents}
                                        numId={numId}
                                        mediaType={mediaType}
                                        title={title}
                                        selectedSeason={selectedSeason}
                                        selectedEpisode={selectedEpisode}
                                        details={d}
                                        isTauri={isTauri}
                                    />
                                </AccordionContent>
                            </AccordionItem>

                            {isTauri && (
                                <AccordionItem value="downloads" className="border-b border-white/[0.05]">
                                    <AccordionTrigger className="hover:no-underline py-3 px-1 text-left [&[data-state=open]>svg]:rotate-180">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-3.5 bg-[#BF5AF2] rounded-full shrink-0" />
                                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">
                                                Direct Download Sources
                                            </span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-1 pb-3 px-1">
                                        <DirectDownloadPanel
                                            imdbId={imdbId}
                                            media={normalizeMedia(d, mediaType)}
                                            season={mediaType === 'tv' ? selectedSeason : undefined}
                                            episode={mediaType === 'tv' ? selectedEpisode : undefined}
                                            isAccordionMode={true}
                                        />
                                    </AccordionContent>
                                </AccordionItem>
                            )}
                        </Accordion>                    </div>
                </div>
            </section>

            {/* Leaving soon banner */}
            {isLeaving && (
                <div className="bg-[#FF9F0A]/10 border-b border-[#FF9F0A]/30 py-2 px-4 text-center">
                    <span className="text-[#FF9F0A] text-sm font-medium">Leaving soon</span>
                </div>
            )}

            {/* TAB BAR */}
            <div className="max-w-[1200px] mx-auto px-4 md:px-8">
                <Tabs defaultValue={mediaType === "tv" ? "episodes" : "overview"} className="mt-0">
                    <TabsList className="w-full justify-start bg-[#1C1C1E] border-b border-[#3A3A3C] rounded-none px-0 h-auto sticky top-16 z-20">
                        {[...(mediaType === "tv" ? ["episodes"] : []), "overview", "cast", "similar", "reviews"].map((tab) => (
                            <TabsTrigger key={tab} value={tab} className="capitalize px-6 py-3 rounded-none data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-[#E50914] data-[state=inactive]:text-[#AEAEB2] bg-transparent hover:text-white transition-colors">
                                {tab === "cast" ? "Cast & Crew" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <TabsContent value="overview" className="py-8 space-y-6">
                        {d.tagline && <p className="text-[#AEAEB2] italic text-base">"{d.tagline}"</p>}
                        {d.overview && <p className="text-white leading-relaxed">{d.overview}</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 bg-[#1C1C1E] rounded-xl p-6 border border-[#3A3A3C]">
                            {[
                                { label: "Status", value: d.status },
                                { label: "Original Language", value: d.original_language?.toUpperCase() },
                                ...(isMovie ? [{ label: "Budget", value: formatMoney(d.budget) }, { label: "Revenue", value: formatMoney(d.revenue) }] : []),
                                { label: "Production Companies", value: (d.production_companies ?? []).map((c: any) => c.name).join(", ") },
                            ].filter((row) => row.value).map(({ label, value }) => (
                                <div key={label}>
                                    <p className="text-[#636366] text-xs uppercase tracking-wider mb-0.5">{label}</p>
                                    <p className="text-white text-sm">{value}</p>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="cast" className="py-8 space-y-8">
                        {[
                            { label: "Cast", people: cast, getSubtitle: (p: any) => p.character },
                            { label: "Director", people: directors, getSubtitle: (p: any) => p.job },
                            { label: "Writers", people: writers, getSubtitle: (p: any) => p.job },
                        ].filter(({ people }) => people.length > 0).map(({ label, people, getSubtitle }) => (
                            <div key={label}>
                                <h3 className="text-white font-bold text-lg mb-4">{label}</h3>
                                <div className="flex gap-4 overflow-x-auto pb-2">
                                    {people.map((person: any) => (
                                        <div key={`${person.id}-${person.character ?? person.job}`} className="flex-shrink-0 w-[100px] text-center">
                                            <img src={profileUrl(person.profile_path, "w185")} alt={person.name} className="w-24 h-24 rounded-full object-cover mx-auto bg-[#1C1C1E] border-2 border-[#3A3A3C]" loading="lazy" />
                                            <p className="text-white text-xs font-semibold mt-2 leading-tight">{person.name}</p>
                                            <p className="text-[#636366] text-[11px] mt-0.5 line-clamp-2">{getSubtitle(person)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </TabsContent>

                    <TabsContent value="similar" className="py-8">
                        {similar.length === 0 ? (
                            <p className="text-[#AEAEB2] text-center py-12">No similar titles found.</p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                                {similar.map((item: any) => {
                                    const m = normalizeMedia(item, mediaType);
                                    return (
                                        <Link to={`/title/${m.id}?type=${mediaType}`} key={m.id} className="group block">
                                            <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C1E] group-hover:scale-105 transition-transform">
                                                <img src={posterUrl(m.posterPath, "w342")} alt={m.title} className="w-full h-full object-cover" loading="lazy" />
                                            </div>
                                            <p className="text-white text-sm font-medium mt-2 truncate">{m.title}</p>
                                            {m.year && <p className="text-[#AEAEB2] text-xs">{m.year}</p>}
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="reviews" className="py-8">
                        {reviews.length === 0 ? (
                            <p className="text-[#AEAEB2] text-center py-12">No reviews yet.</p>
                        ) : (
                            <div className="space-y-0 divide-y divide-[#3A3A3C]">
                                {reviews.map((review: any) => {
                                    const isExpanded = expandedReviews.has(review.id);
                                    const rating = review.author_details?.rating;
                                    return (
                                        <div key={review.id} className="py-6">
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <div>
                                                    <p className="text-white font-semibold">{review.author}</p>
                                                    <p className="text-[#636366] text-xs">{formatDate(review.created_at)}</p>
                                                </div>
                                                {rating != null && (
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <Star className="w-3.5 h-3.5 fill-[#F5C518] text-[#F5C518]" />
                                                        <span className="text-[#F5C518] text-sm">{(rating / 2).toFixed(1)}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <p className={`text-[#AEAEB2] text-sm leading-relaxed ${isExpanded ? "" : "line-clamp-4"}`}>{review.content}</p>
                                            {review.content.length > 300 && (
                                                <button onClick={() => setExpandedReviews((prev) => { const next = new Set(prev); if (next.has(review.id)) next.delete(review.id); else next.add(review.id); return next; })} className="text-[#E50914] text-xs mt-1 hover:underline">
                                                    {isExpanded ? "Show less" : "Show more"}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </TabsContent>

                    {mediaType === "tv" && (
                        <TabsContent value="episodes" className="py-8">
                            <EpisodeList
                                seasons={d.seasons ?? []}
                                seasonData={seasonData}
                                isLoadingSeason={isLoadingSeason}
                                selectedSeason={selectedSeason}
                                selectedEpisode={selectedEpisode}
                                onSeasonChange={setSelectedSeason}
                                onEpisodeChange={setSelectedEpisode}
                                numId={numId}
                                title={title}
                                imdbId={imdbId}
                                isTauri={isTauri}
                                formatDate={formatDate}
                                posterPath={d.poster_path}
                                backdropPath={d.backdrop_path}
                            />
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </div>
    );
};

export default TitleDetailPage;


