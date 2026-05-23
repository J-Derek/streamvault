import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Play, SkipForward, Pause, Mic, Users, Send, Copy, ExternalLink, Server, Tv, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSocialStore } from "@/store/social";
import { useToast } from "@/hooks/use-toast";
import { useRoomSync } from "@/hooks/useRoomSync";
import { PROVIDERS } from "@/lib/tmdb-types";

const EMOJIS = ["👍", "😂", "😱", "❤️", "🔥"];
const PARTICIPANT_COLORS = ["#00B4D8", "#BF5AF2", "#FF9F0A", "#34C759", "#FF453A", "#FFD60A", "#64D2FF", "#30D158"];

function buildEmbedUrl(provider: typeof PROVIDERS[number], contentId: string, mediaType: "movie" | "tv", season?: number, episode?: number): string {
    const isMovie = mediaType === "movie";
    const fmt = (provider as any).urlFormat || "vidsrc-v2";
    if (fmt === "vidsrc-v2") {
        return isMovie
            ? `https://${provider.domain}/v2/embed/movie/${contentId}`
            : `https://${provider.domain}/v2/embed/tv/${contentId}/${season || 1}/${episode || 1}`;
    } else if (fmt === "vidsrc-path") {
        return isMovie
            ? `https://${provider.domain}/embed/movie/${contentId}`
            : `https://${provider.domain}/embed/tv/${contentId}/${season || 1}/${episode || 1}`;
    } else if (fmt === "embed-su") {
        return isMovie
            ? `https://embed.su/embed/movie/${contentId.replace("tt", "")}`
            : `https://embed.su/embed/tv/${contentId.replace("tt", "")}/${season || 1}/${episode || 1}`;
    }
    return "";
}

const SocialRoomPage = () => {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { rooms, nickname, joinRoom, leaveRoom } = useSocialStore();
    const room = rooms.find((r) => r.id === roomId);
    const randomColor = PARTICIPANT_COLORS[Math.floor(Math.random() * PARTICIPANT_COLORS.length)];

    const {
        connected,
        participants,
        messages,
        reactions: incomingReactions,
        playbackEvent,
        sendChat,
        sendReaction,
        sendPlayback,
    } = useRoomSync({
        roomId: roomId || "",
        nickname,
        initial: nickname[0].toUpperCase(),
        color: randomColor,
    });

    const [chatInput, setChatInput] = useState("");
    const [localFloatingEmojis, setLocalFloatingEmojis] = useState<{ id: number; emoji: string; x: number }[]>([]);
    const emojiIdCounter = useRef(0);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Video state
    const [activeSource, setActiveSource] = useState<{ url: string; label: string } | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showSourcePicker, setShowSourcePicker] = useState(false);
    const [joinedStream, setJoinedStream] = useState(false);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Auto-join local store room on mount
    const hasJoined = useRef(false);
    useEffect(() => {
        if (!room || hasJoined.current) return;
        hasJoined.current = true;
        const alreadyIn = room.participants.some((p) => p.name === nickname);
        if (!alreadyIn) {
            joinRoom(room.id, {
                name: nickname,
                initial: nickname[0].toUpperCase(),
                color: randomColor,
                joinedAt: Date.now(),
            });
        }
    }, [room?.id, nickname]);

    useEffect(() => {
        return () => {
            if (roomId && hasJoined.current) {
                leaveRoom(roomId, nickname);
            }
        };
    }, []);

    // Handle incoming reactions
    useEffect(() => {
        if (incomingReactions.length > 0) {
            const latest = incomingReactions[incomingReactions.length - 1];
            setLocalFloatingEmojis((prev) => [...prev, {
                id: emojiIdCounter.current++,
                emoji: latest.emoji,
                x: Math.random() * 80 + 10,
            }]);
            setTimeout(() => {
                setLocalFloatingEmojis((prev) => prev.filter(e => e.id !== emojiIdCounter.current - 1));
            }, 3000);
        }
    }, [incomingReactions]);

    // Handle incoming playback events (non-host clients auto-join stream)
    useEffect(() => {
        if (!playbackEvent || !room || !activeSource) return;
        if (playbackEvent.action === "play" && !joinedStream) {
            toast({
                title: `${playbackEvent.nickname} started playback`,
                description: "Stream is now active",
            });
        }
    }, [playbackEvent]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        sendChat(chatInput.trim());
        setChatInput("");
    };

    const handleReaction = (emoji: string) => {
        sendReaction(emoji);
        const newEmoji = { id: emojiIdCounter.current++, emoji, x: Math.random() * 80 + 10 };
        setLocalFloatingEmojis((prev) => [...prev, newEmoji]);
        setTimeout(() => {
            setLocalFloatingEmojis((prev) => prev.filter(e => e.id !== newEmoji.id));
        }, 3000);
    };

    const handleCopyLink = () => {
        const link = `${window.location.origin}/social/room/${roomId}`;
        navigator.clipboard.writeText(link);
        toast({ title: "Invite link copied!" });
    };

    const handleSelectSource = (provider: typeof PROVIDERS[number]) => {
        if (!room) return;
        const contentId = room.imdbId;
        const url = buildEmbedUrl(provider, contentId, room.mediaType);
        if (!url) {
            toast({ title: "Invalid source", variant: "destructive" });
            return;
        }
        setActiveSource({ url, label: provider.name });
        setShowSourcePicker(false);
        setJoinedStream(true);
        setIsPlaying(true);
        sendPlayback("play", 0);
        toast({ title: `Streaming via ${provider.name}` });
    };

    const handlePauseStream = () => {
        setIsPlaying(false);
        sendPlayback("pause", 0);
    };

    const sourceProviders = PROVIDERS.filter(p => p.id !== "torrentio");

    if (!room) {
        return (
            <div className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center text-white gap-4 p-4">
                <p className="text-2xl font-bold">Room not found</p>
                <p className="text-[#AEAEB2] text-sm text-center">This room may have been deleted or the link is invalid.</p>
                <Button onClick={() => navigate("/social")} variant="outline" className="mt-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Social Hub
                </Button>
            </div>
        );
    }

    const hasVideo = activeSource && joinedStream;

    return (
        <div className="flex flex-col lg:flex-row h-screen bg-[#0D0D0D] overflow-hidden">
            {/* Left Panel: Video & Controls */}
            <div className="flex-1 flex flex-col h-[50vh] lg:h-full border-r border-[#3A3A3C] relative overflow-hidden">
                {/* Header */}
                <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-[#0D0D0D]/90 to-transparent">
                    <Button
                        variant="ghost"
                        onClick={() => navigate("/social")}
                        className="text-[#AEAEB2] hover:text-white gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> Leave Room
                    </Button>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${connected ? "bg-[#34C759]" : "bg-[#FF453A]"} animate-pulse`} />
                            <span className="text-[10px] text-[#AEAEB2] hidden sm:inline">{connected ? "Live" : "Offline"}</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyLink}
                            className="text-[#AEAEB2] hover:text-white gap-1.5 text-xs px-3"
                        >
                            <Copy className="w-3.5 h-3.5" /> Invite
                        </Button>
                        <LinkToMovie imdbId={room.imdbId} title={room.title} />
                    </div>
                </div>

                {/* Video Area */}
                <div className="flex-1 bg-[#1C1C1E] flex flex-col items-center justify-center relative overflow-hidden">
                    {hasVideo ? (
                        <>
                            <iframe
                                src={activeSource.url}
                                className="absolute inset-0 w-full h-full border-none"
                                allowFullScreen
                                allow="autoplay; encrypted-media; clipboard-read; clipboard-write"
                                referrerPolicy="no-referrer"
                            />
                            {/* Sync overlay */}
                            <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-[#0D0D0D]/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] text-[#AEAEB2] flex items-center gap-2 whitespace-nowrap">
                                <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#34C759]" : "bg-[#FF453A]"}`} />
                                {connected ? "Synced — " : "Offline — "}
                                {participants.length || room.participants.length} watching
                                <span className="hidden sm:inline">· {activeSource.label}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Poster placeholder */}
                            <img
                                src={room.poster}
                                alt={room.title}
                                className="w-32 h-48 md:w-40 md:h-60 object-cover rounded-xl opacity-40 mb-4"
                            />
                            <p className="text-white font-bold text-lg text-center px-4">{room.title}</p>
                            <p className="text-[#AEAEB2] text-sm mt-1">
                                {connected ? "Waiting for the host to start..." : "Connecting to relay server..."}
                            </p>

                            {/* Start Watching / Select Source button */}
                            {!showSourcePicker ? (
                                <Button
                                    onClick={() => setShowSourcePicker(true)}
                                    className="mt-6 bg-[#E50914] hover:bg-[#B00610] text-white gap-2"
                                >
                                    <Play className="w-4 h-4 fill-current" /> Start Watching
                                </Button>
                            ) : (
                                <div className="mt-6 flex flex-col items-center gap-2">
                                    <p className="text-[#AEAEB2] text-xs uppercase tracking-widest font-bold mb-1">Choose a source</p>
                                    <div className="flex flex-wrap gap-2 justify-center px-4">
                                        {sourceProviders.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => handleSelectSource(p)}
                                                className="px-4 py-2 rounded-lg bg-[#2C2C2E] border border-[#3A3A3C] text-white text-sm hover:bg-[#3A3A3C] hover:border-[#636366] transition-all"
                                            >
                                                {p.name}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setShowSourcePicker(false)}
                                        className="text-[#636366] text-xs mt-2 hover:text-[#AEAEB2]"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                            {/* Floating emojis */}
                            {localFloatingEmojis.map((anim) => (
                                <div
                                    key={anim.id}
                                    className="absolute bottom-0 text-4xl animate-float-up pointer-events-none select-none z-20"
                                    style={{ left: `${anim.x}%` }}
                                >
                                    {anim.emoji}
                                </div>
                            ))}
                        </>
                    )}
                </div>

                {/* Room Controls Bar */}
                <div className="h-16 bg-[#0D0D0D] border-t border-[#3A3A3C] flex items-center justify-between px-4 lg:px-8 shrink-0">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#636366]">
                            {connected ? "Connected" : "Reconnecting..."}
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        {hasVideo ? (
                            <button
                                onClick={() => {
                                    if (isPlaying) {
                                        handlePauseStream();
                                    } else {
                                        setIsPlaying(true);
                                        sendPlayback("play", 0);
                                    }
                                }}
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-[#2C2C2E] transition-colors"
                            >
                                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                            </button>
                        ) : (
                            <button
                                onClick={() => setShowSourcePicker(true)}
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-[#2C2C2E] transition-colors"
                            >
                                <Play className="w-5 h-5 fill-current" />
                            </button>
                        )}
                        <div className="w-px h-6 bg-[#3A3A3C] mx-2" />
                        <button className="w-10 h-10 rounded-full flex items-center justify-center text-[#AEAEB2] hover:text-white hover:bg-[#2C2C2E] transition-colors" aria-label="Voice chat (coming soon)">
                            <Mic className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-2 text-[#AEAEB2]">
                        <Users className="w-4 h-4" />
                        <span className="text-sm font-medium">{participants.length || room.participants.length}</span>
                    </div>
                </div>
            </div>

            {/* Right Panel: Chat & Reactions */}
            <div className="w-full lg:w-[350px] lg:shrink-0 flex flex-col h-[50vh] lg:h-full bg-[#1C1C1E]">
                <div className="h-14 border-b border-[#3A3A3C] flex items-center px-4 shrink-0">
                    <h2 className="text-white font-bold text-lg">
                        Chat{" "}
                        <span className="text-[#AEAEB2] text-sm font-normal ml-1">
                            ({participants.length || room.participants.length})
                        </span>
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 && (
                        <p className="text-[#636366] text-sm text-center pt-8">No messages yet. Say hello!</p>
                    )}
                    {messages.map((msg) => {
                        const isMe = msg.name === nickname;
                        const isSystem = msg.text === "joined the room" || msg.text === "left the room";
                        return (
                            <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                                {!isMe && !isSystem && (
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-1"
                                        style={{ backgroundColor: msg.color }}
                                    >
                                        {msg.initial}
                                    </div>
                                )}
                                <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[85%]`}>
                                    {!isSystem && (
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <span className="text-white text-xs font-bold">{msg.name}</span>
                                            <span className="text-[#636366] text-[10px]">{msg.time}</span>
                                        </div>
                                    )}
                                    <div className={`text-sm ${isSystem ? "text-[#636366] italic text-xs w-full text-center" : isMe ? "bg-[#E50914] text-white rounded-2xl rounded-tr-sm px-4 py-2" : "bg-[#2C2C2E] text-white rounded-2xl rounded-tl-sm px-4 py-2"}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={chatEndRef} />
                </div>

                <div className="p-3 border-t border-[#3A3A3C] flex justify-between">
                    {EMOJIS.map((emoji) => (
                        <button
                            key={emoji}
                            onClick={() => handleReaction(emoji)}
                            className="text-2xl hover:scale-125 transition-transform active:scale-95"
                            aria-label={`React with ${emoji}`}
                        >
                            {emoji}
                        </button>
                    ))}
                </div>

                <div className="p-4 border-t border-[#3A3A3C] bg-[#0D0D0D] shrink-0">
                    <form onSubmit={handleSendMessage} className="relative">
                        <input
                            type="text"
                            placeholder="Type a message..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            className="w-full bg-[#2C2C2E] border border-[#3A3A3C] rounded-full h-11 pl-4 pr-12 text-sm text-white placeholder-[#636366] focus:border-[#E50914] outline-none"
                        />
                        <button
                            type="submit"
                            disabled={!chatInput.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-[#E50914] hover:bg-[#E50914]/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                        >
                            <Send className="w-4 h-4 ml-0.5" />
                        </button>
                    </form>
                </div>
            </div>

            <style>{`
@keyframes float-up {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(-500px) scale(1.5); opacity: 0; }
}
.animate-float-up {
  animation: float-up 3s ease-out forwards;
}
`}</style>
        </div>
    );
};

function LinkToMovie({ imdbId, title }: { imdbId: string; title: string }) {
    const navigate = useNavigate();
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/title/${imdbId}`)}
            className="text-[#AEAEB2] hover:text-white gap-1.5 text-xs px-3"
        >
            <ExternalLink className="w-3.5 h-3.5" /> View Details
        </Button>
    );
}

export default SocialRoomPage;
