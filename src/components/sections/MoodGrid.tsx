import { useState } from "react";
import { Check } from "lucide-react";

interface Mood {
    emoji: string;
    label: string;
    params: {
        mediaType?: "movie" | "tv";
        genres?: number[];
        minRating?: number;
        maxRuntime?: number;
        minRuntime?: number;
        sortBy?: string;
    };
}

export const MOODS: Mood[] = [
    { emoji: "😂", label: "Short & Funny", params: { genres: [35], maxRuntime: 100 } },
    { emoji: "😱", label: "Edge of Seat", params: { genres: [53, 28], minRating: 7 } },
    { emoji: "😢", label: "Need a Good Cry", params: { genres: [18, 10749] } },
    { emoji: "🏆", label: "Oscar Worthy", params: { minRating: 8, sortBy: "vote_average.desc" } },
    { emoji: "🌙", label: "Late Night", params: { genres: [27, 9648] } },
    { emoji: "👨‍👩‍👧", label: "Family Night", params: { genres: [10751, 16] } },
    { emoji: "🔥", label: "Can't Stop Watching", params: { mediaType: "tv", sortBy: "popularity.desc", minRating: 8 } },
    { emoji: "🎭", label: "Deep Dive", params: { genres: [99, 36], sortBy: "vote_average.desc" } },
];

interface MoodGridProps {
    selected: string[];
    onToggle: (label: string) => void;
}

const MoodGrid = ({ selected, onToggle }: MoodGridProps) => {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {MOODS.map((mood) => {
                const isSelected = selected.includes(mood.label);
                return (
                    <button
                        key={mood.label}
                        onClick={() => onToggle(mood.label)}
                        className={`relative flex flex-col items-center justify-center gap-3 h-[140px] rounded-xl border transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] ${isSelected
                                ? "bg-[#E50914] border-[#E50914] scale-[1.02]"
                                : "bg-[#1C1C1E] border-[#3A3A3C] hover:border-[#E50914] hover:scale-[1.02]"
                            }`}
                    >
                        {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                            </div>
                        )}
                        <span className="text-4xl">{mood.emoji}</span>
                        <span className={`text-[15px] font-bold text-center px-2 ${isSelected ? "text-white" : "text-white"}`}>
                            {mood.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

export default MoodGrid;
