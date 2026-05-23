import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import CinematicLoader from "@/components/ui/CinematicLoader";
import { Search as SearchIcon, X, Star, Clock, ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/Navbar";
import { searchMulti, getTrendingMovies, posterUrl, profileUrl } from "@/lib/tmdb";
import { normalizeMedia } from "@/lib/tmdb-types";

const RECENT_KEY = "sv_recent_searches";
const MAX_RECENT = 5;

function getRecent(): string[] {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    } catch {
        return [];
    }
}

function saveRecent(query: string) {
    const current = getRecent().filter((q) => q !== query);
    const next = [query, ...current].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function removeRecent(query: string) {
    const next = getRecent().filter((q) => q !== query);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

type Tab = "all" | "movie" | "tv" | "person";

interface SearchResult {
    id: number;
    media_type: "movie" | "tv" | "person";
    title?: string;
    name?: string;
    overview?: string;
    poster_path?: string | null;
    profile_path?: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    genre_ids?: number[];
    known_for_department?: string;
}

const TYPE_LABELS: Record<string, string> = {
    movie: "MOVIE",
    tv: "TV",
};

const SearchPage = () => {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);

    const [inputValue, setInputValue] = useState(params.get("q") ?? "");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [trendingPills, setTrendingPills] = useState<string[]>([]);
    const [recent, setRecent] = useState<string[]>(getRecent());
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>("all");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto focus
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Load trending on mount for zero state
    useEffect(() => {
        getTrendingMovies().then((data) => {
            setTrendingPills(
                data.results.slice(0, 8).map((m) => "title" in m ? (m as any).title : (m as any).name).filter(Boolean)
            );
        }).catch(() => { });
    }, []);

    // If initial ?q= exists, search immediately
    const doSearch = useCallback((q: string) => {
        if (!q.trim()) {
            setResults([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        searchMulti(q)
            .then((data) => {
                setResults(data.results as unknown as SearchResult[]);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        const q = params.get("q") ?? "";
        if (q) {
            setInputValue(q);
            doSearch(q);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleInput = (val: string) => {
        setInputValue(val);

        // Update URL
        const next = new URLSearchParams();
        if (val) next.set("q", val);
        setParams(next, { replace: true });

        // Debounce API call 200ms
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(val), 200);

        // Save to recent after 1 second of no typing
        if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
        if (val.trim()) {
            saveDebounceRef.current = setTimeout(() => {
                saveRecent(val.trim());
                setRecent(getRecent());
            }, 1000);
        }
    };

    const handlePillClick = (title: string) => {
        handleInput(title);
        inputRef.current?.focus();
    };

    const handleClear = () => {
        setInputValue("");
        setResults([]);
        setParams(new URLSearchParams(), { replace: true });
        if (debounceRef.current) clearTimeout(debounceRef.current);
        inputRef.current?.focus();
    };

    const removeRecentItem = (q: string) => {
        removeRecent(q);
        setRecent(getRecent());
    };

    const clearAllRecent = () => {
        localStorage.removeItem(RECENT_KEY);
        setRecent([]);
    };

    // Filter results by active tab (client-side)
    const getFiltered = (): SearchResult[] => {
        if (activeTab === "all") return results.filter((r) => r.media_type !== "person" || activeTab === "all");
        return results.filter((r) => r.media_type === activeTab);
    };

    const titleResults = results.filter((r) => r.media_type === "movie" || r.media_type === "tv");
    const peopleResults = results.filter((r) => r.media_type === "person");
    const filteredTitles =
        activeTab === "all" ? titleResults :
            activeTab === "person" ? [] :
                results.filter((r) => r.media_type === activeTab);
    const filteredPeople = activeTab === "all" || activeTab === "person" ? peopleResults : [];

    const query = inputValue.trim();

    return (
        <div className="min-h-screen bg-[#0D0D0D]">
            <Navbar />

            <div className="pt-24 pb-20 px-4">
                <div className="max-w-[900px] mx-auto">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-[#AEAEB2] hover:text-white mb-4 transition-colors group"
                    >
                        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span className="font-semibold text-sm">Back</span>
                    </button>

                    {/* Page title */}
                    <h1 className="text-white text-[28px] font-bold mb-6">Search</h1>

                    {/* Search input */}
                    <div className="relative mb-6">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#636366] pointer-events-none" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={(e) => handleInput(e.target.value)}
                            placeholder="Search movies, TV shows, people…"
                            className="w-full h-14 bg-[#1C1C1E] text-white placeholder-[#636366] border border-[#3A3A3C] rounded-xl pl-12 pr-12 text-base outline-none focus:border-[#E50914] transition-colors"
                        />
                        {inputValue && (
                            <button
                                onClick={handleClear}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#636366] hover:text-white transition-colors"
                                aria-label="Clear search"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* Filter tabs — only when there are results */}
                    {query && !loading && results.length > 0 && (
                        <div className="flex gap-2 mb-6 border-b border-[#3A3A3C] pb-2">
                            {(["all", "movie", "tv", "person"] as Tab[]).map((tab) => {
                                const count =
                                    tab === "all" ? results.length :
                                        results.filter((r) => r.media_type === tab).length;
                                if (count === 0 && tab !== "all") return null;
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab === tab
                                            ? "bg-[#E50914] text-white"
                                            : "text-[#AEAEB2] hover:text-white hover:bg-[#2C2C2E]"
                                            }`}
                                    >
                                        {tab === "all" ? "All" : tab === "movie" ? "Movies" : tab === "tv" ? "TV Shows" : "People"}
                                        <span className="ml-1.5 text-xs opacity-70">({count})</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Loading skeletons */}
                    {loading && (
                        <div className="py-24">
                            <CinematicLoader text="Searching Vault..." fullScreen={false} />
                        </div>
                    )}

                    {/* Zero state */}
                    {!query && !loading && (
                        <div className="space-y-8">
                            {/* Trending searches */}
                            {trendingPills.length > 0 && (
                                <div>
                                    <h2 className="text-white font-semibold text-base mb-3 flex items-center gap-2">
                                        <span className="text-[#E50914]">🔥</span> Trending Searches
                                    </h2>
                                    <div className="flex flex-wrap gap-2">
                                        {trendingPills.map((title) => (
                                            <button
                                                key={title}
                                                onClick={() => handlePillClick(title)}
                                                className="px-4 py-2 rounded-full bg-[#1C1C1E] border border-[#3A3A3C] text-sm text-[#AEAEB2] hover:text-white hover:border-[#636366] transition-all"
                                            >
                                                {title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recent searches */}
                            {recent.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h2 className="text-white font-semibold text-base flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-[#636366]" /> Recent Searches
                                        </h2>
                                        <button onClick={clearAllRecent} className="text-xs text-[#AEAEB2] hover:text-[#E50914] transition-colors">
                                            Clear all
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {recent.map((q) => (
                                            <div key={q} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#1C1C1E] border border-[#3A3A3C] group">
                                                <button
                                                    onClick={() => handlePillClick(q)}
                                                    className="text-sm text-[#AEAEB2] hover:text-white transition-colors"
                                                >
                                                    {q}
                                                </button>
                                                <button
                                                    onClick={() => removeRecentItem(q)}
                                                    className="text-[#636366] hover:text-white transition-colors ml-1"
                                                    aria-label={`Remove ${q}`}
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* No results */}
                    {query && !loading && results.length === 0 && (
                        <div className="text-center py-20">
                            <p className="text-white text-xl font-semibold mb-2">No results for "{query}"</p>
                            <p className="text-[#AEAEB2] text-sm">Try searching for a genre, actor, or different title.</p>
                        </div>
                    )}

                    {/* Results */}
                    {!loading && results.length > 0 && (
                        <div className="space-y-8">
                            {/* Title results */}
                            {filteredTitles.length > 0 && (
                                <div>
                                    {activeTab === "all" && (
                                        <h2 className="text-white font-bold text-lg mb-4 border-b border-[#3A3A3C] pb-2">Titles</h2>
                                    )}
                                    <div className="space-y-2">
                                        {filteredTitles.map((item) => {
                                            const title = item.title ?? item.name ?? "";
                                            const year = (item.release_date ?? item.first_air_date ?? "").slice(0, 4);
                                            const rating = item.vote_average ?? 0;
                                            const typeLabel = TYPE_LABELS[item.media_type] ?? item.media_type.toUpperCase();
                                            return (
                                                <Link
                                                    to={`/title/${item.id}?type=${item.media_type}`}
                                                    key={`${item.media_type}-${item.id}`}
                                                    className="flex gap-4 p-4 rounded-xl bg-[#1C1C1E] border border-[#3A3A3C] hover:border-[#636366] transition-all group"
                                                >
                                                    <img
                                                        src={posterUrl(item.poster_path ?? null, "w92")}
                                                        alt={title}
                                                        className="w-[60px] h-[90px] object-cover rounded-lg bg-[#2C2C2E] shrink-0"
                                                        loading="lazy"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start gap-2 flex-wrap">
                                                            <h3 className="text-white font-semibold text-base group-hover:text-[#E50914] transition-colors truncate">
                                                                {title}
                                                            </h3>
                                                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#2C2C2E] text-[#AEAEB2] border border-[#3A3A3C]">
                                                                {typeLabel}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1 text-xs text-[#AEAEB2]">
                                                            {year && <span>{year}</span>}
                                                            {rating > 0 && (
                                                                <>
                                                                    <span className="w-0.5 h-0.5 rounded-full bg-current" />
                                                                    <span className="text-[#F5C518] flex items-center gap-0.5">
                                                                        <Star className="w-3 h-3 fill-[#F5C518]" />
                                                                        {rating.toFixed(1)}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                        {item.overview && (
                                                            <p className="text-[#AEAEB2] text-sm mt-1.5 line-clamp-1">{item.overview}</p>
                                                        )}
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* People results */}
                            {filteredPeople.length > 0 && (
                                <div>
                                    <h2 className="text-white font-bold text-lg mb-4 border-b border-[#3A3A3C] pb-2">People</h2>
                                    <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                                        {filteredPeople.map((person) => (
                                            <div key={person.id} className="flex-shrink-0 w-[100px] text-center">
                                                <img
                                                    src={profileUrl(person.profile_path ?? null, "w185")}
                                                    alt={person.name}
                                                    className="w-20 h-20 rounded-full object-cover mx-auto bg-[#1C1C1E] border-2 border-[#3A3A3C]"
                                                    loading="lazy"
                                                />
                                                <p className="text-white text-xs font-semibold mt-2 truncate">{person.name}</p>
                                                {person.known_for_department && (
                                                    <p className="text-[#636366] text-[10px] mt-0.5">{person.known_for_department}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SearchPage;
