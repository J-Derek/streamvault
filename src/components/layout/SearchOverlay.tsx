import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search as SearchIcon, X } from "lucide-react";
import { searchMulti, posterUrl } from "@/lib/tmdb";

interface SearchResult {
    id: number;
    media_type: "movie" | "tv" | "person";
    title?: string;
    name?: string;
    poster_path?: string | null;
    profile_path?: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
}

interface SearchOverlayProps {
    open: boolean;
    onClose: () => void;
}

const SearchOverlay = ({ open, onClose }: SearchOverlayProps) => {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-focus on open
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            setQuery("");
            setResults([]);
        }
    }, [open]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const doSearch = useCallback((q: string) => {
        if (!q.trim()) { setResults([]); return; }
        setLoading(true);
        searchMulti(q).then((data) => {
            setResults((data.results as unknown as SearchResult[]).filter(r => r.media_type !== "person").slice(0, 8));
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const handleInput = (val: string) => {
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(val), 200);
    };

    const handleSelect = (result: SearchResult) => {
        navigate(`/title/${result.id}?type=${result.media_type}`);
        onClose();
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col"
            style={{ background: "rgba(13,13,13,0.97)" }}
        >
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative z-10 max-w-[800px] w-full mx-auto px-4 pt-24">
                {/* Input */}
                <div className="relative">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-[#636366] pointer-events-none" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => handleInput(e.target.value)}
                        placeholder="Search movies, TV shows…"
                        className="w-full h-[60px] bg-[#1C1C1E] text-white text-lg placeholder-[#636366] border border-[#3A3A3C] rounded-xl pl-14 pr-14 outline-none focus:border-[#E50914] transition-colors"
                    />
                    {query ? (
                        <button
                            onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#636366] hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    ) : (
                        <button
                            onClick={onClose}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#636366] hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Results */}
                {(results.length > 0 || loading) && (
                    <div className="mt-3 bg-[#1C1C1E] border border-[#3A3A3C] rounded-xl overflow-hidden shadow-2xl max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:bg-[#3A3A3C] [&::-webkit-scrollbar-thumb:hover]:bg-[#E50914]">
                        {loading && !results.length && (
                            <div className="p-4 text-center text-[#AEAEB2] text-sm">Searching…</div>
                        )}
                        {results.map((result) => {
                            const title = result.title ?? result.name ?? "";
                            const year = (result.release_date ?? result.first_air_date ?? "").slice(0, 4);
                            return (
                                <button
                                    key={`${result.media_type}-${result.id}`}
                                    onClick={() => handleSelect(result)}
                                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-[#2C2C2E] transition-colors border-b border-[#3A3A3C] last:border-0 text-left"
                                >
                                    <img
                                        src={posterUrl(result.poster_path ?? null, "w92")}
                                        alt={title}
                                        className="w-[40px] h-[60px] object-cover rounded-md bg-[#2C2C2E] shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium truncate">{title}</p>
                                        <p className="text-[#AEAEB2] text-xs">{year}</p>
                                    </div>
                                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-[#2C2C2E] text-[#AEAEB2] border border-[#3A3A3C] font-bold">
                                        {result.media_type === "movie" ? "MOVIE" : "TV"}
                                    </span>
                                </button>
                            );
                        })}
                        {query.trim() && (
                            <button
                                onClick={() => { navigate(`/search?q=${encodeURIComponent(query)}`); onClose(); }}
                                className="w-full text-center py-3 text-[#E50914] text-sm hover:bg-[#2C2C2E] transition-colors"
                            >
                                See all results for "{query}" →
                            </button>
                        )}
                    </div>
                )}

                <p className="text-center text-[#636366] text-xs mt-4">Press <kbd className="px-1.5 py-0.5 rounded bg-[#2C2C2E] font-mono">Esc</kbd> to close</p>
            </div>
        </div>
    );
};

export default SearchOverlay;
