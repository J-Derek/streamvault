import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import MovieCard from "@/components/MovieCard";
import { normalizeMedia, type TMDBListResponse } from "@/lib/tmdb-types";

// Accepting any item from TMDB
type FetchFn = () => Promise<TMDBListResponse<any>>;

interface ContentRowProps {
  label: string;
  fetchFn: FetchFn;
  mediaType: "movie" | "tv";
}

const ContentRow = ({ label, fetchFn, mediaType }: ContentRowProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['contentRow', label],
    queryFn: () => fetchFn(),
  });

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = direction === "left" ? -400 : 400;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <section className="relative group/row">
      <div className="flex items-center justify-between mb-4 px-4 md:px-8">
        <h2 className="text-lg md:text-xl font-bold text-white">{label}</h2>
        <button className="text-sm text-[#AEAEB2] hover:text-white transition-colors">
          See All →
        </button>
      </div>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-[#0D0D0D]/80 backdrop-blur-sm opacity-0 group-hover/row:opacity-100 transition-opacity hidden md:flex hover:bg-[#1C1C1E] text-white"
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-[#0D0D0D]/80 backdrop-blur-sm opacity-0 group-hover/row:opacity-100 transition-opacity hidden md:flex hover:bg-[#1C1C1E] text-white"
          onClick={() => scroll("right")}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide px-4 md:px-8 pb-2"
        >
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[160px] md:w-[180px] space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg bg-[#1C1C1E] animate-pulse" />
                <Skeleton className="h-4 w-3/4 bg-[#1C1C1E] animate-pulse" />
                <Skeleton className="h-3 w-1/2 bg-[#1C1C1E] animate-pulse" />
              </div>
            ))}

          {isError && (
            <div className="py-8 text-sm text-[#E50914] px-4">Failed to load content. Please check your connection.</div>
          )}

          {data && data.results.map((item: any, i: number) => {
            const media = normalizeMedia(item, mediaType);
            return <MovieCard key={`${media.id}-${i}`} media={media} />;
          })}
        </div>
      </div>
    </section>
  );
};

export default ContentRow;
