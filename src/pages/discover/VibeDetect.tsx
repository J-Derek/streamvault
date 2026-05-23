import { useState, useEffect } from "react";
import { ChevronLeft, Moon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { discoverContent } from "@/lib/tmdb";
import { normalizeMedia } from "@/lib/tmdb-types";
import MovieCard from "@/components/MovieCard";
import { Skeleton } from "@/components/ui/skeleton";

interface VibeDefinition {
    id: string;
    name: string;
    genres: number[]; // TMDB Genre IDs
    description: string;
}

// Map time of day to vibes
const getVibeForNow = (): VibeDefinition => {
    const d = new Date();
    const day = d.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
    const hour = d.getHours();

    const isWeekend = day === 0 || day === 6;
    const isFridayNight = day === 5 && hour >= 18;

    if (isFridayNight) {
        return { id: 'friday_night', name: "Friday Night Energy", genres: [28, 53], description: "Action & Thrillers to kick off the weekend." };
    }
    if (isWeekend && hour >= 6 && hour < 12) {
        return { id: 'sat_morning', name: "Easy Weekend Morning", genres: [16, 10751], description: "Animation & Family features for a slow start." };
    }
    if (isWeekend && hour >= 12 && hour < 18) {
        return { id: 'sun_afternoon', name: "Weekend Escape", genres: [12, 35], description: "Adventure & Comedy for a perfect afternoon." };
    }
    if (hour >= 0 && hour < 5) {
        return { id: 'late_night', name: "Midnight Mystery", genres: [27, 9648], description: "Horror & Mystery for the graveyard shift." };
    }
    if (hour >= 18 && hour <= 23) {
        return { id: 'weekday_eve', name: "Evening Unwind", genres: [18, 878], description: "Drama & Sci-Fi to detach from the workday." };
    }

    // Default daytime vibe
    return { id: 'daytime', name: "Daytime Distraction", genres: [35, 10749], description: "Light comedies and romance." };
};

const ALT_VIBES: VibeDefinition[] = [
    { id: 'indie_darling', name: "Indie Darlings", genres: [18, 10402], description: "Music & Drama festival hits." },
    { id: 'adrenaline', name: "Pure Adrenaline", genres: [28, 80], description: "Action & Crime." },
    { id: 'mind_bender', name: "Mind Benders", genres: [878, 53], description: "Sci-Fi & Thrillers." },
    { id: 'laugh_riot', name: "Laugh Riot", genres: [35], description: "Straight comedies." },
    { id: 'timeless_tales', name: "Timeless Tales", genres: [36, 10752, 37], description: "History, War & Western epics." },
    { id: 'magic_realms', name: "Magic Realms", genres: [14], description: "Epic Fantasy adventures." },
    { id: 'real_world', name: "Real World", genres: [99], description: "Eye-opening Documentaries." }
];

const VibeDetect = () => {
    const navigate = useNavigate();
    const [currentVibe, setCurrentVibe] = useState<VibeDefinition>(getVibeForNow());

    const { data, isLoading, isError } = useQuery({
        queryKey: ['discoverVibe', currentVibe.genres],
        queryFn: () => discoverContent({
            mediaType: 'movie',
            genres: currentVibe.genres,
            minRating: 6.5,
            sortBy: 'popularity.desc',
        }),
    });

    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const dayString = now.toLocaleDateString([], { weekday: 'long' });

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
                        <Moon className="w-32 h-32" />
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-black/40 border border-[#3A3A3C] flex items-center justify-center">
                                <Moon className="w-5 h-5 text-[#34C759]" />
                            </div>
                            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Tonight's vibe</h1>
                        </div>

                        <p className="text-[#AEAEB2] text-sm md:text-base font-medium mb-6">
                            It's {dayString} {timeString} — here's what fits.
                        </p>

                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => setCurrentVibe(getVibeForNow())}
                                className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-200 border ${currentVibe.id === getVibeForNow().id
                                    ? 'bg-[#E50914]/10 border-[#E50914] text-[#E50914] shadow-[0_0_15px_rgba(229,9,20,0.2)]'
                                    : 'bg-black/40 border-[#3A3A3C] text-[#AEAEB2] hover:text-white hover:border-[#636366]'
                                    }`}
                            >
                                {getVibeForNow().name}
                            </button>

                            {ALT_VIBES.map((vibe) => {
                                const isActive = currentVibe.id === vibe.id;
                                return (
                                    <button
                                        key={vibe.id}
                                        onClick={() => setCurrentVibe(vibe)}
                                        className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-200 border ${isActive
                                            ? 'bg-[#34C759]/10 border-[#34C759] text-[#34C759] shadow-[0_0_15px_rgba(52,199,89,0.2)]'
                                            : 'bg-black/40 border-[#3A3A3C] text-[#AEAEB2] hover:text-white hover:border-[#636366]'
                                            }`}
                                    >
                                        {vibe.name}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-6 pt-6 border-t border-[#3A3A3C]/50 flex items-center gap-2 text-[#AEAEB2]">
                            <span className="text-[#636366]">→</span>
                            <p className="text-sm font-medium">{currentVibe.description}</p>
                            <span className="ml-auto text-[10px] uppercase font-bold tracking-widest text-[#636366]">Auto-detected from your device time</span>
                        </div>
                    </div>
                </div>

                {/* Results Grid */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tight">{currentVibe.name} Match</h2>
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
                                Failed to load vibe matches. Please check your API connection.
                            </div>
                        ) : data?.results?.length === 0 ? (
                            <div className="col-span-full py-12 text-center text-[#AEAEB2]">
                                No matches found for this vibe.
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

export default VibeDetect;
