import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RoomCardProps {
    id: string;
    title: string;
    posterPath: string;
    watchers: number;
    startedMinsAgo: number;
}

const RoomCard = ({ id, title, posterPath, watchers, startedMinsAgo }: RoomCardProps) => {
    return (
        <div className="flex gap-4 p-5 rounded-xl bg-[#1C1C1E] border border-[#3A3A3C] transition-all hover:border-[#636366]">
            {/* Poster */}
            <div className="relative shrink-0">
                <img
                    src={posterPath}
                    alt={title}
                    className="w-[48px] h-[72px] object-cover rounded-md bg-[#2C2C2E]"
                />
                {/* LIVE indicator */}
                <div className="absolute -top-1.5 -left-1.5 flex items-center justify-center">
                    <span className="absolute w-3 h-3 bg-[#34C759] rounded-full animate-ping opacity-75" />
                    <span className="relative w-2.5 h-2.5 bg-[#34C759] rounded-full border border-[#1C1C1E]" />
                </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <h3 className="text-white font-bold text-base truncate">{title}</h3>
                <p className="text-[#AEAEB2] text-sm mt-0.5">{watchers} friends watching</p>
                <p className="text-[#636366] text-xs mt-0.5">Started {startedMinsAgo} mins ago</p>
            </div>

            {/* Avatars & CTA */}
            <div className="flex items-center gap-4 shrink-0">
                {/* Avatar cluster */}
                <div className="hidden sm:flex -space-x-2">
                    {["A", "B", "C"].map((initial, i) => (
                        <div
                            key={initial}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-[#1C1C1E] z-${30 - i * 10}`}
                            style={{ backgroundColor: i === 0 ? "#00B4D8" : i === 1 ? "#BF5AF2" : "#FF9F0A" }}
                        >
                            {initial}
                        </div>
                    ))}
                    {watchers > 3 && (
                        <div className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[10px] font-bold text-[#AEAEB2] border-2 border-[#1C1C1E] z-0">
                            +{watchers - 3}
                        </div>
                    )}
                </div>

                <Link to={`/social/room/${id}`}>
                    <Button variant="outline" className="border-[#E50914] text-[#E50914] hover:bg-[#E50914]/10 hover:text-[#E50914]">
                        Join Room
                    </Button>
                </Link>
            </div>
        </div>
    );
};

export default RoomCard;
