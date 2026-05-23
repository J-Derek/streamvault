import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { getGenres } from "@/lib/tmdb";

const CURRENT_YEAR = new Date().getFullYear();

const DURATION_OPTIONS = [
    { value: "under90", label: "Under 90 min" },
    { value: "90to150", label: "90 – 150 min" },
    { value: "over150", label: "Over 150 min" },
];

const TYPE_OPTIONS = [
    { value: "", label: "All" },
    { value: "movie", label: "Movies" },
    { value: "tv", label: "TV Shows" },
];

const STATUS_OPTIONS = [
    { value: "completed", label: "Completed" },
    { value: "ongoing", label: "Ongoing" },
    { value: "leaving", label: "Leaving Soon" },
];

const FilterPanel = () => {
    const [params, setParams] = useSearchParams();

    const { data: genreData } = useQuery({
        queryKey: ["genres", "movie"],
        queryFn: () => getGenres("movie"),
    });

    // Helpers to read/write params
    const getType = () => params.get("type") ?? "";
    const getGenres_ = () =>
        params
            .get("genres")
            ?.split(",")
            .filter(Boolean)
            .map(Number) ?? [];
    const getRating = () => Number(params.get("rating") ?? 0);
    const getDuration = () => params.get("duration") ?? "";
    const getYearFrom = () => Number(params.get("yearFrom") ?? 1970);
    const getYearTo = () => Number(params.get("yearTo") ?? CURRENT_YEAR);
    const getStatuses = () =>
        params
            .get("status")
            ?.split(",")
            .filter(Boolean) ?? [];

    const setParam = (key: string, value: string) => {
        const next = new URLSearchParams(params);
        if (value) {
            next.set(key, value);
        } else {
            next.delete(key);
        }
        next.delete("page");
        setParams(next);
    };

    const toggleGenre = (id: number) => {
        const current = getGenres_();
        const next = current.includes(id)
            ? current.filter((g) => g !== id)
            : [...current, id];
        setParam("genres", next.join(","));
    };

    const toggleStatus = (value: string) => {
        const current = getStatuses();
        const next = current.includes(value)
            ? current.filter((s) => s !== value)
            : [...current, value];
        setParam("status", next.join(","));
    };

    const clearAll = () => setParams(new URLSearchParams());

    const hasFilters =
        getType() || getGenres_().length > 0 || getRating() > 0 ||
        getDuration() || getYearFrom() > 1970 || getYearTo() < CURRENT_YEAR ||
        getStatuses().length > 0;

    return (
        <aside className="w-full flex flex-col gap-6 text-white">
            {/* Content Type */}
            <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#636366] mb-3">Content Type</h3>
                <div className="flex flex-col gap-2">
                    {TYPE_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => setParam("type", opt.value)}
                            className={`text-left px-3 py-2 rounded-md text-sm font-medium transition-all ${getType() === opt.value
                                    ? "bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/40"
                                    : "text-[#AEAEB2] hover:text-white hover:bg-[#2C2C2E]"
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Genres */}
            <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#636366] mb-3">Genre</h3>
                <div className="flex flex-wrap gap-2">
                    {genreData?.genres.map((genre) => {
                        const selected = getGenres_().includes(genre.id);
                        return (
                            <button
                                key={genre.id}
                                onClick={() => toggleGenre(genre.id)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${selected
                                        ? "bg-[#E50914] text-white border-[#E50914]"
                                        : "bg-[#1C1C1E] text-[#AEAEB2] border-[#3A3A3C] hover:border-[#636366] hover:text-white"
                                    }`}
                            >
                                {genre.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Rating */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#636366]">Rating</h3>
                    <span className="text-sm font-medium text-[#F5C518]">
                        ★ {getRating().toFixed(1)} and above
                    </span>
                </div>
                <Slider
                    min={0}
                    max={10}
                    step={0.5}
                    value={[getRating()]}
                    onValueChange={([val]) => setParam("rating", val > 0 ? String(val) : "")}
                    className="[&_[data-orientation=horizontal]]:bg-[#3A3A3C] [&_[role=slider]]:bg-[#E50914] [&_.range]:bg-[#E50914]"
                />
            </div>

            {/* Duration */}
            <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#636366] mb-3">Duration</h3>
                <div className="flex flex-col gap-2">
                    {DURATION_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => setParam("duration", getDuration() === opt.value ? "" : opt.value)}
                            className={`text-left px-3 py-2 rounded-md text-sm font-medium transition-all ${getDuration() === opt.value
                                    ? "bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/40"
                                    : "text-[#AEAEB2] hover:text-white hover:bg-[#2C2C2E]"
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Status */}
            <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#636366] mb-3">Status</h3>
                <div className="flex flex-col gap-2">
                    {STATUS_OPTIONS.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                            <Checkbox
                                id={`status-${opt.value}`}
                                checked={getStatuses().includes(opt.value)}
                                onCheckedChange={() => toggleStatus(opt.value)}
                                className="border-[#3A3A3C] data-[state=checked]:bg-[#E50914] data-[state=checked]:border-[#E50914]"
                            />
                            <span className="text-sm text-[#AEAEB2] group-hover:text-white transition-colors">
                                {opt.label}
                            </span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Year Range */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#636366]">Year Range</h3>
                    <span className="text-sm text-[#AEAEB2]">
                        {getYearFrom()} — {getYearTo()}
                    </span>
                </div>
                <Slider
                    min={1970}
                    max={CURRENT_YEAR}
                    step={1}
                    value={[getYearFrom(), getYearTo()]}
                    onValueChange={([from, to]) => {
                        const next = new URLSearchParams(params);
                        if (from > 1970) next.set("yearFrom", String(from)); else next.delete("yearFrom");
                        if (to < CURRENT_YEAR) next.set("yearTo", String(to)); else next.delete("yearTo");
                        next.delete("page");
                        setParams(next);
                    }}
                    className="[&_[data-orientation=horizontal]]:bg-[#3A3A3C] [&_[role=slider]]:bg-[#E50914] [&_.range]:bg-[#E50914]"
                />
            </div>

            {/* Clear All */}
            {hasFilters && (
                <Button
                    variant="ghost"
                    onClick={clearAll}
                    className="w-full text-[#AEAEB2] hover:text-[#E50914] border border-[#3A3A3C] hover:border-[#E50914]/40 transition-all gap-2"
                >
                    <X className="w-4 h-4" />
                    Clear All Filters
                </Button>
            )}
        </aside>
    );
};

export default FilterPanel;
