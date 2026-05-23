import { useState } from "react";
import { ChevronLeft, Hash } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { discoverContent } from "@/lib/tmdb";
import { normalizeMedia } from "@/lib/tmdb-types";
import MovieCard from "@/components/MovieCard";
import { Skeleton } from "@/components/ui/skeleton";

interface KeywordTag {
    id: string; // TMDB keyword ID
    name: string;
}

// Curated list of high-interest tropes
const KEYWORDS: KeywordTag[] = [
    { id: "4379", name: "time-travel" },
    { id: "10084", name: "plot-twist" },
    { id: "10466", name: "based-on-true-story" },
    { id: "100032", name: "cult-classic" },
    { id: "6054", name: "female-protagonist" },
    { id: "155477", name: "slow-burn" },
    { id: "9826", name: "murder-mystery" },
    { id: "4139", name: "cyberpunk" },
    { id: "161176", name: "space-opera" },
    { id: "155030", name: "superhero" },
    { id: "9715", name: "supernatural" },
    { id: "10714", name: "serial-killer" },
    { id: "99", name: "documentary" },
    { id: "2343", name: "magic" },
    { id: "1956", name: "world-war-ii" },
    { id: "10066", name: "spaghetti-western" },
    { id: "779", name: "martial-arts" }
];

const KeywordExplorer = () => {
    const navigate = useNavigate();
    // We can support multiple, but let's stick to one for clean results
    const [selectedKeyword, setSelectedKeyword] = useState<KeywordTag>(KEYWORDS[1]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['discoverKeyword', selectedKeyword.id],
        queryFn: () => discoverContent({
            mediaType: 'movie',
            withKeywords: selectedKeyword.id,
            sortBy: 'popularity.desc',
        }),
    });

    return (
        <div className="min-h-screen bg-[#0D0D0D] pt-24 pb-20 px-4 md:px-8 text-white font-sans animate-fade-in">
            <div className="max-w-[1200px] mx-auto">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-[#AEAEB2] hover:text-white mb-8 transition-colors group"
                >
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-semibold">Back to Discover</span>
                </button>

                {/* Header Block */}
                <div className="bg-[#1C1C1E] border border-[#3A3A3C] rounded-2xl p-6 md:p-8 mb-10 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Hash className="w-32 h-32" />
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-black/40 border border-[#3A3A3C] flex items-center justify-center">
                                <Hash className="w-5 h-5 text-white" />
                            </div>
                            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Explore by keyword</h1>
                        </div>
                        <p className="text-[#AEAEB2] text-sm md:text-base font-medium mb-6">Pick a cinematic trope to explore.</p>

                        <div className="flex flex-wrap gap-2 md:gap-3">
                            {KEYWORDS.map((kw) => {
                                const isActive = selectedKeyword.id === kw.id;
                                return (
                                    <button
                                        key={kw.id}
                                        onClick={() => setSelectedKeyword(kw)}
                                        className={`px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 border ${isActive
                                            ? 'bg-white/10 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                                            : 'bg-black/40 border-[#3A3A3C] text-[#AEAEB2] hover:text-white hover:border-[#636366]'
                                            }`}
                                    >
                                        {kw.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Results Grid */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tight">Titles tagged with '{selectedKeyword.name}'</h2>
                        <span className="text-xs font-bold text-[#636366] uppercase tracking-widest">{data?.results?.length || 0} Matches</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {isLoading ? (
                            [...Array(12)].map((_, i) => (
                                <div key={i} className="flex flex-col gap-2">
                                    <Skeleton className="aspect-[2/3] w-full rounded-lg bg-[#1C1C1E]" />
                                    <Skeleton className="h-4 w-3/4 bg-[#1C1C1E]" />
                                    <Skeleton className="h-3 w-1/2 bg-[#1C1C1E]" />
                                </div>
                            ))
                        ) : isError ? (
                            <div className="col-span-full py-12 text-center text-[#E50914] bg-[#E50914]/10 rounded-xl border border-[#E50914]/20">
                                Failed to load movies. Please check your API connection.
                            </div>
                        ) : data?.results?.length === 0 ? (
                            <div className="col-span-full py-12 text-center text-[#AEAEB2]">
                                No movies found matching this keyword.
                            </div>
                        ) : (
                            data?.results?.map((item) => (
                                <MovieCard key={item.id} media={normalizeMedia(item, 'movie')} />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KeywordExplorer;
