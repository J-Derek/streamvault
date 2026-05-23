import { useState } from "react";
import { ChevronLeft, ThumbsUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getRecommendations } from "@/lib/tmdb";
import { normalizeMedia } from "@/lib/tmdb-types";
import MovieCard from "@/components/MovieCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useWatchlist } from "@/store/watchlist";

interface SeedItem {
    id: number;
    title: string;
    mediaType: "movie" | "tv";
}

const DEFAULT_SEEDS: SeedItem[] = [
    { id: 27205, title: "Inception", mediaType: "movie" }, // Sci-Fi / Action
    { id: 1399, title: "Game of Thrones", mediaType: "tv" }, // Fantasy / Drama
    { id: 348, title: "Alien", mediaType: "movie" }, // Horror / Sci-Fi
    { id: 18785, title: "The Hangover", mediaType: "movie" }, // Comedy
    { id: 11036, title: "The Notebook", mediaType: "movie" }, // Romance / Drama
    { id: 99, title: "Planet Earth", mediaType: "tv" }, // Documentary
];

const Recommendations = () => {
    const navigate = useNavigate();
    const { items: watchlistItems } = useWatchlist();

    // Use watchlist if available, otherwise use defaults
    const availableSeeds = watchlistItems.length > 0
        ? watchlistItems.map(i => ({ id: i.id, title: i.title, mediaType: i.mediaType }))
        : DEFAULT_SEEDS;

    const [selectedSeed, setSelectedSeed] = useState<SeedItem>(availableSeeds[0]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['recommendations', selectedSeed.mediaType, selectedSeed.id],
        queryFn: () => getRecommendations(selectedSeed.mediaType, selectedSeed.id),
        enabled: !!selectedSeed,
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
                        <ThumbsUp className="w-32 h-32" />
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-black/40 border border-[#3A3A3C] flex items-center justify-center">
                                <ThumbsUp className="w-5 h-5 text-[#00B4D8]" />
                            </div>
                            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Because you liked...</h1>
                        </div>
                        <p className="text-[#AEAEB2] text-sm md:text-base font-medium mb-6">
                            {watchlistItems.length > 0
                                ? "Pick a title from your Watchlist to find 20 titles just like it."
                                : "We noticed your Watchlist is empty. Pick one of these classics to see how our recommendation engine works."}
                        </p>

                        <div className="flex flex-wrap gap-2 md:gap-3 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                            {availableSeeds.map((seed) => {
                                const isActive = selectedSeed?.id === seed.id;
                                return (
                                    <button
                                        key={seed.id}
                                        onClick={() => setSelectedSeed(seed)}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 border ${isActive
                                            ? 'bg-[#34C759]/10 border-[#34C759] text-[#34C759] shadow-[0_0_15px_rgba(52,199,89,0.2)]'
                                            : 'bg-black/40 border-[#3A3A3C] text-[#AEAEB2] hover:text-white hover:border-[#636366]'
                                            }`}
                                    >
                                        {seed.title}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Results Grid */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tight">Titles Similar to {selectedSeed.title}</h2>
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
                                Failed to load recommendations. Please check your API connection.
                            </div>
                        ) : data?.results?.length === 0 ? (
                            <div className="col-span-full py-12 text-center text-[#AEAEB2]">
                                No recommendations found for this title.
                            </div>
                        ) : (
                            data?.results?.map((item) => (
                                <MovieCard key={item.id} media={normalizeMedia(item, selectedSeed.mediaType)} />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Recommendations;
