import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, X, ChevronLeft, Bookmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import WatchlistCard from "@/components/watchlist/WatchlistCard";
import { useWatchlist, type WatchStatus } from "@/store/watchlist";

type SortOption = "date" | "rating" | "alpha" | "leaving";

const STATUS_TABS: { value: WatchStatus; label: string }[] = [
    { value: "want", label: "Want to Watch" },
    { value: "watching", label: "Watching" },
    { value: "done", label: "Done" },
    { value: "paused", label: "Paused" },
];

const EMPTY_MESSAGES: Record<WatchStatus, { text: string; sub: string }> = {
    want: { text: "No pending titles.", sub: "Add titles from browse or search to plan your next watch!" },
    watching: { text: "No active watches.", sub: "Resume watching titles from where you left off!" },
    done: { text: "No completed titles yet.", sub: "Finish titles in your library to mark them complete." },
    paused: { text: "No paused titles.", sub: "Temporarily pause active titles and they'll show here." },
};

const WatchlistPage = () => {
    const { items, updateStatus, removeItem } = useWatchlist();
    const [sort, setSort] = useState<SortOption>("date");
    const [checked, setChecked] = useState<Set<number>>(new Set());
    const [bulkTarget, setBulkTarget] = useState<WatchStatus>("want");

    const toggleCheck = (id: number) => {
        setChecked(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const getItems = (status: WatchStatus) => {
        let list = items.filter(i => i.status === status);
        // Leaving soon always floats to top
        list = [
            ...list.filter(i => i.leavingSoon),
            ...list.filter(i => !i.leavingSoon),
        ];
        if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
        if (sort === "alpha") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
        // "leaving" sort — leaving items already floated to top
        return list;
    };

    const bulkMoveSelected = () => {
        checked.forEach(id => updateStatus(id, bulkTarget));
        setChecked(new Set());
    };

    const bulkRemoveSelected = () => {
        checked.forEach(id => removeItem(id));
        setChecked(new Set());
    };

    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#0D0D0D]">
            <Navbar />
            <div className="pt-24 pb-32 px-4 max-w-[900px] mx-auto">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-[#AEAEB2] hover:text-white mb-4 transition-colors group"
                >
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-semibold text-sm">Back</span>
                </button>

                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-white text-[28px] font-bold">My Watchlist</h1>
                    <p className="text-[#AEAEB2] mt-1">{items.length} title{items.length !== 1 ? "s" : ""}</p>
                </div>

                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in max-w-md mx-auto">
                        <div className="w-20 h-20 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-6 border border-[#3A3A3C]/40 shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                            <Bookmark className="w-10 h-10 text-[#636366]" />
                        </div>
                        <h2 className="text-xl font-bold mb-2 text-white">Your Watchlist is Empty</h2>
                        <p className="text-[#AEAEB2] text-sm max-w-sm mb-8 leading-relaxed">
                            Keep track of movies and TV shows you want to watch, are currently watching, or have already completed.
                        </p>
                        <Button asChild className="bg-[#E50914] hover:bg-[#B00610] text-white px-8 h-11 rounded-md text-sm font-semibold transition-all shadow-[0_4px_14px_rgba(229,9,20,0.4)] hover:shadow-[0_6px_20px_rgba(229,9,20,0.6)]">
                            <Link to="/browse">Discover Media</Link>
                        </Button>
                    </div>
                ) : (
                    <Tabs defaultValue="want">
                        {/* Tab bar */}
                        <TabsList className="w-full justify-start bg-[#1C1C1E] border-b border-[#3A3A3C] rounded-none px-0 h-auto mb-0">
                            {STATUS_TABS.map(({ value, label }) => (
                                <TabsTrigger
                                    key={value}
                                    value={value}
                                    className="px-4 py-3 rounded-none data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-[#E50914] data-[state=inactive]:text-[#AEAEB2] bg-transparent hover:text-white transition-colors text-sm"
                                >
                                    {label} ({items.filter(i => i.status === value).length})
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        {/* Controls row */}
                        <div className="flex items-center justify-between py-4 border-b border-[#3A3A3C]">
                            <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                                <SelectTrigger className="w-[180px] bg-[#1C1C1E] border-[#3A3A3C] text-white h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white">
                                    <SelectItem value="date" className="hover:bg-[#2C2C2E] focus:bg-[#2C2C2E]">Date Added</SelectItem>
                                    <SelectItem value="rating" className="hover:bg-[#2C2C2E] focus:bg-[#2C2C2E]">Rating</SelectItem>
                                    <SelectItem value="alpha" className="hover:bg-[#2C2C2E] focus:bg-[#2C2C2E]">A–Z</SelectItem>
                                    <SelectItem value="leaving" className="hover:bg-[#2C2C2E] focus:bg-[#2C2C2E]">Leaving Soonest</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Tab content */}
                        {STATUS_TABS.map(({ value }) => {
                            const list = getItems(value);
                            const empty = EMPTY_MESSAGES[value];
                            return (
                                <TabsContent key={value} value={value} className="mt-4 space-y-3">
                                    {list.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
                                            <p className="text-white text-lg font-medium">{empty.text}</p>
                                            {empty.sub && <p className="text-[#AEAEB2] text-sm max-w-xs leading-relaxed">{empty.sub}</p>}
                                            {value === "want" && (
                                                <Link to="/browse">
                                                    <Button className="bg-[#E50914] hover:bg-[#B00610] text-white mt-4 h-9 px-6 font-semibold">Browse Titles</Button>
                                                </Link>
                                            )}
                                        </div>
                                    ) : (
                                        list.map((item) => (
                                            <WatchlistCard
                                                key={item.id}
                                                id={item.id}
                                                checked={checked.has(item.id)}
                                                onCheck={toggleCheck}
                                            />
                                        ))
                                    )}
                                </TabsContent>
                            );
                        })}
                    </Tabs>
                )}
            </div>

            {/* Bulk action bar */}
            {checked.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#1C1C1E] border-t border-[#3A3A3C] px-4 py-3 flex items-center justify-between">
                    <span className="text-white font-medium">{checked.size} selected</span>
                    <div className="flex items-center gap-3">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="gap-1 bg-[#2C2C2E] border-[#3A3A3C] text-white hover:bg-[#3A3A3C] text-sm">
                                    Move to <ChevronDown className="w-3 h-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white">
                                {STATUS_TABS.map(({ value, label }) => (
                                    <DropdownMenuItem key={value} onClick={() => { setBulkTarget(value); bulkMoveSelected(); }} className="hover:bg-[#2C2C2E] cursor-pointer">
                                        {label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button onClick={bulkRemoveSelected} className="gap-1 bg-[#E50914] hover:bg-[#B00610] text-white text-sm">
                            <X className="w-3 h-3" /> Remove
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WatchlistPage;
