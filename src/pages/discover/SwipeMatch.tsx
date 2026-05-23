import { useState, useEffect } from "react";
import { ChevronLeft, ArrowLeftRight, Heart, X, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getDiverseSwipeDeck, discoverContent, posterUrl } from "@/lib/tmdb";
import { normalizeMedia, TMDBMovie } from "@/lib/tmdb-types";
import MovieCard from "@/components/MovieCard";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";

const SWIPE_THRESHOLD = 100;
const MAX_SWIPES = 10;

const SwipeMatch = () => {
    const navigate = useNavigate();

    // 1. Fetch initial deck of popular movies to swipe on
    const { data: deckData, isLoading: deckLoading } = useQuery({
        queryKey: ['swipeDeck'],
        queryFn: getDiverseSwipeDeck,
    });

    const [deck, setDeck] = useState<TMDBMovie[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [swipedRight, setSwipedRight] = useState<TMDBMovie[]>([]);
    const [isFinished, setIsFinished] = useState(false);

    useEffect(() => {
        if (deckData?.results) {
            setDeck(deckData.results.slice(0, MAX_SWIPES));
        }
    }, [deckData]);

    // Motion values for the top card
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-15, 15]);
    const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);
    const likeOpacity = useTransform(x, [0, 100], [0, 1]);
    const nopeOpacity = useTransform(x, [0, -100], [0, 1]);
    const controls = useAnimation();

    const handleSwipe = async (direction: 'left' | 'right') => {
        const currentMovie = deck[currentIndex];

        // Animate card off screen
        await controls.start({
            x: direction === 'right' ? 300 : -300,
            opacity: 0,
            transition: { duration: 0.3 }
        });

        if (direction === 'right') {
            setSwipedRight(prev => [...prev, currentMovie]);
        }

        // Reset position for next card instantly
        x.set(0);
        controls.set({ x: 0, opacity: 1 });

        if (currentIndex + 1 >= MAX_SWIPES) {
            setIsFinished(true);
        } else {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
        if (info.offset.x > SWIPE_THRESHOLD) {
            handleSwipe('right');
        } else if (info.offset.x < -SWIPE_THRESHOLD) {
            handleSwipe('left');
        } else {
            controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 20 } });
        }
    };

    // 2. Discover query based on liked movies
    // Calculate top 2 genres from liked movies
    const likedGenres = swipedRight.flatMap(m => m.genre_ids).reduce((acc, curr) => {
        if (curr) acc[curr] = (acc[curr] || 0) + 1;
        return acc;
    }, {} as Record<number, number>);

    const topGenres = Object.entries(likedGenres)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(entry => parseInt(entry[0]));

    const { data: recommendations, isLoading: recsLoading } = useQuery({
        queryKey: ['swipeRecommendations', topGenres],
        queryFn: () => discoverContent({
            mediaType: 'movie',
            genres: topGenres.length > 0 ? topGenres : undefined,
            minRating: 6.5,
            sortBy: 'popularity.desc',
        }),
        enabled: isFinished,
    });

    const currentCard = deck[currentIndex];

    return (
        <div className="min-h-screen bg-[#0D0D0D] pt-24 pb-20 px-4 md:px-8 text-white font-sans overflow-hidden">
            <div className="max-w-[1200px] mx-auto">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-[#AEAEB2] hover:text-white mb-8 transition-colors group"
                >
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-semibold">Back to Discover</span>
                </button>

                {!isFinished ? (
                    <div className="flex flex-col items-center">
                        <div className="text-center mb-10">
                            <h1 className="text-3xl font-black tracking-tight mb-2">Swipe to match</h1>
                            <p className="text-[#AEAEB2]">Like or skip 10 movies to generate your tailored results.</p>
                            <p className="text-xs font-bold text-[#636366] uppercase tracking-widest mt-4">
                                Card {currentIndex + 1} of {MAX_SWIPES}
                            </p>
                        </div>

                        <div className="relative w-full max-w-[320px] aspect-[2/3] perspective-1000">
                            {deckLoading ? (
                                <Skeleton className="w-full h-full rounded-2xl bg-[#1C1C1E]" />
                            ) : currentCard && (
                                <motion.div
                                    drag="x"
                                    dragConstraints={{ left: 0, right: 0 }}
                                    dragElastic={0.7}
                                    onDragEnd={handleDragEnd}
                                    animate={controls}
                                    style={{ x, rotate, opacity }}
                                    className="absolute inset-0 bg-[#1C1C1E] rounded-2xl shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing border border-[#3A3A3C] z-10"
                                >
                                    <img
                                        src={posterUrl(currentCard.poster_path, 'w500')}
                                        alt={currentCard.title}
                                        className="w-full h-full object-cover pointer-events-none"
                                    />

                                    {/* Gradients to ensure text is readable */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />

                                    {/* LIKE Overlay */}
                                    <motion.div
                                        style={{ opacity: likeOpacity }}
                                        className="absolute top-8 left-8 border-4 border-[#34C759] rounded-xl px-4 py-2 transform -rotate-12 pointer-events-none"
                                    >
                                        <span className="text-3xl font-black text-[#34C759] tracking-widest uppercase">LIKE</span>
                                    </motion.div>

                                    {/* NOPE Overlay */}
                                    <motion.div
                                        style={{ opacity: nopeOpacity }}
                                        className="absolute top-8 right-8 border-4 border-[#FF9F0A] rounded-xl px-4 py-2 transform rotate-12 pointer-events-none"
                                    >
                                        <span className="text-3xl font-black text-[#FF9F0A] tracking-widest uppercase">NOPE</span>
                                    </motion.div>

                                    <div className="absolute bottom-0 left-0 right-0 p-6 pointer-events-none">
                                        <h2 className="text-2xl font-bold leading-tight mb-2 drop-shadow-md">{currentCard.title}</h2>
                                        <div className="flex items-center gap-3 text-sm font-semibold">
                                            <span className="text-[#F5C518] drop-shadow-md">★ {currentCard.vote_average?.toFixed(1)}</span>
                                            <span className="text-white/80 drop-shadow-md">{currentCard.release_date?.substring(0, 4)}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Next card in stack (visual cue only) */}
                            {currentIndex + 1 < MAX_SWIPES && deck[currentIndex + 1] && (
                                <div className="absolute inset-0 bg-[#1C1C1E] rounded-2xl shadow-lg border border-[#3A3A3C] opacity-50 transform scale-95 translate-y-4 z-0 flex items-center justify-center overflow-hidden">
                                    <img
                                        src={posterUrl(deck[currentIndex + 1].poster_path, 'w342')}
                                        className="w-full h-full object-cover opacity-50 blur-sm"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Control Buttons */}
                        <div className="flex items-center justify-center gap-6 mt-10">
                            <button
                                onClick={() => handleSwipe('left')}
                                className="w-14 h-14 rounded-full bg-[#1C1C1E] border border-[#3A3A3C] flex items-center justify-center text-[#FF9F0A] hover:bg-[#FF9F0A]/10 hover:border-[#FF9F0A] transition-all hover:scale-110 active:scale-95 shadow-lg"
                            >
                                <X className="w-6 h-6 stroke-[3]" />
                            </button>
                            <button
                                onClick={() => handleSwipe('right')}
                                className="w-14 h-14 rounded-full bg-[#1C1C1E] border border-[#3A3A3C] flex items-center justify-center text-[#34C759] hover:bg-[#34C759]/10 hover:border-[#34C759] transition-all hover:scale-110 active:scale-95 shadow-lg"
                            >
                                <Heart className="w-6 h-6 stroke-[3] fill-current" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="animate-fade-in space-y-8">
                        <div className="bg-[#1C1C1E] border border-[#3A3A3C] rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <ArrowLeftRight className="w-32 h-32" />
                            </div>
                            <div className="relative z-10">
                                <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-2">Your Matches</h1>
                                <p className="text-[#AEAEB2] mb-6">Based on your 10 swipes, we found these titles for you.</p>

                                <button
                                    onClick={() => {
                                        setIsFinished(false);
                                        setCurrentIndex(0);
                                        setSwipedRight([]);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold transition-colors"
                                >
                                    <RefreshCcw className="w-4 h-4" /> Start Over
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {recsLoading ? (
                                [...Array(12)].map((_, i) => (
                                    <div key={i} className="flex flex-col gap-2">
                                        <Skeleton className="aspect-[2/3] w-full rounded-lg bg-[#1C1C1E]" />
                                        <Skeleton className="h-4 w-3/4 bg-[#1C1C1E]" />
                                        <Skeleton className="h-3 w-1/2 bg-[#1C1C1E]" />
                                    </div>
                                ))
                            ) : recommendations?.results?.map((item) => (
                                <MovieCard key={item.id} media={normalizeMedia(item, 'movie')} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SwipeMatch;
