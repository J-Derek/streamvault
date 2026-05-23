import { Star, Check } from "lucide-react";
import { Link } from "react-router-dom";
import type { StreamVaultMedia } from "@/lib/tmdb-types";
import { posterUrl } from "@/lib/tmdb";
import { useDownloadStore } from "@/store/downloads";

const statusConfig: Record<string, { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-[#34C759]/20 text-[#34C759]" },
  ongoing: { label: "Ongoing", className: "bg-[#00B4D8]/20 text-[#00B4D8]" },
  cancelled: { label: "Cancelled", className: "bg-[#636366]/20 text-[#636366]" },
  new: { label: "New", className: "bg-[#BF5AF2]/20 text-[#BF5AF2]" },
  leaving: { label: "Leaving Soon", className: "bg-[#FF9F0A]/20 text-[#FF9F0A]" },
};

const MovieCard = ({ media, onClick, subtitle }: { media: StreamVaultMedia, onClick?: () => void, subtitle?: string }) => {
  const statusData = media.status ? statusConfig[media.status] : null;
  const isDownloaded = useDownloadStore((s) => !!s.offlineLibrary[media.id]);

  const content = (
    <>
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C1E] transition-all duration-150 ease-out group-hover:scale-105 group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
        <img
          src={posterUrl(media.posterPath, 'w342')}
          alt={media.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {/* Status badge */}
        {statusData && !subtitle && (
          <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${statusData.className}`}>
            {statusData.label}
          </span>
        )}

        {/* Downloaded badge */}
        {isDownloaded && !subtitle && (
          <div className="absolute top-2 right-2 p-1 rounded-full bg-[#E50914] shadow-lg shadow-black/50 border border-white/20" title="Downloaded / Available Offline">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D]/90 via-[#0D0D0D]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col justify-end p-3">
          <p className="text-xs text-white font-semibold">{onClick ? "Play Now" : "View Details"}</p>
        </div>
      </div>

      {/* Info */}
      <div className="mt-2 px-0.5 text-left">
        <h3 className="text-sm font-semibold text-white truncate">{media.title}</h3>
        {subtitle ? (
          <p className="text-[10px] font-bold text-[#636366] uppercase mt-0.5">{subtitle}</p>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-[#F5C518] text-[#F5C518]" />
              <span className="text-xs font-medium text-[#F5C518] tabular-nums">{media.rating ? media.rating.toFixed(1) : "NR"}</span>
            </div>
            {media.year && <span className="text-xs text-[#AEAEB2]">{media.year}</span>}
          </div>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className="group relative flex-shrink-0 w-full cursor-pointer block">
        {content}
      </button>
    );
  }

  return (
    <Link to={`/title/${media.id}?type=${media.mediaType}`} className="group relative flex-shrink-0 w-[160px] md:w-[180px] cursor-pointer block">
      {content}
    </Link>
  );
};

export default MovieCard;
