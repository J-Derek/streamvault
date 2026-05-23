import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users, Plus, UserPlus, Search as SearchIcon, ChevronLeft, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import RoomCard from "@/components/social/RoomCard";
import MovieCard from "@/components/MovieCard";
import { getTrendingMovies, searchMulti, posterUrl } from "@/lib/tmdb";
import { normalizeMedia, type StreamVaultMedia } from "@/lib/tmdb-types";
import { useSocialStore } from "@/store/social";

const MOCK_ACTIVITY = [
    { id: 1, name: "Alex", initial: "A", color: "#00B4D8", action: "just finished Breaking Bad ★★★★★", time: "2 hours ago" },
    { id: 2, name: "Sarah", initial: "S", color: "#BF5AF2", action: "added Dune to their watchlist", time: "5 hours ago" },
    { id: 3, name: "Mike", initial: "M", color: "#FF9F0A", action: "is watching Shogun · S1E5", time: "yesterday" },
    { id: 4, name: "Jessica", initial: "J", color: "#34C759", action: "rated The Bear ★★★★☆", time: "2 days ago" },
];

type Tab = "rooms" | "activity" | "trending";

const SocialPage = () => {
    const { toast } = useToast();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>("rooms");
    const [trending, setTrending] = useState<StreamVaultMedia[]>([]);
    const { rooms, deleteRoom, createRoom, nickname } = useSocialStore();

    // Search modal state
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedMovie, setSelectedMovie] = useState<any | null>(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    // Invite modal state
    const [inviteInput, setInviteInput] = useState("");

    useEffect(() => {
        if (activeTab === "trending" && trending.length === 0) {
            getTrendingMovies().then((data) => {
                setTrending(data.results.slice(0, 6).map((m: any) => normalizeMedia(m, "movie")));
            }).catch(() => { });
        }
    }, [activeTab, trending.length]);

    const doSearch = useCallback((q: string) => {
        if (!q.trim()) { setSearchResults([]); return; }
        setSearchLoading(true);
        searchMulti(q).then((data) => {
            setSearchResults(data.results.filter((r: any) => r.media_type !== "person").slice(0, 5));
            setSearchLoading(false);
        }).catch(() => setSearchLoading(false));
    }, []);

    const handleSearchInput = (val: string) => {
        setSearchQuery(val);
        setSelectedMovie(null);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(val), 200);
    };

    const handleCreateRoom = () => {
        if (!selectedMovie) return;
        const room = createRoom({
            title: selectedMovie.title ?? selectedMovie.name ?? "Untitled",
            poster: posterUrl(selectedMovie.poster_path, "w185"),
            mediaType: selectedMovie.media_type === "tv" ? "tv" : "movie",
            imdbId: `tt${selectedMovie.id}`,
            createdBy: nickname,
        });
        setCreateOpen(false);
        setSearchQuery("");
        setSelectedMovie(null);
        navigate(`/social/room/${room.id}`);
    };

    const handleInvite = (e: React.FormEvent) => {
        e.preventDefault();
        toast({ title: "Invite sent!" });
        setInviteInput("");
    };

    const handleCopyInvite = (roomId: string) => {
        const link = `${window.location.origin}/social/room/${roomId}`;
        navigator.clipboard.writeText(link);
        toast({ title: "Link copied!", description: link });
    };

    const formatTimeAgo = (timestamp: number) => {
        const mins = Math.floor((Date.now() - timestamp) / 60000);
        if (mins < 1) return "Just now";
        if (mins < 60) return `${mins} min ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    };

    const roomsContent = (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-lg">Active Rooms</h2>
                {rooms.length > 0 && (
                    <span className="text-[#AEAEB2] text-xs">{rooms.length} room{rooms.length === 1 ? "" : "s"}</span>
                )}
            </div>

            {rooms.length === 0 ? (
                <div className="bg-[#1C1C1E] border border-[#3A3A3C] rounded-xl p-8 text-center">
                    <Users className="w-10 h-10 text-[#636366] mx-auto mb-3" />
                    <p className="text-white font-medium">No rooms yet</p>
                    <p className="text-[#AEAEB2] text-sm mt-1">Start watching together by creating a room.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {rooms.map((room) => (
                        <div key={room.id} className="group relative">
                            <RoomCard
                                id={room.id}
                                title={room.title}
                                posterPath={room.poster}
                                watchers={room.participants.length}
                                startedMinsAgo={Math.floor((Date.now() - room.createdAt) / 60000)}
                            />
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleCopyInvite(room.id)}
                                    className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#AEAEB2] hover:text-white hover:bg-[#3A3A3C] transition-colors"
                                    title="Copy invite link"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => deleteRoom(room.id)}
                                    className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#FF453A] hover:bg-[#FF453A]/20 transition-colors"
                                    title="Delete room"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="w-full h-14 border-dashed border-[#3A3A3C] text-[#AEAEB2] hover:bg-[#1C1C1E] hover:text-white hover:border-[#636366]">
                        <Plus className="w-5 h-5 mr-2" /> Create New Room
                    </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Start a Watch Together Room</DialogTitle>
                    </DialogHeader>
                    <div className="my-4 space-y-4">
                        {!selectedMovie ? (
                            <div className="relative">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#636366]" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search for a movie or show..."
                                    value={searchQuery}
                                    onChange={(e) => handleSearchInput(e.target.value)}
                                    className="w-full h-10 bg-[#2C2C2E] text-white placeholder-[#636366] border border-[#3A3A3C] rounded-md pl-10 pr-4 text-sm focus:border-[#E50914] outline-none"
                                />
                                {searchQuery && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#2C2C2E] border border-[#3A3A3C] rounded-md shadow-xl z-50 max-h-[200px] overflow-y-auto">
                                        {searchLoading ? (
                                            <p className="p-3 text-sm text-[#AEAEB2] text-center">Searching...</p>
                                        ) : searchResults.length > 0 ? (
                                            searchResults.map((r) => (
                                                <button
                                                    key={r.id}
                                                    onClick={() => setSelectedMovie(r)}
                                                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-[#3A3A3C] transition-colors truncate"
                                                >
                                                    {r.title ?? r.name} {r.release_date ? `(${(r.release_date).slice(0, 4)})` : ""}
                                                </button>
                                            ))
                                        ) : (
                                            <p className="p-3 text-sm text-[#AEAEB2] text-center">No results found.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-4 p-3 rounded-lg bg-[#2C2C2E] border border-[#3A3A3C]">
                                <img
                                    src={posterUrl(selectedMovie.poster_path, "w92")}
                                    alt={selectedMovie.title ?? selectedMovie.name}
                                    className="w-12 h-18 object-cover rounded bg-[#1C1C1E]"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-medium truncate">{selectedMovie.title ?? selectedMovie.name}</p>
                                    <Button variant="link" onClick={() => setSelectedMovie(null)} className="h-auto p-0 text-[#636366] hover:text-white text-xs mt-1">
                                        Change selection
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setCreateOpen(false)} className="text-[#AEAEB2] hover:text-white">Cancel</Button>
                        <Button onClick={handleCreateRoom} disabled={!selectedMovie} className="bg-[#E50914] hover:bg-[#B00610] text-white">
                            Create Room
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );

    const activityContent = (
        <div className="bg-[#1C1C1E] border border-[#3A3A3C] rounded-xl p-6 h-full flex flex-col">
            <h2 className="text-white font-bold text-lg mb-6">Friend Activity</h2>
            <div className="flex-1 overflow-y-auto space-y-0 divide-y divide-[#3A3A3C]/50">
                {MOCK_ACTIVITY.map((act) => (
                    <div key={act.id} className="py-4 first:pt-0 flex gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: act.color }}>
                            {act.initial}
                        </div>
                        <div>
                            <p className="text-sm">
                                <span className="text-white font-bold">{act.name}</span> <span className="text-[#AEAEB2]">{act.action}</span>
                            </p>
                            <p className="text-[#636366] text-xs mt-1">{act.time}</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="pt-6 mt-4 border-t border-[#3A3A3C]">
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="w-full bg-transparent border-[#3A3A3C] text-white hover:bg-[#2C2C2E]">
                            <UserPlus className="w-4 h-4 mr-2" /> Find Friends
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white sm:max-w-[400px]">
                        <DialogHeader>
                            <DialogTitle>Invite a Friend</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleInvite} className="my-4 flex gap-2">
                            <input
                                type="text"
                                placeholder="Enter a username or phone number"
                                value={inviteInput}
                                onChange={(e) => setInviteInput(e.target.value)}
                                required
                                className="flex-1 h-10 bg-[#2C2C2E] border border-[#3A3A3C] rounded-md px-3 text-sm text-white placeholder-[#636366] focus:border-[#E50914] outline-none"
                            />
                            <Button type="submit" className="bg-[#E50914] hover:bg-[#B00610] text-white">Invite</Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0D0D0D]">
            <Navbar />
            <div className="pt-24 pb-20 px-4 max-w-[1100px] mx-auto">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-[#AEAEB2] hover:text-white mb-4 transition-colors group"
                >
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-semibold text-sm">Back</span>
                </button>

                <div className="mb-8">
                    <h1 className="text-white text-[28px] font-bold">Social Hub</h1>
                    <p className="text-[#AEAEB2] mt-1">Watch movies together with friends.</p>
                </div>

                <div className="flex gap-2 mb-10 overflow-x-auto scrollbar-hide pb-2">
                    {(["rooms", "activity", "trending"] as Tab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-5 py-2 rounded-full text-sm font-medium transition-all shrink-0 ${activeTab === tab
                                    ? "bg-[#E50914] text-white"
                                    : "bg-[#1C1C1E] text-[#AEAEB2] border border-[#3A3A3C] hover:text-white hover:border-[#636366]"
                                }`}
                        >
                            {tab === "rooms" ? "My Rooms" : tab === "activity" ? "Friend Activity" : "Trending Among Friends"}
                        </button>
                    ))}
                </div>

                <div className="hidden lg:grid grid-cols-[65%_35%] gap-8 items-start h-[600px]">
                    <div className="h-full pr-4">{activeTab === "rooms" ? roomsContent : activeTab === "trending" ? (
                        <div>
                            <h2 className="text-white font-bold text-lg mb-6">What people are watching this week</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {trending.map(m => <MovieCard key={m.id} media={m} hideHover />)}
                            </div>
                        </div>
                    ) : roomsContent}</div>
                    <div className="h-full sticky top-24">{activityContent}</div>
                </div>

                <div className="lg:hidden">
                    {activeTab === "rooms" && roomsContent}
                    {activeTab === "activity" && activityContent}
                    {activeTab === "trending" && (
                        <div>
                            <h2 className="text-white font-bold text-lg mb-6">What people are watching this week</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {trending.map(m => <MovieCard key={m.id} media={m} />)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SocialPage;
