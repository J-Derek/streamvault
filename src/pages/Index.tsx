import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ContentRow from "@/components/ContentRow";
import {
  getTrendingMovies,
  getNowPlaying,
  getTopRatedMovies,
  getPopularTVShows,
  getUpcoming
} from "@/lib/tmdb";

const Index = () => {
  return (
    <div className="min-h-screen bg-[#0D0D0D]">
      <Navbar />
      <HeroSection />
      <div className="relative z-10 -mt-16 space-y-12 pb-20">
        <ContentRow label="Trending This Week" fetchFn={getTrendingMovies} mediaType="movie" />
        <ContentRow label="New Arrivals" fetchFn={getNowPlaying} mediaType="movie" />
        <ContentRow label="Top Rated" fetchFn={getTopRatedMovies} mediaType="movie" />
        <ContentRow label="Popular TV Shows" fetchFn={getPopularTVShows} mediaType="tv" />
        <ContentRow label="Upcoming" fetchFn={getUpcoming} mediaType="movie" />
      </div>
    </div>
  );
};

export default Index;
