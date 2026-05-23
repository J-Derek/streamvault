import Navbar from "@/components/Navbar";
import { Clock, ThumbsUp, Moon, ArrowLeftRight, Hash, Diamond, ChevronLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

const discoverModes = [
    {
        id: "time",
        title: "I have X minutes",
        description: "Find titles that fit your exact time window",
        badge: "Most wanted",
        badgeColor: "bg-[#00B4D8]/20 text-[#00B4D8]", // Teal
        icon: Clock,
        iconColor: "text-[#F5C518]", // Gold
        path: "/discover/time",
        borderHover: "hover:border-[#E50914]",
    },
    {
        id: "recommendations",
        title: "Because you liked...",
        description: "Pick a title, find 20 titles just like it",
        badge: "TMDB recs",
        badgeColor: "bg-[#34C759]/20 text-[#34C759]", // Green
        icon: ThumbsUp,
        iconColor: "text-[#00B4D8]", // Teal
        path: "/discover/recommendations",
        borderHover: "hover:border-white/50",
    },
    {
        id: "vibe",
        title: "Tonight's vibe",
        description: "Auto-suggests based on time and day",
        badge: "Context-aware",
        badgeColor: "bg-[#00B4D8]/20 text-[#00B4D8]", // Teal
        icon: Moon,
        iconColor: "text-[#34C759]", // Green
        path: "/discover/vibe",
        borderHover: "hover:border-white/50",
    },
    {
        id: "swipe",
        title: "Swipe to match",
        description: "Tinder-style — swipe 10 posters, get results",
        badge: "Unique",
        badgeColor: "bg-[#00B4D8]/20 text-[#00B4D8]", // Teal
        icon: ArrowLeftRight,
        iconColor: "text-[#E50914]", // Red
        path: "/discover/swipe",
        borderHover: "hover:border-white/50",
    },
    {
        id: "keywords",
        title: "Explore by keyword",
        description: "time-travel, plot-twist, slow-burn...",
        badge: "Precise",
        badgeColor: "bg-[#34C759]/20 text-[#34C759]", // Green
        icon: Hash,
        iconColor: "text-white",
        path: "/discover/keywords",
        borderHover: "hover:border-white/50",
    },
    {
        id: "hidden-gems",
        title: "Hidden gems",
        description: "High rated, low views — films most miss",
        badge: "Underrated",
        badgeColor: "bg-[#34C759]/20 text-[#34C759]", // Green
        icon: Diamond,
        iconColor: "text-[#34C759]", // Green
        path: "/discover/hidden-gems",
        borderHover: "hover:border-white/50",
    }
];

const Discover = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#0D0D0D] font-sans selection:bg-[#E50914] selection:text-white">
            <Navbar />

            <main className="pt-24 pb-20 px-4 md:px-8 max-w-[1200px] mx-auto animate-fade-in">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-[#AEAEB2] hover:text-white mb-4 transition-colors group"
                >
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-semibold text-sm">Back</span>
                </button>
                <div className="mb-10">
                    <p className="text-[#636366] text-xs font-bold uppercase tracking-widest mb-2">Redesigned Discover — 6 Discovery Modes</p>
                    <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">How do you want to find your next favorite?</h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {discoverModes.map((mode) => {
                        const Icon = mode.icon;
                        // The "I have X minutes" card in the mockup has a red border by default, others are gray.
                        const isFeatured = mode.id === "time";

                        return (
                            <Link
                                key={mode.id}
                                to={mode.path}
                                className={`group relative flex flex-col p-6 rounded-2xl bg-[#1C1C1E] border ${isFeatured ? 'border-[#E50914]' : 'border-[#3A3A3C]'} ${mode.borderHover} transition-all duration-300 md:hover:-translate-y-1 shadow-lg overflow-hidden`}
                            >
                                {/* Background glow on hover */}
                                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                <div className={`w-10 h-10 rounded-lg bg-black/40 flex items-center justify-center mb-6 border border-[#3A3A3C]`}>
                                    <Icon className={`w-5 h-5 ${mode.iconColor}`} />
                                </div>

                                <h2 className="text-xl font-bold text-white mb-2">{mode.title}</h2>
                                <p className="text-[#AEAEB2] text-sm leading-relaxed mb-6 flex-grow">{mode.description}</p>

                                <div className="mt-auto">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${mode.badgeColor}`}>
                                        {mode.badge}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </main>
        </div>
    );
};

export default Discover;
