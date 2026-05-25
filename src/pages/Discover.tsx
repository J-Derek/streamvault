import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { 
    ChevronLeft, Sparkles, Flame, Heart, X, Search, Star, 
    Diamond, Hash, Compass, RefreshCcw, SlidersHorizontal, Plus, ShieldAlert,
    ThumbsUp, HelpCircle, Shuffle
} from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from "framer-motion";
import Navbar from "@/components/Navbar";
import MovieCard from "@/components/MovieCard";
import { useWatchlist } from "@/store/watchlist";
import { 
    discoverContent, getGenres, getTrending, searchKeywords, 
    getRecommendations, posterUrl, backdropUrl 
} from "@/lib/tmdb";
import { normalizeMedia, type StreamVaultMedia } from "@/lib/tmdb-types";
import { Skeleton } from "@/components/ui/skeleton";

// ─── TYPES & CONFIGS ─────────────────────────────────────────

type ModeId = "mood" | "swipe" | "hidden-gems" | "for-you" | "keywords" | "trending";

const MODES = [
    { id: "mood" as ModeId, label: "Mood", icon: Compass, color: "#E50914" },
    { id: "swipe" as ModeId, label: "Swipe", icon: Heart, color: "#34C759" },
    { id: "hidden-gems" as ModeId, label: "Hidden Gems", icon: Diamond, color: "#00B4D8" },
    { id: "for-you" as ModeId, label: "For You", icon: Sparkles, color: "#BF5AF2" },
    { id: "keywords" as ModeId, label: "Keywords", icon: Hash, color: "#FF9F0A" },
    { id: "trending" as ModeId, label: "Trending", icon: Flame, color: "#F5C518" },
];

const MOODS = [
    {
        name: "Dark & Gritty",
        genres: [80, 53], // Crime, Thriller
        sort: "popularity.desc",
        backdrop: "/dq186Kpg83qnJ7hkzfsnM4wPjgg.jpg", // The Dark Knight
        gradient: "from-red-950/80 via-zinc-900/40 to-[#0D0D0D]",
        glow: "border-red-600 shadow-[0_0_20px_rgba(229,9,20,0.4)]"
    },
    {
        name: "Feel Good",
        genres: [35, 10751], // Comedy, Family
        sort: "vote_average.desc",
        backdrop: "/3R3uu79g27Uv4r2cRjA545v7P6l.jpg", // La La Land
        gradient: "from-yellow-700/80 via-orange-800/40 to-[#0D0D0D]",
        glow: "border-yellow-500 shadow-[0_0_20px_rgba(245,197,24,0.4)]"
    },
    {
        name: "Mind Bending",
        genres: [9648, 878], // Mystery, Sci-Fi
        sort: "popularity.desc",
        backdrop: "/8s4h9VnIEEAQR6R075t3n2iDZ1L.jpg", // Inception
        gradient: "from-indigo-900/80 via-blue-900/40 to-[#0D0D0D]",
        glow: "border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
    },
    {
        name: "Date Night",
        genres: [10749, 35], // Romance, Comedy
        sort: "popularity.desc",
        backdrop: "/oZbyHTz5851532n4nA6TBsVEZUb.jpg", // About Time
        gradient: "from-pink-900/80 via-rose-900/40 to-[#0D0D0D]",
        glow: "border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.4)]"
    },
    {
        name: "Can't Sleep",
        genres: [27, 53], // Horror, Thriller
        sort: "popularity.desc",
        backdrop: "/5kCcBL97W48Q671gPV8U45g96rw.jpg", // The Conjuring
        gradient: "from-zinc-900/90 via-slate-950/40 to-[#0D0D0D]",
        glow: "border-zinc-700 shadow-[0_0_20px_rgba(113,113,122,0.4)]"
    },
    {
        name: "Adrenaline Rush",
        genres: [28, 12], // Action, Adventure
        sort: "popularity.desc",
        backdrop: "/9REGo4jG4mNn6wX8Du495wG3p.jpg", // Mad Max Fury Road
        gradient: "from-red-950/80 via-orange-950/40 to-[#0D0D0D]",
        glow: "border-[#E50914] shadow-[0_0_20px_rgba(229,9,20,0.5)]"
    },
    {
        name: "Laugh Out Loud",
        genres: [35], // Comedy
        sort: "popularity.desc",
        backdrop: "/39mBAzGq0R6lh17chjSp58wR1v.jpg", // The Hangover
        gradient: "from-emerald-900/80 via-teal-900/40 to-[#0D0D0D]",
        glow: "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
    },
    {
        name: "Tear Jerker",
        genres: [18], // Drama
        sort: "vote_average.desc",
        backdrop: "/5YzbUmqd5wXP7J57CrmAzoI2Jgr.jpg", // Titanic
        gradient: "from-blue-950/80 via-cyan-950/40 to-[#0D0D0D]",
        glow: "border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.4)]"
    },
    {
        name: "Epic Adventure",
        genres: [12, 14], // Adventure, Fantasy
        sort: "popularity.desc",
        backdrop: "/7LyPP26NI50rmV2zcg4fsE2e4Zp.jpg", // Lord of the Rings
        gradient: "from-amber-900/80 via-yellow-950/40 to-[#0D0D0D]",
        glow: "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.4)]"
    },
    {
        name: "Chill Vibes",
        genres: [99, 10402], // Doc, Music
        sort: "popularity.desc",
        backdrop: "/e5H4WJq744d0E10b7C0t5s8G5rX.jpg", // Chill Backdrop
        gradient: "from-teal-950/80 via-slate-900/40 to-[#0D0D0D]",
        glow: "border-teal-500 shadow-[0_0_20px_rgba(20,184,166,0.4)]"
    }
];

const CURATED_KEYWORDS = {
    Plot: [
        { id: "10084", name: "plot-twist" },
        { id: "4379", name: "time-travel" },
        { id: "207399", name: "unreliable-narrator" },
        { id: "18178", name: "non-linear-timeline" }
    ],
    Tone: [
        { id: "155477", name: "slow-burn" },
        { id: "18037", name: "dark-comedy" },
        { id: "9716", name: "surrealism" },
        { id: "18037", name: "black-comedy" }
    ],
    Setting: [
        { id: "4565", name: "dystopia" },
        { id: "2855", name: "post-apocalyptic" },
        { id: "4139", name: "cyberpunk" },
        { id: "161176", name: "space-opera" }
    ],
    Feeling: [
        { id: "268688", name: "feel-good" },
        { id: "178220", name: "tear-jerker" },
        { id: "156327", name: "edge-of-your-seat" },
        { id: "170365", name: "thought-provoking" }
    ]
};

const REGIONS = [
    { value: "global", label: "🌍 Global" },
    { value: "KE", label: "🇰🇪 Kenya" },
    { value: "US", label: "🇺🇸 United States" },
    { value: "GB", label: "🇬🇧 United Kingdom" },
    { value: "NG", label: "🇳🇬 Nigeria" },
    { value: "IN", label: "🇮🇳 India" },
    { value: "ZA", label: "🇿🇦 South Africa" },
    { value: "JP", label: "🇯🇵 Japan" },
    { value: "KR", label: "🇰🇷 South Korea" },
    { value: "FR", label: "🇫🇷 France" },
    { value: "DE", label: "🇩🇪 Germany" },
    { value: "BR", label: "🇧🇷 Brazil" },
];

const COUNTRIES = [
    { code: "US", name: "United States" },
    { code: "GB", name: "United Kingdom" },
    { code: "FR", name: "France" },
    { code: "JP", name: "Japan" },
    { code: "KR", name: "South Korea" },
    { code: "IN", name: "India" },
    { code: "NG", name: "Nigeria" },
    { code: "KE", name: "Kenya" },
    { code: "BR", name: "Brazil" },
    { code: "IT", name: "Italy" },
    { code: "DE", name: "Germany" },
];

const DiscoverPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeMode = (searchParams.get("mode") as ModeId) ?? "mood";

    const { items: watchlistItems, addItem: addToWatchlist } = useWatchlist();

    const switchMode = (mode: ModeId) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("mode", mode);
        setSearchParams(nextParams);
    };

    return (
        <div className="min-h-screen bg-[#0D0D0D] font-sans text-white selection:bg-[#E50914] selection:text-white">
            <Navbar />

            <main className="pt-24 pb-24 px-4 md:px-8 max-w-[1400px] mx-auto overflow-x-hidden">
                {/* Back button */}
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-[#AEAEB2] hover:text-white mb-6 transition-colors group cursor-pointer h-11"
                    aria-label="Go back"
                >
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-semibold text-sm">Back</span>
                </button>

                {/* Switcher pills */}
                <div className="flex gap-2 pb-4 overflow-x-auto scrollbar-hide mb-8 border-b border-[#3A3A3C]/40">
                    {MODES.map((m) => {
                        const Icon = m.icon;
                        const isActive = activeMode === m.id;
                        return (
                            <button
                                key={m.id}
                                onClick={() => switchMode(m.id)}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all shrink-0 cursor-pointer h-11 border ${
                                    isActive
                                        ? "bg-white text-black border-white shadow-lg"
                                        : "bg-[#1C1C1E] border-[#3A3A3C] text-[#AEAEB2] hover:text-white hover:border-[#636366]"
                                }`}
                            >
                                <Icon className="w-4 h-4" style={{ color: isActive ? "#0D0D0D" : m.color }} />
                                {m.label}
                            </button>
                        );
                    })}
                </div>

                {/* Animated Content Wrapper */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeMode}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="w-full"
                    >
                        {activeMode === "mood" && <MoodBoardSection addToWatchlist={addToWatchlist} />}
                        {activeMode === "swipe" && <SwipeMatchSection addToWatchlist={addToWatchlist} />}
                        {activeMode === "hidden-gems" && <HiddenGemsSection />}
                        {activeMode === "for-you" && <ForYouSection watchlistItems={watchlistItems} />}
                        {activeMode === "keywords" && <KeywordsSection />}
                        {activeMode === "trending" && <TrendingSection />}
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
};

export default DiscoverPage;

// ─── 1. MOOD BOARD SECTION ───────────────────────────────────

const MoodBoardSection = ({ addToWatchlist }: { addToWatchlist: any }) => {
    const [selectedMood, setSelectedMood] = useState<typeof MOODS[0] | null>(null);
    const [filterType, setFilterType] = useState<"movie" | "tv">("movie");
    const [results, setResults] = useState<StreamVaultMedia[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loadingMore, setLoadingMore] = useState(false);
    const observerTarget = useRef<HTMLDivElement | null>(null);

    const [backdropMap, setBackdropMap] = useState<Record<string, string>>({});
    const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});

    // Fetch dynamic backdrops on component mount
    useEffect(() => {
        const fetchBackdrops = async () => {
            const map: Record<string, string> = {};
            await Promise.all(
                MOODS.map(async (mood) => {
                    try {
                        const data = await discoverContent({
                            mediaType: "movie",
                            genres: mood.genres,
                            sortBy: mood.sort,
                            page: 1
                        });
                        const firstResult = data?.results?.[0];
                        if (firstResult && firstResult.backdrop_path) {
                            map[mood.name] = `https://image.tmdb.org/t/p/w780${firstResult.backdrop_path}`;
                        }
                    } catch (err) {
                        console.error(`Failed to fetch backdrop for mood: ${mood.name}`, err);
                    }
                })
            );
            setBackdropMap(prev => ({ ...prev, ...map }));
        };
        fetchBackdrops();
    }, []);

    const navigate = useNavigate();

    const fetchMoodResults = async (page: number, append = false) => {
        if (!selectedMood) return;
        if (page === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            const data = await discoverContent({
                mediaType: filterType,
                genres: selectedMood.genres,
                sortBy: selectedMood.sort,
                page
            });
            const normalized = data.results.map(item => normalizeMedia(item, filterType));
            setResults(prev => append ? [...prev, ...normalized] : normalized);
            setTotalPages(data.total_pages);
            setCurrentPage(page);
        } catch (err) {
            console.error("Mood fetch error", err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    // Trigger on selection/toggle change
    useEffect(() => {
        if (selectedMood) {
            fetchMoodResults(1, false);
        } else {
            setResults([]);
        }
    }, [selectedMood, filterType]);

    // IntersectionObserver sentinel
    useEffect(() => {
        const target = observerTarget.current;
        if (!target || loadingMore || currentPage >= totalPages || !selectedMood) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    fetchMoodResults(currentPage + 1, true);
                }
            },
            { rootMargin: "200px" }
        );

        observer.observe(target);
        return () => { if (target) observer.unobserve(target); };
    }, [observerTarget.current, loadingMore, currentPage, totalPages, selectedMood]);

    return (
        <div className="space-y-10">
            <div>
                <p className="text-[#636366] text-xs font-bold uppercase tracking-widest mb-2">TONIGHT'S VIBE</p>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">How do you want to feel?</h2>
                <p className="text-[#AEAEB2] mt-1 text-sm md:text-base">Tap a mood to dive into curated cinematic collections.</p>
            </div>

            {/* Grid of Mood Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {MOODS.map((m) => {
                    const isSelected = selectedMood?.name === m.name;
                    const hasBackdrop = !!backdropMap[m.name];
                    const isLoaded = !!loadedImages[m.name];
                    return (
                        <button
                            key={m.name}
                            onClick={() => setSelectedMood(isSelected ? null : m)}
                            className={`group relative flex flex-col items-center justify-end aspect-[16/10] md:aspect-[16/9] rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden text-center p-4 ${
                                isSelected 
                                    ? `border-white ${m.glow}`
                                    : "border-[#3A3A3C] hover:border-white/50"
                            }`}
                        >
                            {/* Backdrop Image with CSS Opacity Crossfade */}
                            {hasBackdrop && (
                                <img
                                    src={backdropMap[m.name]}
                                    alt={m.name}
                                    onLoad={() => setLoadedImages(prev => ({ ...prev, [m.name]: true }))}
                                    onError={() => setLoadedImages(prev => ({ ...prev, [m.name]: false }))}
                                    className={`absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-all duration-500 z-0 ${
                                        isLoaded ? "opacity-60" : "opacity-0"
                                    }`}
                                    loading="lazy"
                                />
                            )}
                            {/* Gradient Overlay */}
                            <div className={`absolute inset-0 bg-gradient-to-t ${m.gradient} z-0`} />

                            <div className="relative z-10">
                                <h3 className="text-sm md:text-base font-black text-white tracking-tight drop-shadow-md">
                                    {m.name}
                                </h3>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Selected Mood Results */}
            {selectedMood && (
                <div className="space-y-6 pt-6 border-t border-[#3A3A3C]/30 animate-fade-in">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight">
                                Curating for <span className="text-[#E50914]">{selectedMood.name}</span>
                            </h3>
                            <p className="text-[#AEAEB2] text-xs font-semibold">Matched with genres: {selectedMood.genres.join(", ")}</p>
                        </div>

                        {/* Movie / TV Toggle */}
                        <div className="flex bg-[#1C1C1E] border border-[#3A3A3C] rounded-lg p-0.5 self-start md:self-auto h-11">
                            <button
                                onClick={() => setFilterType("movie")}
                                className={`px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                                    filterType === "movie" ? "bg-white text-black font-extrabold" : "text-[#AEAEB2] hover:text-white"
                                }`}
                            >
                                Movies
                            </button>
                            <button
                                onClick={() => setFilterType("tv")}
                                className={`px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                                    filterType === "tv" ? "bg-white text-black font-extrabold" : "text-[#AEAEB2] hover:text-white"
                                }`}
                            >
                                TV Shows
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {[...Array(12)].map((_, i) => (
                                <div key={i} className="flex flex-col gap-2">
                                    <Skeleton className="aspect-[2/3] w-full rounded-lg bg-[#1C1C1E]" />
                                    <Skeleton className="h-4 w-3/4 bg-[#1C1C1E]" />
                                    <Skeleton className="h-3 w-1/2 bg-[#1C1C1E]" />
                                </div>
                            ))}
                        </div>
                    ) : results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in max-w-sm mx-auto">
                            <div className="w-16 h-16 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-5 border border-[#3A3A3C]/40 shadow-md">
                                <Compass className="w-8 h-8 text-[#636366]" />
                            </div>
                            <h4 className="text-white font-bold mb-1">No matches found</h4>
                            <p className="text-[#AEAEB2] text-xs max-w-xs mb-6 leading-relaxed">
                                We couldn't find any title matching this mood currently. Try toggling between Movies and TV Shows, or explore our full catalogue.
                            </p>
                            <button 
                                onClick={() => navigate("/browse")}
                                className="bg-[#E50914] hover:bg-[#B00610] text-white text-xs font-semibold h-9 px-6 rounded-md transition-all shadow-[0_4px_14px_rgba(229,9,20,0.4)] hover:shadow-[0_6px_20px_rgba(229,9,20,0.6)] cursor-pointer"
                            >
                                Browse Titles
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {results.map((media) => (
                                <MovieCard key={media.id} media={media} />
                            ))}
                        </div>
                    )}

                    {/* Infinite Scroll Sentinel */}
                    {results.length > 0 && currentPage < totalPages && (
                        <div ref={observerTarget} className="flex justify-center mt-10 h-10">
                            {loadingMore && (
                                <span className="inline-block w-8 h-8 rounded-full border-4 border-[#E50914] border-t-transparent animate-spin" />
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── 2. SWIPE MATCH SECTION ──────────────────────────────────

const SwipeMatchSection = ({ addToWatchlist }: { addToWatchlist: any }) => {
    const [deck, setDeck] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [likedMatches, setLikedMatches] = useState<any[]>([]);
    const [isFinished, setIsFinished] = useState(false);
    const [deckLoading, setDeckLoading] = useState(true);
    const [filterType, setFilterType] = useState<"movie" | "tv">("movie");
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    const [genreOptions, setGenreOptions] = useState<any[]>([]);
    const [starBurst, setStarBurst] = useState(false);

    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-15, 15]);
    const scale = useTransform(y, [-200, 0], [1.05, 1]);
    const likeOpacity = useTransform(x, [0, 100], [0, 1]);
    const nopeOpacity = useTransform(x, [0, -100], [0, 1]);
    const starOpacity = useTransform(y, [0, -100], [0, 1]);
    const controls = useAnimation();

    // Fetch genres for filter
    useEffect(() => {
        getGenres(filterType).then((data) => {
            setGenreOptions(data.genres.slice(0, 8));
        }).catch(() => {});
    }, [filterType]);

    // Build/Fetch deck
    const fetchSwipeDeck = async (append = false) => {
        if (!append) setDeckLoading(true);
        try {
            const data = await discoverContent({
                mediaType: filterType,
                genres: selectedGenres.length > 0 ? selectedGenres : undefined,
                minRating: 6.5,
                sortBy: "popularity.desc",
                page: Math.floor(Math.random() * 5) + 1 // random page for diversity
            });
            
            // Shuffle
            const shuffled = (data.results || []).sort(() => 0.5 - Math.random());
            setDeck(prev => append ? [...prev, ...shuffled] : shuffled);
            if (!append) {
                setCurrentIndex(0);
                setIsFinished(false);
            }
        } catch {
            setDeck([]);
        } finally {
            setDeckLoading(false);
        }
    };

    useEffect(() => {
        fetchSwipeDeck(false);
    }, [filterType, selectedGenres]);

    // Pre-fetch deck when running low (3 remaining)
    useEffect(() => {
        if (deck.length > 0 && currentIndex >= deck.length - 3 && currentIndex < deck.length) {
            fetchSwipeDeck(true);
        }
    }, [currentIndex, deck.length]);

    const handleSwipe = async (direction: "left" | "right" | "up") => {
        const currentItem = deck[currentIndex];
        if (!currentItem) return;

        // Animate off screen
        let animateX = 0;
        let animateY = 0;
        if (direction === "right") animateX = 400;
        if (direction === "left") animateX = -400;
        if (direction === "up") animateY = -400;

        await controls.start({
            x: animateX,
            y: animateY,
            opacity: 0,
            transition: { duration: 0.25 }
        });

        // Add to states
        if (direction === "right") {
            setLikedMatches(prev => {
                if (prev.some(m => m.id === currentItem.id)) return prev;
                return [...prev, currentItem];
            });
        } else if (direction === "up") {
            // Star burst and direct watchlist add
            setStarBurst(true);
            setTimeout(() => setStarBurst(false), 1200);

            const normalized = normalizeMedia(currentItem, filterType);
            addToWatchlist({
                id: normalized.id,
                mediaType: filterType,
                title: normalized.title,
                posterPath: normalized.posterPath,
                rating: normalized.rating,
                year: normalized.year,
                genres: normalized.genres,
                contentStatus: normalized.status
            });

            setLikedMatches(prev => {
                if (prev.some(m => m.id === currentItem.id)) return prev;
                return [...prev, currentItem];
            });
        }

        // Reset positions
        x.set(0);
        y.set(0);
        controls.set({ x: 0, y: 0, opacity: 1 });

        if (currentIndex + 1 >= deck.length) {
            setIsFinished(true);
        } else {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const handleDragEnd = (_: unknown, info: any) => {
        const threshold = 100;
        if (info.offset.x > threshold) {
            handleSwipe("right");
        } else if (info.offset.x < -threshold) {
            handleSwipe("left");
        } else if (info.offset.y < -threshold) {
            handleSwipe("up");
        } else {
            controls.start({ x: 0, y: 0, transition: { type: "spring", stiffness: 300, damping: 20 } });
        }
    };

    const toggleGenre = (genreId: number) => {
        setSelectedGenres(prev => 
            prev.includes(genreId) ? prev.filter(id => id !== genreId) : [...prev, genreId]
        );
    };

    const currentCard = deck[currentIndex];

    return (
        <div className="flex flex-col items-center max-w-[800px] mx-auto space-y-8 relative">
            
            {/* Header info */}
            <div className="text-center w-full">
                <p className="text-[#636366] text-xs font-bold uppercase tracking-widest mb-2">CINEMATIC SWIPE</p>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">Swipe Match</h2>
                <p className="text-[#AEAEB2] mt-1 text-sm">Swipe right to Match, left to Skip, or up to save to Watchlist!</p>
            </div>

            {/* Filter Bar */}
            <div className="w-full bg-[#1C1C1E] border border-[#3A3A3C] rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 justify-between">
                {/* Movie/TV toggle */}
                <div className="flex bg-black/40 border border-[#3A3A3C] rounded-lg p-0.5 h-11 shrink-0">
                    <button
                        onClick={() => { setFilterType("movie"); setSelectedGenres([]); }}
                        className={`px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                            filterType === "movie" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                        }`}
                    >
                        Movies
                    </button>
                    <button
                        onClick={() => { setFilterType("tv"); setSelectedGenres([]); }}
                        className={`px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                            filterType === "tv" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                        }`}
                    >
                        TV Shows
                    </button>
                </div>

                {/* Genre pills */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide w-full md:w-auto py-1">
                    {genreOptions.map((g) => {
                        const active = selectedGenres.includes(g.id);
                        return (
                            <button
                                key={g.id}
                                onClick={() => toggleGenre(g.id)}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border shrink-0 cursor-pointer ${
                                    active 
                                        ? "bg-[#E50914] border-[#E50914] text-white"
                                        : "bg-black/20 border-[#3A3A3C] text-[#AEAEB2] hover:text-white"
                                }`}
                            >
                                {g.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Swipe Deck View */}
            <div className="relative w-full max-w-[360px] aspect-[2/3] perspective-1000 flex items-center justify-center">
                {deckLoading ? (
                    <Skeleton className="w-full h-full rounded-3xl bg-[#1C1C1E] border border-[#3A3A3C]" />
                ) : isFinished || !currentCard ? (
                    <div className="flex flex-col items-center justify-center text-center p-8 bg-[#1C1C1E] border border-[#3A3A3C] rounded-3xl w-full h-full space-y-6">
                        <span className="text-5xl">🃏</span>
                        <div>
                            <h3 className="text-xl font-bold text-white mb-2">Deck Empty</h3>
                            <p className="text-sm text-[#AEAEB2] max-w-xs">
                                You have run through all recommendations. Shuffle another batch to keep matching!
                            </p>
                        </div>
                        <button
                            onClick={() => fetchSwipeDeck(false)}
                            className="flex items-center gap-2 px-6 py-3 bg-[#E50914] hover:bg-[#B00610] text-white font-bold rounded-xl transition-all cursor-pointer h-11 shadow-lg"
                        >
                            <Shuffle className="w-4 h-4" /> Shuffle Again
                        </button>
                    </div>
                ) : (
                    <div className="relative w-full h-full">
                        {/* Top drag card */}
                        <motion.div
                            drag
                            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                            dragElastic={0.8}
                            onDragEnd={handleDragEnd}
                            animate={controls}
                            style={{ x, y, rotate, scale }}
                            className="absolute inset-0 bg-[#1C1C1E] rounded-3xl shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing border border-[#3A3A3C] z-10 select-none"
                        >
                            <img
                                src={posterUrl(currentCard.poster_path, "w500")}
                                alt={currentCard.title ?? currentCard.name}
                                className="w-full h-full object-cover pointer-events-none"
                            />
                            {/* Gradient to darken text area */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent pointer-events-none" />

                            {/* Swipe Badges */}
                            {/* LIKE (Right) */}
                            <motion.div
                                style={{ opacity: likeOpacity }}
                                className="absolute top-8 left-8 border-4 border-[#34C759] rounded-xl px-4 py-2 transform -rotate-12 pointer-events-none"
                            >
                                <span className="text-2xl font-black text-[#34C759] tracking-widest">LIKE</span>
                            </motion.div>
                            {/* NOPE (Left) */}
                            <motion.div
                                style={{ opacity: nopeOpacity }}
                                className="absolute top-8 right-8 border-4 border-[#E50914] rounded-xl px-4 py-2 transform rotate-12 pointer-events-none"
                            >
                                <span className="text-2xl font-black text-[#E50914] tracking-widest">NOPE</span>
                            </motion.div>
                            {/* WANT (Watchlist) */}
                            <motion.div
                                style={{ opacity: starOpacity }}
                                className="absolute bottom-32 left-1/2 -translate-x-1/2 border-4 border-[#F5C518] rounded-xl px-5 py-2 pointer-events-none text-center bg-black/60 backdrop-blur-sm shadow-xl"
                            >
                                <span className="text-xl font-black text-[#F5C518] tracking-widest flex items-center gap-2">
                                    ★ WATCHLIST
                                </span>
                            </motion.div>

                            {/* Movie Details */}
                            <div className="absolute bottom-0 left-0 right-0 p-6 pointer-events-none space-y-2">
                                <h3 className="text-2xl font-black text-white leading-tight drop-shadow-md">
                                    {currentCard.title ?? currentCard.name}
                                </h3>
                                <div className="flex items-center gap-3 text-sm font-bold text-white/80">
                                    <span className="text-[#F5C518] drop-shadow-md">★ {currentCard.vote_average?.toFixed(1)}</span>
                                    <span className="w-1 h-1 rounded-full bg-white/40" />
                                    <span className="drop-shadow-md">
                                        {(currentCard.release_date ?? currentCard.first_air_date)?.slice(0, 4)}
                                    </span>
                                </div>
                            </div>
                        </motion.div>

                        {/* Back Card placeholder to show stack depth */}
                        {currentIndex + 1 < deck.length && (
                            <div className="absolute inset-0 bg-[#1C1C1E] border border-[#3A3A3C] rounded-3xl opacity-40 blur-[1px] transform scale-[0.96] translate-y-3 z-0 flex overflow-hidden">
                                <img
                                    src={posterUrl(deck[currentIndex + 1].poster_path, "w342")}
                                    alt="next"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Quick Action buttons */}
            {!deckLoading && !isFinished && currentCard && (
                <div className="flex items-center justify-center gap-6">
                    <button
                        onClick={() => handleSwipe("left")}
                        className="w-14 h-14 rounded-full bg-[#1C1C1E] border border-[#3A3A3C] flex items-center justify-center text-[#E50914] hover:bg-[#E50914]/10 hover:border-[#E50914] transition-all hover:scale-110 active:scale-95 shadow-lg cursor-pointer"
                        aria-label="Dislike / Swipe Left"
                    >
                        <X className="w-6 h-6 stroke-[3]" />
                    </button>
                    <button
                        onClick={() => handleSwipe("up")}
                        className="w-14 h-14 rounded-full bg-[#1C1C1E] border border-[#3A3A3C] flex items-center justify-center text-[#F5C518] hover:bg-[#F5C518]/10 hover:border-[#F5C518] transition-all hover:scale-110 active:scale-95 shadow-lg cursor-pointer"
                        aria-label="Add to Watchlist / Swipe Up"
                    >
                        <Star className="w-6 h-6 stroke-[2.5] fill-current" />
                    </button>
                    <button
                        onClick={() => handleSwipe("right")}
                        className="w-14 h-14 rounded-full bg-[#1C1C1E] border border-[#3A3A3C] flex items-center justify-center text-[#34C759] hover:bg-[#34C759]/10 hover:border-[#34C759] transition-all hover:scale-110 active:scale-95 shadow-lg cursor-pointer"
                        aria-label="Like / Swipe Right"
                    >
                        <Heart className="w-6 h-6 stroke-[3] fill-current" />
                    </button>
                </div>
            )}

            {/* Star Burst Overlay */}
            <AnimatePresence>
                {starBurst && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.3 }}
                        animate={{ opacity: 1, scale: [1, 1.3, 1] }}
                        exit={{ opacity: 0 }}
                        className="absolute z-50 pointer-events-none flex flex-col items-center justify-center bg-black/60 backdrop-blur-md rounded-2xl p-6"
                    >
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, ease: "linear" }}
                            className="text-[#F5C518]"
                        >
                            <Star className="w-16 h-16 fill-current" />
                        </motion.div>
                        <p className="text-white font-black tracking-widest mt-2 uppercase text-sm">Added to Watchlist</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Session Matches Shelf */}
            {likedMatches.length > 0 && (
                <div className="w-full bg-[#1C1C1E]/50 border border-[#3A3A3C]/30 rounded-2xl p-6 space-y-4">
                    <h4 className="text-sm font-black tracking-widest text-[#AEAEB2] uppercase">YOUR MATCHES THIS SESSION</h4>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                        {likedMatches.map((m) => (
                            <button
                                key={m.id}
                                onClick={() => navigate(`/title/${m.id}?type=${filterType}`)}
                                className="w-16 md:w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden border border-[#3A3A3C] hover:border-white transition-all cursor-pointer relative group"
                            >
                                <img
                                    src={posterUrl(m.poster_path, "w185")}
                                    alt={m.title ?? m.name}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-black uppercase text-center p-1">
                                    Play
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── 3. HIDDEN GEMS SECTION ───────────────────────────────────

const HiddenGemsSection = () => {
    const [mediaType, setMediaType] = useState<"movie" | "tv">("movie");
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    const [minRating, setMinRating] = useState(7.2);
    const [yearFrom, setYearFrom] = useState(1970);
    const [yearTo, setYearTo] = useState(new Date().getFullYear());
    const [selectedCountry, setSelectedCountry] = useState("all");
    const [sortBy, setSortBy] = useState("vote_average.desc");

    const [results, setResults] = useState<StreamVaultMedia[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const observerTarget = useRef<HTMLDivElement | null>(null);

    const [genresList, setGenresList] = useState<any[]>([]);

    // Fetch genres
    useEffect(() => {
        getGenres(mediaType).then((data) => {
            setGenresList(data.genres.slice(0, 10));
        }).catch(() => {});
    }, [mediaType]);

    // Hidden Gems criteria: vote count between 50 and 800 (underrated / low views), rating high (7.2+)
    const fetchGems = async (page: number, append = false) => {
        if (page === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            const query: any = {
                mediaType,
                genres: selectedGenres.length > 0 ? selectedGenres : undefined,
                minRating,
                yearFrom,
                yearTo,
                voteCountGte: 50,
                voteCountLte: 800,
                sortBy,
                page
            };

            const data = await discoverContent(query);
            const normalized = data.results.map(item => normalizeMedia(item, mediaType));
            setResults(prev => append ? [...prev, ...normalized] : normalized);
            setTotalPages(data.total_pages);
            setCurrentPage(page);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchGems(1, false);
    }, [mediaType, selectedGenres, minRating, yearFrom, yearTo, selectedCountry, sortBy]);

    useEffect(() => {
        const target = observerTarget.current;
        if (!target || loadingMore || currentPage >= totalPages) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    fetchGems(currentPage + 1, true);
                }
            },
            { rootMargin: "200px" }
        );

        observer.observe(target);
        return () => { if (target) observer.unobserve(target); };
    }, [observerTarget.current, loadingMore, currentPage, totalPages]);

    const toggleGenre = (genreId: number) => {
        setSelectedGenres(prev => 
            prev.includes(genreId) ? prev.filter(id => id !== genreId) : [...prev, genreId]
        );
    };

    return (
        <div className="space-y-8">
            {/* Header Title */}
            <div>
                <p className="text-[#636366] text-xs font-bold uppercase tracking-widest mb-2">HIGHLY RATED • LOW VIEWS</p>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">Hidden Gems</h2>
                <p className="text-[#AEAEB2] mt-1 text-sm">Underrated masterpieces that skipped past general pop culture.</p>
            </div>

            {/* Extensive Filter Sidebar / Header Block */}
            <div className="bg-[#1C1C1E] border border-[#3A3A3C] rounded-2xl p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Media Type & Sort */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-[#AEAEB2] uppercase tracking-wider block">Media Type</label>
                        <div className="flex bg-black/40 border border-[#3A3A3C] rounded-lg p-0.5 h-11 w-full">
                            <button
                                onClick={() => { setMediaType("movie"); setSelectedGenres([]); }}
                                className={`flex-1 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                                    mediaType === "movie" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                                }`}
                            >
                                Movies
                            </button>
                            <button
                                onClick={() => { setMediaType("tv"); setSelectedGenres([]); }}
                                className={`flex-1 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                                    mediaType === "tv" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                                }`}
                            >
                                TV Shows
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-black text-[#AEAEB2] uppercase tracking-wider block">Sort By</label>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="w-full h-11 bg-black/40 text-white border border-[#3A3A3C] rounded-lg px-3 focus:outline-none focus:border-[#E50914] text-sm cursor-pointer"
                        >
                            <option value="vote_average.desc" className="bg-[#1C1C1E]">Top Rated</option>
                            <option value="primary_release_date.desc" className="bg-[#1C1C1E]">Newest</option>
                            <option value="primary_release_date.asc" className="bg-[#1C1C1E]">Oldest</option>
                            <option value="popularity.asc" className="bg-[#1C1C1E]">Most Surprising</option>
                        </select>
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-black text-[#AEAEB2] uppercase tracking-wider block">Country of Origin</label>
                        <select
                            value={selectedCountry}
                            onChange={(e) => setSelectedCountry(e.target.value)}
                            className="w-full h-11 bg-black/40 text-white border border-[#3A3A3C] rounded-lg px-3 focus:outline-none focus:border-[#E50914] text-sm cursor-pointer"
                        >
                            <option value="all" className="bg-[#1C1C1E]">All Regions</option>
                            {COUNTRIES.map(c => (
                                <option key={c.code} value={c.code} className="bg-[#1C1C1E]">{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#3A3A3C]/30">
                    {/* sliders */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs font-black text-[#AEAEB2] uppercase tracking-wider">
                            <span>Minimum Rating</span>
                            <span className="text-[#F5C518] text-sm font-black">★ {minRating.toFixed(1)}</span>
                        </div>
                        <input
                            type="range"
                            min="6.0"
                            max="9.0"
                            step="0.1"
                            value={minRating}
                            onChange={(e) => setMinRating(parseFloat(e.target.value))}
                            className="w-full h-1 bg-[#2C2C2E] rounded-lg appearance-none cursor-pointer accent-[#E50914]"
                        />
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs font-black text-[#AEAEB2] uppercase tracking-wider">
                            <span>Release Year Range</span>
                            <span className="text-white text-sm font-black">{yearFrom} – {yearTo}</span>
                        </div>
                        <div className="flex gap-3">
                            <input
                                type="number"
                                min="1970"
                                max={new Date().getFullYear()}
                                value={yearFrom}
                                onChange={(e) => setYearFrom(parseInt(e.target.value) || 1970)}
                                className="w-1/2 h-11 bg-black/40 text-white border border-[#3A3A3C] rounded-lg px-3 focus:outline-none focus:border-[#E50914] text-center text-sm"
                            />
                            <input
                                type="number"
                                min="1970"
                                max={new Date().getFullYear()}
                                value={yearTo}
                                onChange={(e) => setYearTo(parseInt(e.target.value) || new Date().getFullYear())}
                                className="w-1/2 h-11 bg-black/40 text-white border border-[#3A3A3C] rounded-lg px-3 focus:outline-none focus:border-[#E50914] text-center text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* Genre pills */}
                <div className="space-y-3 pt-4 border-t border-[#3A3A3C]/30">
                    <label className="text-xs font-black text-[#AEAEB2] uppercase tracking-wider block">Filter by Genre</label>
                    <div className="flex flex-wrap gap-2">
                        {genresList.map((g) => {
                            const isSelected = selectedGenres.includes(g.id);
                            return (
                                <button
                                    key={g.id}
                                    onClick={() => toggleGenre(g.id)}
                                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all border cursor-pointer h-9 ${
                                        isSelected
                                            ? "bg-[#00B4D8] border-[#00B4D8] text-white"
                                            : "bg-black/20 border-[#3A3A3C] text-[#AEAEB2] hover:text-white"
                                    }`}
                                >
                                    {g.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Results Grid */}
            <div className="space-y-6">
                {loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {[...Array(12)].map((_, i) => (
                            <div key={i} className="flex flex-col gap-2">
                                <Skeleton className="aspect-[2/3] w-full rounded-lg bg-[#1C1C1E]" />
                                <Skeleton className="h-4 w-3/4 bg-[#1C1C1E]" />
                                <Skeleton className="h-3 w-1/2 bg-[#1C1C1E]" />
                            </div>
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <div className="text-center py-24 bg-[#1C1C1E]/30 rounded-2xl border border-[#3A3A3C]/20 text-[#AEAEB2]">
                        No hidden gems match this specific filter recipe. Try broadening the rating or genre query.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {results.map((media) => (
                            <div key={media.id} className="relative group">
                                <MovieCard media={media} subtitle="Hidden Gem" />
                                
                                {/* Absolute Gem Label Overlays */}
                                <div className="absolute top-2 left-2 flex items-center gap-1 bg-[#00B4D8] text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full pointer-events-none shadow-md">
                                    <Diamond className="w-2.5 h-2.5 fill-current shrink-0" /> Gem
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Infinite Scroll sentinel */}
                {results.length > 0 && currentPage < totalPages && (
                    <div ref={observerTarget} className="flex justify-center mt-10 h-10">
                        {loadingMore && (
                            <span className="inline-block w-8 h-8 rounded-full border-4 border-[#E50914] border-t-transparent animate-spin" />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── 4. FOR YOU SECTION ───────────────────────────────────────

const ForYouSection = ({ watchlistItems }: { watchlistItems: any[] }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedSeeds, setSelectedSeeds] = useState<any[]>([]);

    const [results, setResults] = useState<StreamVaultMedia[]>([]);
    const [recsLoading, setRecsLoading] = useState(false);
    const debounceTimeout = useRef<any>(null);

    // Initial pre-population from Watchlist
    useEffect(() => {
        if (watchlistItems && watchlistItems.length > 0 && selectedSeeds.length === 0) {
            // Take up to 3 items
            const initialSeeds = watchlistItems.slice(0, 3).map(w => ({
                id: w.id,
                title: w.title,
                poster_path: w.posterPath,
                media_type: w.mediaType
            }));
            setSelectedSeeds(initialSeeds);
        }
    }, [watchlistItems]);

    // Live search for seeds
    const handleSearchInput = (val: string) => {
        setSearchQuery(val);
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

        if (val.trim().length < 2) {
            setSearchResults([]);
            return;
        }

        setSearchLoading(true);
        debounceTimeout.current = setTimeout(async () => {
            try {
                // Unified search from searchMovies
                const data = await searchMovies(val);
                setSearchResults((data.results || []).slice(0, 5));
            } catch {
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 300);
    };

    const addSeed = (movie: any) => {
        if (selectedSeeds.some(s => s.id === movie.id)) return;
        if (selectedSeeds.length >= 3) {
            // Replace first
            setSelectedSeeds(prev => [...prev.slice(1), { ...movie, media_type: "movie" }]);
        } else {
            setSelectedSeeds(prev => [...prev, { ...movie, media_type: "movie" }]);
        }
        setSearchQuery("");
        setSearchResults([]);
    };

    const removeSeed = (id: number) => {
        setSelectedSeeds(prev => prev.filter(s => s.id !== id));
    };

    // Blended recommendations compiler
    const compileBlendedRecommendations = async () => {
        if (selectedSeeds.length === 0) {
            setResults([]);
            return;
        }

        setRecsLoading(true);
        try {
            const requests = selectedSeeds.map(s => 
                getRecommendations(s.media_type || "movie", s.id)
            );
            const responses = await Promise.all(requests);

            // Interleave & deduplicate
            const pools = responses.map((res, i) => 
                (res.results || []).map(item => ({
                    ...item,
                    seedType: selectedSeeds[i].media_type || "movie"
                }))
            );

            const blended: any[] = [];
            let hasItems = true;
            let index = 0;

            while (hasItems) {
                hasItems = false;
                for (const pool of pools) {
                    if (pool[index]) {
                        blended.push(pool[index]);
                        hasItems = true;
                    }
                }
                index++;
            }

            // Deduplicate
            const unique = Array.from(new Map(blended.map(item => [item.id, item])).values());
            const normalized = unique.map(item => normalizeMedia(item, item.seedType));
            setResults(normalized);
        } catch (err) {
            console.error("Blended Recs failed", err);
        } finally {
            setRecsLoading(false);
        }
    };

    useEffect(() => {
        compileBlendedRecommendations();
    }, [selectedSeeds]);

    return (
        <div className="space-y-8">
            {/* Header info */}
            <div>
                <p className="text-[#636366] text-xs font-bold uppercase tracking-widest mb-2">CUSTOM ALGORITHMIC FEED</p>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">For You</h2>
                <p className="text-[#AEAEB2] mt-1 text-sm">Blended suggestions compiled based on your favorite seed titles.</p>
            </div>

            {/* Seed selector block */}
            <div className="bg-[#1C1C1E] border border-[#3A3A3C] rounded-2xl p-6 space-y-6">
                <div className="relative">
                    <label className="text-xs font-black text-[#AEAEB2] uppercase tracking-wider block mb-3">
                        Select 2 to 3 Titles You Love
                    </label>
                    <div className="relative h-12">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#636366]" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            placeholder="Search title, e.g. Interstellar, Breaking Bad..."
                            className="w-full h-full bg-black/40 border border-[#3A3A3C] rounded-xl pl-11 pr-11 outline-none text-white focus:border-[#E50914] text-sm"
                        />
                        {searchLoading && (
                            <span className="absolute right-4 top-4 w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                        )}
                    </div>

                    {/* Suggestions list dropdown */}
                    {searchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-[#1C1C1E] border border-[#3A3A3C] rounded-xl overflow-hidden z-20 shadow-2xl">
                            {searchResults.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => addSeed(item)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-[#3A3A3C]/20 last:border-0 cursor-pointer"
                                >
                                    <img
                                        src={posterUrl(item.poster_path, "w92")}
                                        alt={item.title}
                                        className="w-8 aspect-[2/3] object-cover rounded bg-[#2C2C2E]"
                                    />
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-white leading-tight">{item.title}</p>
                                        <p className="text-xs text-[#AEAEB2]">{item.release_date?.slice(0, 4)}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected Seed Chips */}
                {selectedSeeds.length > 0 && (
                    <div className="flex flex-wrap gap-2.5 pt-2">
                        {selectedSeeds.map((seed) => (
                            <div
                                key={seed.id}
                                className="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-black/40 border border-[#3A3A3C] rounded-xl"
                            >
                                <img
                                    src={posterUrl(seed.poster_path, "w92")}
                                    alt={seed.title}
                                    className="w-6 aspect-[2/3] object-cover rounded bg-[#2C2C2E]"
                                />
                                <span className="text-xs font-black text-white">{seed.title}</span>
                                <button
                                    onClick={() => removeSeed(seed.id)}
                                    className="text-[#636366] hover:text-white transition-colors cursor-pointer"
                                    aria-label={`Remove ${seed.title}`}
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Results Grid Feed */}
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#BF5AF2]" /> Recommendations Blend
                    </h3>
                    {selectedSeeds.length > 0 && (
                        <button
                            onClick={compileBlendedRecommendations}
                            className="flex items-center gap-2 text-xs font-black text-[#AEAEB2] hover:text-white transition-colors cursor-pointer h-11"
                        >
                            <RefreshCcw className="w-3.5 h-3.5" /> Refresh Picks
                        </button>
                    )}
                </div>

                {recsLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {[...Array(12)].map((_, i) => (
                            <div key={i} className="flex flex-col gap-2">
                                <Skeleton className="aspect-[2/3] w-full rounded-lg bg-[#1C1C1E]" />
                                <Skeleton className="h-4 w-3/4 bg-[#1C1C1E]" />
                                <Skeleton className="h-3 w-1/2 bg-[#1C1C1E]" />
                            </div>
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <div className="text-center py-20 bg-[#1C1C1E]/30 rounded-2xl border border-[#3A3A3C]/20 text-[#AEAEB2]">
                        {selectedSeeds.length === 0 
                            ? "Select some seeds above to populate your custom feed."
                            : "No recommendations found. Try different seeds."
                        }
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {results.map((media) => (
                            <MovieCard key={media.id} media={media} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── 5. KEYWORDS SECTION ─────────────────────────────────────

const KeywordsSection = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [keywordSuggestions, setKeywordSuggestions] = useState<any[]>([]);
    const [activeKeywords, setActiveKeywords] = useState<any[]>([]);
    const [filterType, setFilterType] = useState<"movie" | "tv">("movie");

    const [results, setResults] = useState<StreamVaultMedia[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const observerTarget = useRef<HTMLDivElement | null>(null);
    const debounceTimeout = useRef<any>(null);

    // Live TMDB keyword suggestions
    const handleSearchInput = (val: string) => {
        setSearchQuery(val);
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

        if (val.trim().length < 2) {
            setKeywordSuggestions([]);
            return;
        }

        debounceTimeout.current = setTimeout(async () => {
            try {
                const res = await searchKeywords(val);
                setKeywordSuggestions((res.results || []).slice(0, 6));
            } catch {
                setKeywordSuggestions([]);
            }
        }, 300);
    };

    const addKeyword = (kw: any) => {
        if (activeKeywords.some(k => k.id === kw.id)) return;
        if (activeKeywords.length >= 3) {
            setActiveKeywords(prev => [...prev.slice(1), kw]);
        } else {
            setActiveKeywords(prev => [...prev, kw]);
        }
        setSearchQuery("");
        setKeywordSuggestions([]);
    };

    const removeKeyword = (id: number) => {
        setActiveKeywords(prev => prev.filter(k => k.id !== id));
    };

    // Discover content with active keywords
    const fetchKeywordResults = async (page: number, append = false) => {
        if (activeKeywords.length === 0) {
            setResults([]);
            return;
        }

        if (page === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            const kwIds = activeKeywords.map(k => k.id).join(",");
            const data = await discoverContent({
                mediaType: filterType,
                withKeywords: kwIds,
                sortBy: "popularity.desc",
                page
            });
            const normalized = data.results.map(item => normalizeMedia(item, filterType));
            setResults(prev => append ? [...prev, ...normalized] : normalized);
            setTotalPages(data.total_pages);
            setCurrentPage(page);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchKeywordResults(1, false);
    }, [activeKeywords, filterType]);

    // Infinite scroll observer
    useEffect(() => {
        const target = observerTarget.current;
        if (!target || loadingMore || currentPage >= totalPages || activeKeywords.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    fetchKeywordResults(currentPage + 1, true);
                }
            },
            { rootMargin: "200px" }
        );

        observer.observe(target);
        return () => { if (target) observer.unobserve(target); };
    }, [observerTarget.current, loadingMore, currentPage, totalPages, activeKeywords]);

    return (
        <div className="space-y-8">
            {/* Header info */}
            <div>
                <p className="text-[#636366] text-xs font-bold uppercase tracking-widest mb-2">TROPES • MICRO-GENRES</p>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">Keyword Explorer</h2>
                <p className="text-[#AEAEB2] mt-1 text-sm">Discover content tagged with ultra-specific plot points, settings, or tones.</p>
            </div>

            {/* Keyword Search Selector Block */}
            <div className="bg-[#1C1C1E] border border-[#3A3A3C] rounded-2xl p-6 md:p-8 space-y-6">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    {/* Search Field */}
                    <div className="relative w-full md:flex-1 h-12">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#636366]" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            placeholder="Type tropes like 'space-opera', 'time-travel', 'assassin'..."
                            className="w-full h-full bg-black/40 border border-[#3A3A3C] rounded-xl pl-11 pr-11 outline-none text-white focus:border-[#E50914] text-sm"
                        />
                        {/* Keyword suggestions dropdown */}
                        {keywordSuggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-[#1C1C1E] border border-[#3A3A3C] rounded-xl overflow-hidden z-20 shadow-2xl">
                                {keywordSuggestions.map((kw) => (
                                    <button
                                        key={kw.id}
                                        onClick={() => addKeyword(kw)}
                                        className="w-full text-left px-4 py-2.5 text-sm text-[#AEAEB2] hover:text-white hover:bg-white/5 border-b border-[#3A3A3C]/20 last:border-0 cursor-pointer h-10"
                                    >
                                        {kw.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Media Type Toggle */}
                    <div className="flex bg-black/40 border border-[#3A3A3C] rounded-lg p-0.5 h-11 shrink-0 w-full md:w-auto">
                        <button
                            onClick={() => setFilterType("movie")}
                            className={`flex-1 md:flex-none px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                                filterType === "movie" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                            }`}
                        >
                            Movies
                        </button>
                        <button
                            onClick={() => setFilterType("tv")}
                            className={`flex-1 md:flex-none px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                                filterType === "tv" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                            }`}
                        >
                            TV Shows
                        </button>
                    </div>
                </div>

                {/* Selected Keyword Chips */}
                {activeKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[#3A3A3C]/20">
                        {activeKeywords.map((k) => (
                            <div
                                key={k.id}
                                className="flex items-center gap-2 px-3 py-1.5 bg-[#FF9F0A]/20 border border-[#FF9F0A]/40 text-[#FF9F0A] rounded-full text-xs font-bold"
                            >
                                <Hash className="w-3.5 h-3.5" />
                                <span>{k.name}</span>
                                <button
                                    onClick={() => removeKeyword(k.id)}
                                    className="hover:text-white transition-colors cursor-pointer"
                                    aria-label={`Remove keyword ${k.name}`}
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Curated Categories block */}
                <div className="space-y-4 pt-4 border-t border-[#3A3A3C]/20">
                    <label className="text-xs font-black text-[#AEAEB2] uppercase tracking-wider block">
                        Popular Curated Themes
                    </label>
                    <div className="space-y-3">
                        {Object.entries(CURATED_KEYWORDS).map(([category, items]) => (
                            <div key={category} className="flex flex-col md:flex-row md:items-center gap-2">
                                <span className="text-xs font-bold text-[#636366] uppercase tracking-wider min-w-[70px]">
                                    {category}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {items.map((it) => {
                                        const isSelected = activeKeywords.some(k => k.id === it.id);
                                        return (
                                            <button
                                                key={it.id}
                                                onClick={() => isSelected ? removeKeyword(Number(it.id)) : addKeyword(it)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border cursor-pointer ${
                                                    isSelected
                                                        ? "bg-[#FF9F0A] border-[#FF9F0A] text-black font-bold"
                                                        : "bg-black/20 border-[#3A3A3C] text-[#AEAEB2] hover:text-white"
                                                }`}
                                            >
                                                #{it.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Results Grid */}
            <div className="space-y-6">
                <h3 className="text-lg font-black tracking-tight">Explorer Results</h3>
                
                {loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {[...Array(12)].map((_, i) => (
                            <div key={i} className="flex flex-col gap-2">
                                <Skeleton className="aspect-[2/3] w-full rounded-lg bg-[#1C1C1E]" />
                                <Skeleton className="h-4 w-3/4 bg-[#1C1C1E]" />
                                <Skeleton className="h-3 w-1/2 bg-[#1C1C1E]" />
                            </div>
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <div className="text-center py-20 bg-[#1C1C1E]/30 rounded-2xl border border-[#3A3A3C]/20 text-[#AEAEB2]">
                        {activeKeywords.length === 0
                            ? "Select or search keywords above to display matched tropes."
                            : "No results matched this intersection of keywords."
                        }
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {results.map((media) => (
                            <MovieCard key={media.id} media={media} />
                        ))}
                    </div>
                )}

                {/* Infinite Scroll sentinel */}
                {results.length > 0 && currentPage < totalPages && (
                    <div ref={observerTarget} className="flex justify-center mt-10 h-10">
                        {loadingMore && (
                            <span className="inline-block w-8 h-8 rounded-full border-4 border-[#E50914] border-t-transparent animate-spin" />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── 6. TRENDING SECTION ─────────────────────────────────────

const TrendingSection = () => {
    const [selectedRegion, setSelectedRegion] = useState("KE"); // Kenya default
    const [timeWindow, setTimeWindow] = useState<"day" | "week">("day"); // Today / This Week
    const [filterType, setFilterType] = useState<"movie" | "tv" | "all">("all");

    const [results, setResults] = useState<StreamVaultMedia[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const observerTarget = useRef<HTMLDivElement | null>(null);

    const getRegionName = () => {
        return REGIONS.find(r => r.value === selectedRegion)?.label.split(" ").slice(1).join(" ") ?? "Kenya";
    };

    const fetchTrendingResults = async (page: number, append = false) => {
        if (page === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            // Region code trending
            const data = await getTrending(filterType, timeWindow, selectedRegion);
            const normalized = (data.results || []).map(item => normalizeMedia(item, filterType === "all" ? (item as any).media_type || "movie" : filterType));
            setResults(prev => append ? [...prev, ...normalized] : normalized);
            setTotalPages(data.total_pages);
            setCurrentPage(page);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchTrendingResults(1, false);
    }, [selectedRegion, timeWindow, filterType]);

    useEffect(() => {
        const target = observerTarget.current;
        if (!target || loadingMore || currentPage >= totalPages) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    fetchTrendingResults(currentPage + 1, true);
                }
            },
            { rootMargin: "200px" }
        );

        observer.observe(target);
        return () => { if (target) observer.unobserve(target); };
    }, [observerTarget.current, loadingMore, currentPage, totalPages]);

    return (
        <div className="space-y-8">
            {/* Dynamic Header */}
            <div>
                <p className="text-[#636366] text-xs font-bold uppercase tracking-widest mb-2">LIVE GLOBAL & LOCAL INSIGHTS</p>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                    What's hot in <span className="text-[#E50914]">{getRegionName()}</span>
                </h2>
                <p className="text-[#AEAEB2] mt-1 text-sm">Real-time trending metrics compiled from standard media consumption.</p>
            </div>

            {/* Filter panel options */}
            <div className="bg-[#1C1C1E] border border-[#3A3A3C] rounded-2xl p-5 flex flex-col md:flex-row items-center gap-4 justify-between">
                
                {/* Movie/TV/All selector */}
                <div className="flex bg-black/40 border border-[#3A3A3C] rounded-lg p-0.5 h-11 w-full md:w-auto shrink-0">
                    <button
                        onClick={() => setFilterType("all")}
                        className={`flex-1 md:flex-none px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                            filterType === "all" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                        }`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilterType("movie")}
                        className={`flex-1 md:flex-none px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                            filterType === "movie" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                        }`}
                    >
                        Movies
                    </button>
                    <button
                        onClick={() => setFilterType("tv")}
                        className={`flex-1 md:flex-none px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                            filterType === "tv" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                        }`}
                    >
                        TV Shows
                    </button>
                </div>

                {/* Day / Week window selector */}
                <div className="flex bg-black/40 border border-[#3A3A3C] rounded-lg p-0.5 h-11 w-full md:w-auto shrink-0">
                    <button
                        onClick={() => setTimeWindow("day")}
                        className={`flex-1 md:flex-none px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                            timeWindow === "day" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                        }`}
                    >
                        Today
                    </button>
                    <button
                        onClick={() => setTimeWindow("week")}
                        className={`flex-1 md:flex-none px-4 rounded-md text-xs font-bold transition-all cursor-pointer h-full ${
                            timeWindow === "week" ? "bg-white text-black" : "text-[#AEAEB2] hover:text-white"
                        }`}
                    >
                        This Week
                    </button>
                </div>

                {/* Region selector */}
                <div className="w-full md:w-48">
                    <select
                        value={selectedRegion}
                        onChange={(e) => setSelectedRegion(e.target.value)}
                        className="w-full h-11 bg-black/40 text-white border border-[#3A3A3C] rounded-lg px-3 focus:outline-none focus:border-[#E50914] text-sm cursor-pointer"
                    >
                        {REGIONS.map((r) => (
                            <option key={r.value} value={r.value} className="bg-[#1C1C1E]">{r.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Results Grid */}
            <div className="space-y-6">
                {loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {[...Array(12)].map((_, i) => (
                            <div key={i} className="flex flex-col gap-2">
                                <Skeleton className="aspect-[2/3] w-full rounded-lg bg-[#1C1C1E]" />
                                <Skeleton className="h-4 w-3/4 bg-[#1C1C1E]" />
                                <Skeleton className="h-3 w-1/2 bg-[#1C1C1E]" />
                            </div>
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <div className="text-center py-20 text-[#AEAEB2]">
                        Failed to gather trending analytics for this selection. Try swapping regions.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {results.map((media, i) => (
                            <div key={media.id} className="relative group">
                                <MovieCard media={media} />

                                {/* Transparent Rank Overlay */}
                                <div className="absolute -bottom-4 -left-3 text-7xl md:text-8xl font-black text-white/10 pointer-events-none select-none tracking-tighter drop-shadow-xl z-20">
                                    #{i + 1}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Infinite Scroll sentinel */}
                {results.length > 0 && currentPage < totalPages && (
                    <div ref={observerTarget} className="flex justify-center mt-10 h-10">
                        {loadingMore && (
                            <span className="inline-block w-8 h-8 rounded-full border-4 border-[#E50914] border-t-transparent animate-spin" />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
