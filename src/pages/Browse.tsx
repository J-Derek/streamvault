import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import CinematicLoader from "@/components/ui/CinematicLoader";
import { LayoutGrid, List, SlidersHorizontal, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/Navbar";
import MovieCard from "@/components/MovieCard";
import FilterPanel from "@/components/sections/FilterPanel";
import { discoverContent } from "@/lib/tmdb";
import { normalizeMedia, type StreamVaultMedia } from "@/lib/tmdb-types";

const SORT_OPTIONS = [
    { value: "popularity.desc", label: "Trending" },
    { value: "vote_average.desc", label: "Top Rated" },
    { value: "primary_release_date.desc", label: "Newest" },
    { value: "title.asc", label: "A–Z" },
];

// Helper: build a human-readable label for active filter chips
function buildChips(params: URLSearchParams, genreMap: Record<number, string>) {
    const chips: { key: string; label: string; clearParam: string; clearValue?: string }[] = [];

    const type = params.get("type");
    if (type) chips.push({ key: "type", label: `Type: ${type === "movie" ? "Movies" : "TV Shows"}`, clearParam: "type" });

    const genres = params.get("genres");
    if (genres) {
        genres.split(",").filter(Boolean).forEach((id) => {
            const name = genreMap[Number(id)] ?? `Genre #${id}`;
            chips.push({ key: `genre-${id}`, label: `Genre: ${name}`, clearParam: "genres-single", clearValue: id });
        });
    }

    const rating = params.get("rating");
    if (rating && Number(rating) > 0) chips.push({ key: "rating", label: `Rating: ${rating}+`, clearParam: "rating" });

    const duration = params.get("duration");
    if (duration) {
        const durLabel = duration === "under90" ? "Under 90 min" : duration === "90to150" ? "90–150 min" : "Over 150 min";
        chips.push({ key: "duration", label: `Duration: ${durLabel}`, clearParam: "duration" });
    }

    const yearFrom = params.get("yearFrom");
    const yearTo = params.get("yearTo");
    if (yearFrom || yearTo) chips.push({ key: "year", label: `Year: ${yearFrom ?? "1970"} – ${yearTo ?? new Date().getFullYear()}`, clearParam: "year-both" });

    const status = params.get("status");
    if (status) chips.push({ key: "status", label: `Status: ${status.split(",").join(", ")}`, clearParam: "status" });

    return chips;
}

const BrowsePage = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [view, setView] = useState<"grid" | "list">("grid");
    const [results, setResults] = useState<StreamVaultMedia[]>([]);
    const [totalResults, setTotalResults] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(false);
    const [genreMap, setGenreMap] = useState<Record<number, string>>({});
    const [showFilters, setShowFilters] = useState(true);
    const observerTarget = useRef<HTMLDivElement | null>(null);

    const sort = params.get("sort") ?? "popularity.desc";
    const type = (params.get("type") as "movie" | "tv") ?? "movie";
    const mediaType = params.get("type") === "tv" ? "tv" : "movie";
    const chips = buildChips(params, genreMap);

    // Build discoverContent params from URL search params
    const buildDiscoverParams = (page: number) => {
        const genresRaw = params.get("genres");
        const genres = genresRaw ? genresRaw.split(",").filter(Boolean).map(Number) : [];
        const ratingRaw = params.get("rating");
        const minRating = ratingRaw ? Number(ratingRaw) : undefined;
        const yearFrom = params.get("yearFrom") ? Number(params.get("yearFrom")) : undefined;
        const yearTo = params.get("yearTo") ? Number(params.get("yearTo")) : undefined;
        const duration = params.get("duration");
        const minRuntime = duration === "90to150" ? 90 : duration === "over150" ? 150 : undefined;
        const maxRuntime = duration === "under90" ? 90 : duration === "90to150" ? 150 : undefined;

        return {
            mediaType,
            genres: genres.length ? genres : undefined,
            minRating,
            yearFrom,
            yearTo,
            minRuntime,
            maxRuntime,
            sortBy: sort,
            page,
        };
    };

    // Fetch on param change
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        setCurrentPage(1);

        discoverContent(buildDiscoverParams(1))
            .then((data) => {
                if (cancelled) return;
                const normalized = data.results.slice(0, 20).map((item) => normalizeMedia(item as any, mediaType));
                setResults(normalized);
                setTotalResults(data.total_results);
                setTotalPages(data.total_pages);
                setLoading(false);
            })
            .catch(() => {
                if (!cancelled) { setError(true); setLoading(false); }
            });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.toString()]);

    // Infinite Scroll Observer
    useEffect(() => {
        const target = observerTarget.current;
        if (!target || loadingMore || currentPage >= totalPages) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadMore();
                }
            },
            { rootMargin: "200px" } // trigger slightly before it enters screen
        );

        observer.observe(target);
        return () => { if (target) observer.unobserve(target); };
    }, [observerTarget.current, loadingMore, currentPage, totalPages]);

    const loadMore = async () => {
        const nextPage = currentPage + 1;
        setLoadingMore(true);
        try {
            const data = await discoverContent(buildDiscoverParams(nextPage));
            const normalized = data.results.map((item) => normalizeMedia(item as any, mediaType));
            setResults((prev) => [...prev, ...normalized]);
            setCurrentPage(nextPage);
        } finally {
            setLoadingMore(false);
        }
    };

    const setSort = (val: string) => {
        const next = new URLSearchParams(params);
        next.set("sort", val);
        next.delete("page");
        setParams(next);
    };

    const removeChip = (chip: typeof chips[0]) => {
        const next = new URLSearchParams(params);
        if (chip.clearParam === "genres-single") {
            const current = next.get("genres")?.split(",").filter((id) => id !== chip.clearValue) ?? [];
            if (current.length) next.set("genres", current.join(","));
            else next.delete("genres");
        } else if (chip.clearParam === "year-both") {
            next.delete("yearFrom");
            next.delete("yearTo");
        } else {
            next.delete(chip.clearParam);
        }
        next.delete("page");
        setParams(next);
    };

    // Expose genreMap via genres query result — we piggyback here simply
    useEffect(() => {
        import("@/lib/tmdb").then(({ getGenres }) =>
            getGenres("movie").then((data) => {
                const map: Record<number, string> = {};
                data.genres.forEach((g) => (map[g.id] = g.name));
                setGenreMap(map);
            })
        );
    }, []);

    return (
        <div className="min-h-screen bg-[#0D0D0D]">
            <Navbar />

            <div className="pt-16 max-w-[1400px] mx-auto px-4 md:px-8">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-[#AEAEB2] hover:text-white mb-6 transition-colors group"
                >
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-semibold text-sm">Back</span>
                </button>
                <div className="flex gap-8 py-8">
                    {/* Desktop Filter Sidebar */}
                    <div className={`hidden md:block transition-all duration-300 ${showFilters ? 'w-[240px]' : 'w-0 overflow-hidden'}`}>
                        <div className="sticky top-24 h-[calc(100vh-120px)] overflow-y-auto pr-4 
                        [&::-webkit-scrollbar]:w-1
                        [&::-webkit-scrollbar-track]:bg-transparent
                        [&::-webkit-scrollbar-thumb]:bg-[#3A3A3C]
                        [&::-webkit-scrollbar-thumb]:rounded-full
                        [&::-webkit-scrollbar-thumb:hover]:bg-[#E50914]">
                            <h2 className="text-white font-bold text-lg mb-6">Filters</h2>
                            <FilterPanel />
                        </div>
                    </div>

                    {/* Main Results Area */}
                    <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                            <div className="flex items-center gap-3">
                                {/* Desktop Filter Toggle */}
                                <Button
                                    variant="outline"
                                    onClick={() => setShowFilters(!showFilters)}
                                    className="hidden md:flex gap-2 bg-[#1C1C1E] border-[#3A3A3C] text-white hover:bg-[#2C2C2E] h-9 px-3"
                                >
                                    {showFilters ? <ChevronLeft className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
                                    {showFilters ? "Hide" : "Filters"}
                                </Button>

                                {/* Mobile Filters Button */}
                                <Sheet>
                                    <SheetTrigger asChild>
                                        <Button variant="outline" className="md:hidden gap-2 bg-[#1C1C1E] border-[#3A3A3C] text-white hover:bg-[#2C2C2E]">
                                            <SlidersHorizontal className="w-4 h-4" />
                                            Filters
                                            {chips.length > 0 && (
                                                <span className="ml-1 bg-[#E50914] text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                                                    {chips.length}
                                                </span>
                                            )}
                                        </Button>
                                    </SheetTrigger>
                                    <SheetContent side="bottom" className="bg-[#1C1C1E] border-t border-[#3A3A3C] max-h-[85vh] overflow-y-auto">
                                        <SheetHeader className="mb-4">
                                            <SheetTitle className="text-white">Filters</SheetTitle>
                                        </SheetHeader>
                                        <FilterPanel />
                                    </SheetContent>
                                </Sheet>

                                <p className="text-[#AEAEB2] text-sm">
                                    {loading ? (
                                        <span className="inline-block w-32 h-4 bg-[#2C2C2E] rounded animate-pulse" />
                                    ) : (
                                        <><span className="text-white font-semibold">{totalResults.toLocaleString()}</span> titles match</>
                                    )}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Sort */}
                                <Select value={sort} onValueChange={setSort}>
                                    <SelectTrigger className="w-[160px] bg-[#1C1C1E] border-[#3A3A3C] text-white h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white">
                                        {SORT_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value} className="hover:bg-[#2C2C2E] focus:bg-[#2C2C2E]">
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {/* View toggle */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setView("grid")}
                                    className={`h-9 w-9 ${view === "grid" ? "text-[#E50914] bg-[#E50914]/10" : "text-[#AEAEB2] hover:text-white"}`}
                                    aria-label="Grid view"
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setView("list")}
                                    className={`h-9 w-9 ${view === "list" ? "text-[#E50914] bg-[#E50914]/10" : "text-[#AEAEB2] hover:text-white"}`}
                                    aria-label="List view"
                                >
                                    <List className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Active filter chips */}
                        {chips.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                {chips.map((chip) => (
                                    <button
                                        key={chip.key}
                                        onClick={() => removeChip(chip)}
                                        className="flex items-center gap-1. px-3 py-1 rounded-full bg-[#2C2C2E] border border-[#3A3A3C] text-xs text-[#AEAEB2] hover:border-[#E50914]/60 hover:text-white transition-all group"
                                    >
                                        {chip.label}
                                        <X className="w-3 h-3 ml-1 opacity-50 group-hover:opacity-100" />
                                    </button>
                                ))}
                                <button
                                    onClick={() => setParams(new URLSearchParams())}
                                    className="px-3 py-1 rounded-full text-xs text-[#E50914] hover:bg-[#E50914]/10 transition-all"
                                >
                                    Clear All
                                </button>
                            </div>
                        )}

                        {/* Loading skeletons */}
                        {loading && (
                            <div className="py-24">
                                <CinematicLoader text="Decrypting Catalog..." fullScreen={false} />
                            </div>
                        )}

                        {/* Error state */}
                        {error && !loading && (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                                <p className="text-[#AEAEB2] mb-4">Failed to load content. Please check your connection.</p>
                                <Button variant="outline" className="border-[#3A3A3C] text-white hover:bg-[#2C2C2E]" onClick={() => setParams(new URLSearchParams())}>
                                    Clear Filters & Retry
                                </Button>
                            </div>
                        )}

                        {/* Empty state */}
                        {!loading && !error && results.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
                                <p className="text-[#AEAEB2] text-lg">No titles match your filters.</p>
                                <Button onClick={() => setParams(new URLSearchParams())} className="bg-[#E50914] hover:bg-[#B00610] text-white">
                                    Clear Filters
                                </Button>
                            </div>
                        )}

                        {/* Grid view */}
                        {!loading && !error && results.length > 0 && view === "grid" && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                                {results.map((media) => (
                                    <MovieCard key={media.id} media={media} />
                                ))}
                            </div>
                        )}

                        {/* List view */}
                        {!loading && !error && results.length > 0 && view === "list" && (
                            <div className="flex flex-col gap-3">
                                {results.map((media) => (
                                    <div
                                        key={media.id}
                                        onClick={() => navigate(`/title/${media.id}?type=${media.mediaType ?? 'movie'}`)}
                                        className="flex gap-4 p-4 rounded-lg bg-[#1C1C1E] border border-[#3A3A3C] hover:border-[#E50914]/50 transition-colors cursor-pointer active:scale-[0.99]"
                                    >
                                        <img
                                            src={`https://image.tmdb.org/t/p/w92${media.posterPath}`}
                                            alt={media.title}
                                            className="w-[60px] aspect-[2/3] object-cover rounded-md shrink-0 bg-[#2C2C2E]"
                                            loading="lazy"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-white font-semibold truncate">{media.title}</h3>
                                            <div className="flex items-center gap-2 mt-1 text-xs text-[#AEAEB2]">
                                                <span>{media.year}</span>
                                                {media.rating > 0 && (
                                                    <>
                                                        <span className="w-1 h-1 rounded-full bg-[#3A3A3C]" />
                                                        <span className="text-[#F5C518]">★ {media.rating.toFixed(1)}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Infinite Scroll Trigger */}
                        {!loading && !error && results.length > 0 && currentPage < totalPages && (
                            <div ref={observerTarget} className="flex justify-center mt-10 pb-10">
                                {loadingMore && (
                                    <span className="inline-block w-8 h-8 rounded-full border-4 border-[#E50914] border-t-transparent animate-spin" />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BrowsePage;
