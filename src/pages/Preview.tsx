import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { 
    Volume2, 
    VolumeX, 
    Bookmark, 
    Play, 
    Info, 
    Share2, 
    X, 
    ChevronLeft, 
    Star, 
    Loader2, 
    AlertCircle 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWatchlist } from "@/store/watchlist";
import { 
    getTrendingAllPaginated, 
    getVideos, 
    getGenres, 
    backdropUrl, 
    posterUrl 
} from "@/lib/tmdb";

interface TrailerItem {
    id: number;
    title?: string;
    name?: string;
    overview?: string;
    backdrop_path: string | null;
    poster_path: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average: number;
    genre_ids?: number[];
    media_type: 'movie' | 'tv';
    trailerKey: string;
}

const PreviewPage = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { addItem, removeItem, isInWatchlist } = useWatchlist();

    const [trailers, setTrailers] = useState<TrailerItem[]>([]);
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [isMuted, setIsMuted] = useState<boolean>(true);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    
    // States for loads/errors
    const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
    const [isLoadingNextPage, setIsLoadingNextPage] = useState<boolean>(false);
    const [isError, setIsError] = useState<boolean>(false);
    const [hasMore, setHasMore] = useState<boolean>(true);
    
    // Maps to track loaded states
    const [iframeLoadedMap, setIframeLoadedMap] = useState<Record<number, boolean>>({});
    const [genresMap, setGenresMap] = useState<Record<number, string>>({});

    const pageRef = useRef<number>(1);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load TMDB Genres mapping on mount
    useEffect(() => {
        const loadGenres = async () => {
            try {
                const [movieGenres, tvGenres] = await Promise.all([
                    getGenres('movie'),
                    getGenres('tv')
                ]);
                const map: Record<number, string> = {};
                movieGenres.genres?.forEach(g => { map[g.id] = g.name; });
                tvGenres.genres?.forEach(g => { map[g.id] = g.name; });
                setGenresMap(map);
            } catch (e) {
                console.error("Failed to load TMDB Genres:", e);
            }
        };
        loadGenres();
    }, []);

    // Core function to fetch trending titles, extract video metadata and yield valid items
    const fetchPage = async (pageNum: number): Promise<TrailerItem[]> => {
        const response = await getTrendingAllPaginated(pageNum);
        const results = response.results || [];
        
        // Parallel queries to accelerate API responses
        const enrichedItems = await Promise.all(
            results.map(async (item) => {
                try {
                    const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
                    const videoData = await getVideos(mediaType, item.id);
                    // Find the primary YouTube trailer
                    const trailer = videoData.results?.find(
                        (v) => v.type === 'Trailer' && v.site === 'YouTube'
                    );
                    if (trailer) {
                        return {
                            ...item,
                            media_type: mediaType as 'movie' | 'tv',
                            trailerKey: trailer.key,
                        } as TrailerItem;
                    }
                } catch (e) {
                    console.warn(`No trailers located for ${item.title || item.name}:`, e);
                }
                return null;
            })
        );
        
        return enrichedItems.filter(Boolean) as TrailerItem[];
    };

    // Initial load
    useEffect(() => {
        const initFetch = async () => {
            setIsInitialLoading(true);
            setIsError(false);
            try {
                pageRef.current = 1;
                const items = await fetchPage(1);
                if (items.length === 0) {
                    // Try page 2 as a backup pool
                    const backupItems = await fetchPage(2);
                    setTrailers(backupItems);
                    pageRef.current = 2;
                } else {
                    setTrailers(items);
                }
            } catch (e) {
                console.error("Failed to fetch initial trending trailers:", e);
                setIsError(true);
            } finally {
                setIsInitialLoading(false);
            }
        };
        initFetch();
    }, []);

    // Load next trending page
    const loadMoreTrailers = async () => {
        if (isLoadingNextPage || !hasMore) return;
        setIsLoadingNextPage(true);
        try {
            const nextPage = pageRef.current + 1;
            const newTrailers = await fetchPage(nextPage);
            if (newTrailers.length > 0) {
                setTrailers(prev => [...prev, ...newTrailers]);
                pageRef.current = nextPage;
            } else {
                setHasMore(false);
            }
        } catch (e) {
            console.error("Failed to load more page contents:", e);
        } finally {
            setIsLoadingNextPage(false);
        }
    };

    // Handle container scrolling
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        const index = Math.round(container.scrollTop / container.clientHeight);
        if (index !== activeIndex && index >= 0 && index < trailers.length) {
            setActiveIndex(index);
            setIsFullscreen(false); // Reset fullscreen on scroll
        }
        
        // Infinite scroll threshold
        if (index >= trailers.length - 3 && !isLoadingNextPage && hasMore) {
            loadMoreTrailers();
        }
    };

    const handleVideoClick = () => {
        setIsFullscreen(true);
    };

    const handleCloseFullscreen = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsFullscreen(false);
    };

    const handleShare = (item: TrailerItem) => {
        const titleText = item.title || item.name || "Title";
        const shareUrl = `${window.location.origin}/title/${item.id}?type=${item.media_type}`;
        navigator.clipboard.writeText(shareUrl)
            .then(() => {
                toast({
                    title: "Link copied!",
                    description: `Share link for "${titleText}" copied to clipboard.`,
                });
            })
            .catch(() => {
                toast({
                    title: "Action failed",
                    description: "Unable to write copy link.",
                    variant: "destructive",
                });
            });
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMuted(prev => !prev);
    };

    // UI Buttons
    const SidebarButton = ({ 
        onClick, 
        icon: Icon, 
        label, 
        active = false, 
        activeColorClass = "text-[#E50914]" 
    }: { 
        onClick: () => void; 
        icon: any; 
        label: string; 
        active?: boolean; 
        activeColorClass?: string;
    }) => {
        return (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                }}
                className="flex flex-col items-center gap-1 group active:scale-90 transition-all cursor-pointer text-white"
            >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-md border border-white/10 group-hover:bg-[#2C2C2E]/90 group-hover:border-white/20 transition-all ${active ? activeColorClass : "text-white"}`}>
                    <Icon className={`w-5 h-5 ${active ? "fill-current" : ""}`} />
                </div>
                <span className="text-[10px] text-white/90 font-medium tracking-wide drop-shadow-md select-none">{label}</span>
            </button>
        );
    };

    // Render loading skeletons
    if (isInitialLoading) {
        return (
            <div className="h-screen w-screen bg-black overflow-hidden flex flex-col">
                <div className="flex-1 space-y-4 p-4 flex flex-col justify-end pb-24 bg-gradient-to-t from-zinc-900 to-black animate-pulse">
                    <div className="w-16 h-6 bg-zinc-800 rounded-full" />
                    <div className="w-2/3 h-10 bg-zinc-800 rounded-lg" />
                    <div className="w-1/2 h-4 bg-zinc-800 rounded" />
                    <div className="w-3/4 h-8 bg-zinc-800 rounded" />
                </div>
                <div className="absolute right-4 bottom-24 flex flex-col gap-6 items-center">
                    {[1, 2, 3, 4].map(n => (
                        <div key={n} className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    // Render error
    if (isError) {
        return (
            <div className="h-screen w-screen bg-[#0D0D0D] flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle className="w-16 h-16 text-[#E50914] mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Failed to decrypt trailers</h2>
                <p className="text-[#AEAEB2] max-w-sm mb-6">
                    A network interruption occurred. Please verify your connection to TMDB servers.
                </p>
                <button
                    onClick={() => {
                        setIsError(false);
                        setIsInitialLoading(true);
                        // Trigger reload
                        window.location.reload();
                    }}
                    className="px-6 py-2.5 bg-[#E50914] hover:bg-[#B00610] text-white rounded-md font-semibold text-sm transition-all"
                >
                    Retry Handshake
                </button>
            </div>
        );
    }

    return (
        <div 
            ref={containerRef}
            onScroll={handleScroll}
            className="h-screen w-screen overflow-y-scroll snap-y snap-mandatory bg-black scrollbar-none select-none relative"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
            {/* Top Bar (Back button + Title) */}
            <div className="absolute top-4 left-4 z-40 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black/60 active:scale-95 transition-all cursor-pointer"
                    aria-label="Back"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                {!isFullscreen && (
                    <span className="text-lg font-black tracking-widest text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        TRAILERS
                    </span>
                )}
            </div>

            {/* Global Unmute indicator button at top-right */}
            {!isFullscreen && (
                <button
                    onClick={toggleMute}
                    className="absolute top-4 right-4 z-40 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black/60 active:scale-95 transition-all cursor-pointer"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
            )}

            {trailers.map((item, index) => {
                const isActive = index === activeIndex;
                const isAdjacent = Math.abs(index - activeIndex) <= 1;
                const isIframeLoaded = iframeLoadedMap[index] || false;
                
                const mediaType = item.media_type;
                const titleText = item.title || item.name || "Untitled";
                const releaseYear = ((item.release_date || item.first_air_date) ?? "").slice(0, 4);
                
                const isWatchlisted = isInWatchlist(item.id);

                // Fetch mapped genre titles
                const itemGenres = item.genre_ids 
                    ? item.genre_ids.map(id => genresMap[id]).filter(Boolean).slice(0, 2)
                    : [];

                // Fullscreen toggling state
                const isThisCardFullscreen = isFullscreen && isActive;
                const controls = isThisCardFullscreen ? 1 : 0;
                const mute = isMuted ? 1 : 0;
                const autoplay = isActive ? 1 : 0;

                const iframeSrc = `https://www.youtube.com/embed/${item.trailerKey}?autoplay=${autoplay}&mute=${mute}&controls=${controls}&loop=1&playlist=${item.trailerKey}&enablejsapi=1&modestbranding=1&rel=0`;

                return (
                    <div 
                        key={item.id}
                        className="w-full h-screen relative snap-start shrink-0 flex items-center justify-center overflow-hidden bg-black"
                    >
                        {/* 1. Backdrop or IFrame rendering */}
                        {!isAdjacent ? (
                            // Render simple blurred poster to minimize memory leakages
                            <div className="absolute inset-0 w-full h-full bg-zinc-950">
                                <img 
                                    src={backdropUrl(item.backdrop_path, "w780")} 
                                    alt={titleText} 
                                    className="w-full h-full object-cover filter blur-md opacity-40 scale-105"
                                />
                            </div>
                        ) : (
                            <div className="absolute inset-0 w-full h-full bg-black">
                                {/* Blurred background fallback for wide screen framing */}
                                <img 
                                    src={backdropUrl(item.backdrop_path, "w780")} 
                                    alt={titleText} 
                                    className="absolute inset-0 w-full h-full object-cover filter blur-xl opacity-30 scale-110"
                                />

                                {/* Interactive Video Element */}
                                <div className="absolute inset-0 flex items-center justify-center w-full h-full z-0">
                                    <iframe
                                        src={iframeSrc}
                                        title={titleText}
                                        className="w-full aspect-video md:h-full md:w-auto md:max-w-none border-none scale-105 pointer-events-auto"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        onLoad={() => {
                                            setIframeLoadedMap(prev => ({ ...prev, [index]: true }));
                                        }}
                                    />
                                </div>

                                {/* Click to expand overlay (not present during fullscreen mode to allow playback controls) */}
                                {!isThisCardFullscreen && (
                                    <div 
                                        onClick={handleVideoClick}
                                        className="absolute inset-0 bg-transparent cursor-pointer z-10" 
                                    />
                                )}
                            </div>
                        )}

                        {/* 2. Visual Gradients (only visible if not fullscreen for cinematic watch) */}
                        {!isThisCardFullscreen && (
                            <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none z-10" />
                        )}

                        {/* 3. Close Fullscreen button */}
                        {isThisCardFullscreen && (
                            <button
                                onClick={handleCloseFullscreen}
                                className="absolute top-4 left-4 z-40 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black/60 active:scale-95 transition-all cursor-pointer"
                                aria-label="Exit Fullscreen"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}

                        {/* 4. Left side description overlay (Slide out of sight on fullscreen watch) */}
                        {!isThisCardFullscreen && (
                            <div className="absolute left-4 bottom-24 right-20 z-20 space-y-3 pointer-events-none select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                                {/* Badge Pill */}
                                <div className="flex items-center gap-2">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                        mediaType === 'movie' ? 'bg-[#E50914] text-white' : 'bg-[#00B4D8] text-white'
                                    }`}>
                                        {mediaType === 'movie' ? 'Movie' : 'TV Show'}
                                    </span>
                                    {item.vote_average > 0 && (
                                        <div className="flex items-center gap-0.5 text-xs text-[#F5C518] font-bold bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/5">
                                            <Star className="w-3.5 h-3.5 fill-[#F5C518] text-[#F5C518]" />
                                            {item.vote_average.toFixed(1)}
                                        </div>
                                    )}
                                </div>

                                {/* Title */}
                                <h2 className="text-white text-2xl md:text-3xl font-black leading-tight max-w-lg">
                                    {titleText}
                                </h2>

                                {/* Subtitle info: Year, Genres */}
                                <div className="flex flex-wrap items-center gap-2 text-xs text-white/80">
                                    {releaseYear && <span>{releaseYear}</span>}
                                    {releaseYear && itemGenres.length > 0 && <span className="w-1 h-1 rounded-full bg-white/40" />}
                                    <div className="flex flex-wrap gap-1.5">
                                        {itemGenres.map((gName, gIdx) => (
                                            <span key={gIdx} className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-[10px] font-medium text-white/90">
                                                {gName}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Description overview */}
                                {item.overview && (
                                    <p className="text-xs text-white/70 line-clamp-2 max-w-md leading-relaxed">
                                        {item.overview}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* 5. Right stack / Fullscreen Bottom Row buttons */}
                        <div 
                            className={`absolute transition-all duration-500 ease-out z-20 ${
                                isThisCardFullscreen 
                                    ? "inset-x-0 bottom-6 flex flex-row items-center justify-center gap-6" 
                                    : "right-4 bottom-24 flex flex-col items-center gap-4"
                            }`}
                        >
                            {/* Sound Button */}
                            <SidebarButton
                                onClick={(e: any) => toggleMute(e)}
                                icon={isMuted ? VolumeX : Volume2}
                                label={isMuted ? "Mute" : "Unmute"}
                            />

                            {/* Watchlist Toggle */}
                            <SidebarButton
                                onClick={() => {
                                    if (isWatchlisted) {
                                        removeItem(item.id);
                                        toast({
                                            title: "Removed from Watchlist",
                                            description: `"${titleText}" removed.`
                                        });
                                    } else {
                                        addItem({
                                            id: item.id,
                                            mediaType: mediaType,
                                            title: titleText,
                                            posterPath: item.poster_path ?? null,
                                            rating: item.vote_average ?? 0,
                                            year: releaseYear,
                                            genres: itemGenres,
                                            contentStatus: 'ongoing',
                                        });
                                        toast({
                                            title: "Added to Watchlist",
                                            description: `"${titleText}" added.`
                                        });
                                    }
                                }}
                                icon={Bookmark}
                                label="Watchlist"
                                active={isWatchlisted}
                                activeColorClass="text-[#E50914]"
                            />

                            {/* Play Button */}
                            <SidebarButton
                                onClick={() => navigate(`/watch/${item.id}?type=${mediaType}`)}
                                icon={Play}
                                label="Watch"
                            />

                            {/* Details Button */}
                            <SidebarButton
                                onClick={() => navigate(`/title/${item.id}?type=${mediaType}`)}
                                icon={Icon => <Info className="w-5 h-5" />}
                                label="Info"
                            />

                            {/* Share Button */}
                            <SidebarButton
                                onClick={() => handleShare(item)}
                                icon={Share2}
                                label="Share"
                            />
                        </div>
                    </div>
                );
            })}

            {/* Spinner indicator when fetching additional pages */}
            {isLoadingNextPage && (
                <div className="w-full h-24 flex items-center justify-center bg-black/60 py-6 snap-start">
                    <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
                </div>
            )}
        </div>
    );
};

export default PreviewPage;
