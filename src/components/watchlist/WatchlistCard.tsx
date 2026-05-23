import { Link } from "react-router-dom";
import { Play, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { posterUrl } from "@/lib/tmdb";
import { useWatchlist, type WatchStatus } from "@/store/watchlist";

const STATUS_LABELS: Record<WatchStatus, string> = {
    want: "Want to Watch",
    watching: "Watching",
    done: "Done",
    paused: "Paused",
};

interface WatchlistCardProps {
    id: number;
    checked?: boolean;
    onCheck?: (id: number) => void;
}

const WatchlistCard = ({ id, checked = false, onCheck }: WatchlistCardProps) => {
    const { getItem, removeItem, updateStatus } = useWatchlist();
    const item = getItem(id);
    if (!item) return null;

    return (
        <div className={`flex gap-4 p-4 rounded-xl border transition-all ${checked ? "bg-[#1C1C1E] border-[#E50914]/40" : "bg-[#1C1C1E] border-[#3A3A3C] hover:border-[#636366]"
            }`}>
            {/* Checkbox on hover */}
            <div className="relative shrink-0">
                <img
                    src={posterUrl(item.posterPath, "w92")}
                    alt={item.title}
                    className="w-[60px] h-[90px] object-cover rounded-lg bg-[#2C2C2E]"
                />
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onCheck?.(id)}
                    className="absolute top-1 left-1 w-4 h-4 rounded accent-[#E50914] opacity-0 hover:opacity-100 focus:opacity-100 cursor-pointer"
                    style={{ opacity: checked ? 1 : undefined }}
                    aria-label={`Select ${item.title}`}
                />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 py-1">
                <div className="flex items-start gap-2 flex-wrap">
                    <h3 className="text-white font-semibold text-[15px] truncate">{item.title}</h3>
                    {item.year && <span className="text-[#AEAEB2] text-sm">({item.year})</span>}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {item.genres.slice(0, 2).map((g) => (
                        <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-[#2C2C2E] text-[#AEAEB2] border border-[#3A3A3C]">{g}</span>
                    ))}
                    {item.leavingSoon && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]/30 font-semibold">
                            Leaving Soon
                        </span>
                    )}
                </div>
                {item.status === "watching" && item.progress && (
                    <p className="text-[#00B4D8] text-xs mt-1">{item.progress}</p>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
                <Link to={`/watch/${item.id}`}>
                    <Button size="sm" className="gap-1 bg-[#E50914] hover:bg-[#B00610] text-white h-8 text-xs">
                        <Play className="w-3 h-3 fill-current" /> Play
                    </Button>
                </Link>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 bg-[#2C2C2E] border-[#3A3A3C] text-white hover:bg-[#3A3A3C] h-8 text-xs">
                            Move to <ChevronDown className="w-3 h-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white">
                        {(Object.entries(STATUS_LABELS) as [WatchStatus, string][])
                            .filter(([s]) => s !== item.status)
                            .map(([s, label]) => (
                                <DropdownMenuItem key={s} onClick={() => updateStatus(id, s)} className="hover:bg-[#2C2C2E] cursor-pointer">
                                    {label}
                                </DropdownMenuItem>
                            ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-[#636366] hover:text-[#E50914] h-8 w-8">
                            <X className="w-4 h-4" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white">
                        <AlertDialogHeader>
                            <AlertDialogTitle>Remove from watchlist?</AlertDialogTitle>
                            <AlertDialogDescription className="text-[#AEAEB2]">
                                "{item.title}" will be removed from your list.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="bg-[#2C2C2E] border-[#3A3A3C] text-white hover:bg-[#3A3A3C]">Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeItem(id)} className="bg-[#E50914] hover:bg-[#B00610] text-white">
                                Remove
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
};

export default WatchlistCard;
