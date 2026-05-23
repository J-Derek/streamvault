import { useState, useEffect, useRef } from "react";
import { Play, Plus, Info, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getTrendingMovies, backdropUrl, getGenres } from "@/lib/tmdb";
import { normalizeMedia } from "@/lib/tmdb-types";

const HeroSection = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [genreMap, setGenreMap] = useState<Record<number, string>>({});

  const { data: genreData } = useQuery({
    queryKey: ['genres', 'movie'],
    queryFn: () => getGenres('movie'),
  });

  useEffect(() => {
    if (genreData?.genres) {
      const map: Record<number, string> = {};
      genreData.genres.forEach(g => map[g.id] = g.name);
      setGenreMap(map);
    }
  }, [genreData]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['heroTrending'],
    queryFn: getTrendingMovies,
  });

  // Auto-advance every 6 seconds. 
  // Defined at the top level to obey the Rules of Hooks.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (data && data.results.length > 0) {
      const maxLen = Math.min(data.results.length, 5);
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % maxLen);
      }, 6000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data]);

  if (isLoading || isError || !data || data.results.length === 0) {
    return <section className="relative w-full h-[85vh] md:h-[90vh] bg-[#0D0D0D] animate-pulse" />;
  }

  // Cycle through top 5
  const topResults = data.results.slice(0, 5);
  const currentItem = topResults[currentIndex];
  const media = normalizeMedia(currentItem, 'movie');

  const nextHero = () => setCurrentIndex((prev) => (prev + 1) % topResults.length);
  const prevHero = () => setCurrentIndex((prev) => (prev === 0 ? topResults.length - 1 : prev - 1));

  // Determine badge colors (mapped from spec)
  const statusColors: Record<string, string> = {
    completed: "bg-[#34C759]/20 text-[#34C759]",
    ongoing: "bg-[#00B4D8]/20 text-[#00B4D8]",
    cancelled: "bg-[#636366]/20 text-[#636366]",
    new: "bg-[#BF5AF2]/20 text-[#BF5AF2]",
    leaving: "bg-[#FF9F0A]/20 text-[#FF9F0A]"
  };
  const badgeClass = media.status ? statusColors[media.status] : null;

  return (
    <section className="relative w-full h-[85vh] md:h-[90vh] overflow-hidden group">
      <img
        key={media.id}
        src={backdropUrl(media.backdropPath, 'original')}
        alt={media.title}
        className="absolute inset-0 w-full h-full object-cover animate-fade-in"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-[#0D0D0D]/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D0D]/80 via-[#0D0D0D]/20 to-transparent" />

      {/* Navigation Arrows */}
      <Button
        variant="ghost"
        size="icon"
        onClick={prevHero}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 text-white/50 hover:text-white hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
      >
        <ChevronLeft className="w-8 h-8" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={nextHero}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 text-white/50 hover:text-white hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
      >
        <ChevronRight className="w-8 h-8" />
      </Button>

      <div className="absolute bottom-0 left-0 right-0 px-4 md:px-12 pb-16 md:pb-24 max-w-[1400px] mx-auto z-10">
        <div key={currentItem.id} className="max-w-2xl space-y-4 animate-fade-up">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest uppercase text-[#E50914]">Trending #{currentIndex + 1}</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white leading-[1.05] text-balance">
            {media.title}
          </h1>

          <div className="flex items-center gap-3 text-sm text-[#AEAEB2]">
            <span>{media.year}</span>
            <span className="w-1 h-1 rounded-full bg-[#636366]" />
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-[#F5C518] text-[#F5C518]" />
              <span className="text-[#F5C518] font-medium tabular-nums">{media.rating ? media.rating.toFixed(1) : "NR"}</span>
            </div>
            {badgeClass && media.status && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${badgeClass}`}>
                {media.status}
              </span>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {/* The cast to any is a quick bypass since TMDBMovie might not include genre_ids here but we know it does */}
            {(currentItem as any).genre_ids?.map((id: number) => {
              if (!genreMap[id]) return null;
              return (
                <span key={id} className="px-3 py-1 rounded-full border border-[#3A3A3C] text-xs text-[#AEAEB2]">
                  {genreMap[id]}
                </span>
              );
            })}
          </div>

          <p className="text-sm md:text-base text-[#AEAEB2] leading-relaxed max-w-md line-clamp-2">
            {currentItem.overview}
          </p>

          <div className="flex items-center gap-3 pt-2">
            <Link to={`/title/${media.id}?type=${media.mediaType}`}>
              <Button size="lg" className="gap-2 bg-[#E50914] text-white hover:bg-[#B00610] border-none">
                <Play className="w-5 h-5 fill-current" />
                Play Now
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="gap-2 bg-[#2C2C2E] border-[#3A3A3C] text-white hover:bg-[#3A3A3C]">
              <Plus className="w-5 h-5" />
              My List
            </Button>
            <Link to={`/title/${media.id}?type=${media.mediaType}`}>
              <Button variant="ghost" size="lg" className="gap-2 text-white hover:bg-[#2C2C2E]">
                <Info className="w-5 h-5" />
                More Info
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Slide dot indicators */}
      <div className="absolute bottom-6 right-8 z-20 flex items-center gap-2">
        {topResults.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`transition-all duration-300 rounded-full ${i === currentIndex ? "w-6 h-2 bg-[#E50914]" : "w-2 h-2 bg-white/40 hover:bg-white/70"}`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
};

export default HeroSection;
