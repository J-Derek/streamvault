import { ChevronLeft, Diamond } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { discoverContent } from "@/lib/tmdb";
import { normalizeMedia } from "@/lib/tmdb-types";
import MovieCard from "@/components/MovieCard";
import { Skeleton } from "@/components/ui/skeleton";

const HiddenGems = () => {
    const navigate = useNavigate();

    const { data, isLoading, isError } = useQuery({
        queryKey: ['discoverHiddenGems'],
        queryFn: () => discoverContent({
            mediaType: 'movie',
            minRating: 7.2,
            voteCountGte: 100,
            voteCountLte: 600,
            sortBy: 'vote_average.desc', // Sorting by highest rating purely
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
                        <Diamond className="w-32 h-32" />
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-black/40 border border-[#3A3A3C] flex items-center justify-center">
                                <Diamond className="w-5 h-5 text-[#34C759]" />
                            </div>
                            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Hidden Gems</h1>
                        </div>
                        <p className="text-[#AEAEB2] text-sm md:text-base font-medium mb-6">
                            Critically acclaimed masterpieces that flew under the radar.
                        </p>

                        <div className="mt-2 pt-6 border-t border-[#3A3A3C]/50 flex items-center gap-2 text-[#AEAEB2]">
                            <span className="text-[#636366]">→</span>
                            <p className="text-sm font-medium">Films with a 7.2+ rating but fewer than 600 global votes.</p>
                        </div>
                    </div>
                </div>

                {/* Results Grid */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tight">Underrated Masterpieces</h2>
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
                                Failed to load gems. Please check your API connection.
                            </div>
                        ) : data?.results?.length === 0 ? (
                            <div className="col-span-full py-12 text-center text-[#AEAEB2]">
                                No hidden gems found right now.
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

export default HiddenGems;
