import React, { useEffect, useState, useRef } from "react";
import { Play, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDownloadStore } from "@/store/downloads";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";

interface ResumeItem {
  key: string;
  isEpisode: boolean;
  showId?: number;
  season?: number;
  episode?: number;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  filePath: string;
  resumePosition: number;
  duration: number;
  lastWatched: number;
}

const ResumeWatchingRow = () => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const offlineLibrary = useDownloadStore((state) => state.offlineLibrary);
  const episodeLibrary = useDownloadStore((state) => state.episodeLibrary);
  const [resumeList, setResumeList] = useState<ResumeItem[]>([]);

  useEffect(() => {
    const items: ResumeItem[] = [];

    // Process Offline Movies
    Object.values(offlineLibrary).forEach((task) => {
      if (!task.filePath || !task.media) return;
      const filePath = task.filePath;
      const resumeVal = localStorage.getItem(`resume:${filePath}`);
      const durationVal = localStorage.getItem(`duration:${filePath}`);
      const lastWatchedVal = localStorage.getItem(`lastWatched:${filePath}`);

      if (resumeVal && durationVal) {
        const resumePosition = parseFloat(resumeVal);
        const duration = parseFloat(durationVal);
        // Position is greater than 30 seconds AND less than duration - 60 seconds
        if (resumePosition > 30 && resumePosition < duration - 60) {
          items.push({
            key: `movie:${task.media.id}:${filePath}`,
            isEpisode: false,
            tmdbId: task.media.id,
            mediaType: "movie",
            title: task.media.title,
            posterPath: task.media.posterPath,
            filePath,
            resumePosition,
            duration,
            lastWatched: lastWatchedVal ? parseInt(lastWatchedVal, 10) : 0,
          });
        }
      }
    });

    // Process Offline Episodes
    Object.entries(episodeLibrary).forEach(([key, task]) => {
      if (!task.filePath || !task.media) return;
      const filePath = task.filePath;
      const resumeVal = localStorage.getItem(`resume:${filePath}`);
      const durationVal = localStorage.getItem(`duration:${filePath}`);
      const lastWatchedVal = localStorage.getItem(`lastWatched:${filePath}`);

      if (resumeVal && durationVal) {
        const resumePosition = parseFloat(resumeVal);
        const duration = parseFloat(durationVal);
        // Position is greater than 30 seconds AND less than duration - 60 seconds
        if (resumePosition > 30 && resumePosition < duration - 60) {
          const match = key.match(/^(\d+):s(\d+)e(\d+)$/i);
          if (match) {
            const showId = parseInt(match[1], 10);
            const season = parseInt(match[2], 10);
            const episode = parseInt(match[3], 10);

            let title = task.media.title;
            const titleMatch = title.match(/(.*?)\s+-\s+S\d+:E\d+/i);
            if (titleMatch) {
              title = titleMatch[1];
            }

            items.push({
              key: `tv:${key}:${filePath}`,
              isEpisode: true,
              showId,
              season,
              episode,
              tmdbId: showId,
              mediaType: "tv",
              title,
              posterPath: task.media.posterPath,
              filePath,
              resumePosition,
              duration,
              lastWatched: lastWatchedVal ? parseInt(lastWatchedVal, 10) : 0,
            });
          }
        }
      }
    });

    // Sort by most recently watched (descending lastWatched timestamp)
    items.sort((a, b) => b.lastWatched - a.lastWatched);

    // Limit to max 10 items
    setResumeList(items.slice(0, 10));
  }, [offlineLibrary, episodeLibrary]);

  const handleRemove = (e: React.MouseEvent, filePath: string, key: string) => {
    e.stopPropagation();
    e.preventDefault();

    // Clear resume state from localStorage
    localStorage.removeItem(`resume:${filePath}`);
    localStorage.removeItem(`duration:${filePath}`);
    localStorage.removeItem(`lastWatched:${filePath}`);

    // Update state to animate out immediately
    setResumeList((prev) => prev.filter((item) => item.key !== key));
  };

  const handleCardClick = (item: ResumeItem) => {
    if (item.isEpisode) {
      navigate(
        `/watch/${item.showId}?type=tv&offline=true&s=${item.season}&e=${item.episode}`
      );
    } else {
      navigate(`/watch/${item.tmdbId}?type=movie&offline=true`);
    }
  };

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = direction === "left" ? -300 : 300;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  const getPosterUrl = (path: string | null) => {
    if (!path) return "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=342&auto=format&fit=crop";
    if (path.startsWith("http")) return path;
    return `https://image.tmdb.org/t/p/w300${path.startsWith("/") ? "" : "/"}${path}`;
  };

  if (resumeList.length === 0) return null;

  return (
    <section className="relative group/row px-4 md:px-8 mt-2 mb-6">
      <div className="flex items-center mb-4">
        <Play className="w-5 h-5 text-[#E50914] fill-[#E50914] mr-2 shrink-0 animate-pulse" />
        <h2 className="text-lg md:text-xl font-bold text-white">Continue Watching</h2>
      </div>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-[#0D0D0D]/80 backdrop-blur-sm opacity-0 group-hover/row:opacity-100 transition-opacity hidden md:flex hover:bg-[#1C1C1E] text-white border border-[#3A3A3C]"
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-30 bg-[#0D0D0D]/80 backdrop-blur-sm opacity-0 group-hover/row:opacity-100 transition-opacity hidden md:flex hover:bg-[#1C1C1E] text-white border border-[#3A3A3C]"
          onClick={() => scroll("right")}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 pt-1"
        >
          <AnimatePresence initial={false}>
            {resumeList.map((item) => {
              const progress = (item.resumePosition / item.duration) * 100;

              return (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, width: 0, marginRight: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  onClick={() => handleCardClick(item)}
                  className="group relative w-[130px] md:w-[160px] aspect-[2/3] shrink-0 rounded-lg overflow-hidden bg-[#1C1C1E] cursor-pointer shadow-lg hover:shadow-[0_8px_32px_rgba(0,0,0,0.6)] border border-[#3A3A3C]/40 flex flex-col justify-end"
                >
                  {/* Poster Image */}
                  <img
                    src={getPosterUrl(item.posterPath)}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                    loading="lazy"
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D]/95 via-[#0D0D0D]/30 to-transparent pointer-events-none" />

                  {/* Center Play Icon on Hover */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-200">
                      <Play className="w-5 h-5 text-black fill-black ml-0.5" />
                    </div>
                  </div>

                  {/* S{season}E{episode} Pill (top-left) */}
                  {item.isEpisode && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider bg-[#E50914] text-white shadow-md z-10 border border-white/10 uppercase">
                      S{item.season}E{item.episode}
                    </span>
                  )}

                  {/* X Button (top-right) */}
                  <button
                    onClick={(e) => handleRemove(e, item.filePath, item.key)}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-[#E50914] transition-colors border border-white/10 text-white z-20 hover:scale-110 active:scale-95 duration-150"
                    title="Remove from Continue Watching"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  {/* Title Info */}
                  <div className="relative p-2 z-10 select-none pointer-events-none">
                    <p className="text-xs font-bold text-white truncate drop-shadow">
                      {item.title}
                    </p>
                    {item.isEpisode && (
                      <p className="text-[9px] font-bold text-[#AEAEB2] uppercase mt-0.5 tracking-wider">
                        Episode {item.episode}
                      </p>
                    )}
                  </div>

                  {/* Bottom Sleek Progress Bar */}
                  <div className="absolute bottom-0 left-0 w-full h-1 bg-[#2C2C2E] z-10 pointer-events-none">
                    <div
                      className="h-full bg-[#E50914] transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};

export default ResumeWatchingRow;
