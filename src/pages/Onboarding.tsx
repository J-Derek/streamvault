import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Compass, 
    DownloadCloud, 
    PlayCircle, 
    Tv, 
    Laptop, 
    Sparkles, 
    Volume2, 
    VolumeX, 
    Film, 
    Check, 
    MonitorPlay 
} from "lucide-react";
import { useSettingsStore, DefaultQuality, PreferredExternalPlayer } from "@/store/settings";

interface OnboardingProps {
    onComplete: () => void;
}

const Onboarding = ({ onComplete }: OnboardingProps) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [direction, setDirection] = useState(1);

    const { 
        defaultQuality, 
        setDefaultQuality, 
        preferredExternalPlayer, 
        setPreferredExternalPlayer 
    } = useSettingsStore();

    const handleNext = () => {
        if (currentSlide < 2) {
            setDirection(1);
            setCurrentSlide(prev => prev + 1);
        } else {
            localStorage.setItem("sv_onboarded", "true");
            onComplete();
        }
    };

    const handlePrev = () => {
        if (currentSlide > 0) {
            setDirection(-1);
            setCurrentSlide(prev => prev - 1);
        }
    };

    const slideVariants = {
        enter: (dir: number) => ({
            x: dir > 0 ? 300 : -300,
            opacity: 0
        }),
        center: {
            x: 0,
            opacity: 1,
            transition: {
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
            }
        },
        exit: (dir: number) => ({
            x: dir < 0 ? 300 : -300,
            opacity: 0,
            transition: {
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
            }
        })
    };

    return (
        <div className="h-screen w-screen bg-[#0D0D0D] text-white flex flex-col justify-between overflow-hidden relative font-sans">
            {/* Cinematic Background Gradient Circles */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#E50914]/5 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-red-600/5 blur-[120px] pointer-events-none" />

            {/* Header branding */}
            <div className="p-6 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#E50914] flex items-center justify-center font-black text-lg shadow-lg shadow-[#E50914]/20 select-none tracking-tighter">
                        SV
                    </div>
                    <span className="font-black text-xl tracking-wider select-none bg-gradient-to-r from-white to-[#AEAEB2] bg-clip-text text-transparent">
                        STREAM<span className="text-[#E50914]">VAULT</span>
                    </span>
                </div>
                <div className="text-xs text-[#AEAEB2] font-semibold tracking-widest bg-[#1C1C1E] border border-white/5 px-3 py-1 rounded-full">
                    STEP {currentSlide + 1} OF 3
                </div>
            </div>

            {/* Carousel slider area */}
            <div className="flex-1 flex items-center justify-center px-6 md:px-12 max-w-4xl mx-auto w-full z-10 relative">
                <AnimatePresence initial={false} custom={direction} mode="wait">
                    <motion.div
                        key={currentSlide}
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="w-full flex flex-col items-center text-center"
                    >
                        {/* Slide 1: Welcome Screen */}
                        {currentSlide === 0 && (
                            <div className="space-y-6 max-w-xl">
                                <motion.div 
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: 0.1, type: "spring" }}
                                    className="w-24 h-24 rounded-3xl bg-[#E50914] mx-auto flex items-center justify-center shadow-2xl shadow-[#E50914]/30"
                                >
                                    <Film className="w-12 h-12 text-white fill-white/10" />
                                </motion.div>
                                <div className="space-y-3">
                                    <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none bg-gradient-to-b from-white to-neutral-300 bg-clip-text text-transparent">
                                        Welcome to StreamVault
                                    </h1>
                                    <p className="text-lg md:text-xl text-[#E50914] font-bold tracking-wide">
                                        Your universe of entertainment, downloaded and ready.
                                    </p>
                                </div>
                                <p className="text-sm md:text-base text-[#AEAEB2] leading-relaxed max-w-md mx-auto">
                                    StreamVault consolidates movie discovery, trailer streams, torrent configurations, and high-fidelity local DRM playback into one beautiful, lightweight desktop environment.
                                </p>
                            </div>
                        )}

                        {/* Slide 2: Explanations Cards */}
                        {currentSlide === 1 && (
                            <div className="w-full space-y-8">
                                <div className="space-y-2">
                                    <h2 className="text-3xl font-black tracking-tight">How StreamVault Works</h2>
                                    <p className="text-[#AEAEB2] text-sm">Everything you need to master your movie library</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full text-left">
                                    {/* Card 1 */}
                                    <motion.div 
                                        whileHover={{ y: -4, borderColor: "rgba(229, 9, 20, 0.4)" }}
                                        className="p-5 rounded-xl bg-[#1C1C1E] border border-white/5 shadow-xl transition-colors space-y-4"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-[#E50914]">
                                            <Compass className="w-5 h-5" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <h3 className="text-base font-bold text-white">Browse &amp; Discover</h3>
                                            <p className="text-xs text-[#AEAEB2] leading-relaxed">
                                                Explore thousands of items on custom movie sliders, swipe matches, mood wheels, or universal keywords directly from the TMDB database.
                                            </p>
                                        </div>
                                    </motion.div>

                                    {/* Card 2 */}
                                    <motion.div 
                                        whileHover={{ y: -4, borderColor: "rgba(229, 9, 20, 0.4)" }}
                                        className="p-5 rounded-xl bg-[#1C1C1E] border border-white/5 shadow-xl transition-colors space-y-4"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-[#E50914]">
                                            <DownloadCloud className="w-5 h-5" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <h3 className="text-base font-bold text-white">Direct &amp; Torrent Caching</h3>
                                            <p className="text-xs text-[#AEAEB2] leading-relaxed">
                                                Fetch streaming links instantly or download complete files to your local drive using the built-in P2P background client with automated controls.
                                            </p>
                                        </div>
                                    </motion.div>

                                    {/* Card 3 */}
                                    <motion.div 
                                        whileHover={{ y: -4, borderColor: "rgba(229, 9, 20, 0.4)" }}
                                        className="p-5 rounded-xl bg-[#1C1C1E] border border-white/5 shadow-xl transition-colors space-y-4"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-[#E50914]">
                                            <PlayCircle className="w-5 h-5" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <h3 className="text-base font-bold text-white">Watch Offline Everywhere</h3>
                                            <p className="text-xs text-[#AEAEB2] leading-relaxed">
                                                Play cached files anywhere with a native decryption media player that secures and reads files on-the-fly, bypasses codecs, and loads subs.
                                            </p>
                                        </div>
                                    </motion.div>
                                </div>
                            </div>
                        )}

                        {/* Slide 3: Settings Preferences Selectors */}
                        {currentSlide === 2 && (
                            <div className="w-full max-w-xl space-y-8">
                                <div className="space-y-2">
                                    <h2 className="text-3xl font-black tracking-tight">Configure Your Vault</h2>
                                    <p className="text-[#AEAEB2] text-sm">Tailor your streaming quality and player preferences</p>
                                </div>

                                <div className="space-y-6 text-left">
                                    {/* Quality Selection */}
                                    <div className="space-y-3">
                                        <label className="text-sm font-bold text-[#AEAEB2] tracking-wider uppercase">Default Caching Quality</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {(['720p', '1080p', '4K'] as DefaultQuality[]).map((q) => (
                                                <button
                                                    key={q}
                                                    onClick={() => setDefaultQuality(q)}
                                                    className={`py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                                        defaultQuality === q 
                                                            ? "bg-[#E50914]/10 border-[#E50914] text-white shadow-lg shadow-[#E50914]/5"
                                                            : "bg-[#1C1C1E] border-white/5 text-[#AEAEB2] hover:bg-[#2C2C2E]"
                                                    }`}
                                                >
                                                    <span className="font-black text-sm">{q}</span>
                                                    <span className="text-[10px] text-center opacity-80 leading-none">
                                                        {q === '720p' && 'Fast & Muted'}
                                                        {q === '1080p' && 'Standard HD'}
                                                        {q === '4K' && 'Ultra Detailed'}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* External Player Selection */}
                                    <div className="space-y-3">
                                        <label className="text-sm font-bold text-[#AEAEB2] tracking-wider uppercase">Preferred Playback Engine</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { id: 'system', name: 'Built-in Player', desc: 'Secure local player' },
                                                { id: 'vlc', name: 'VLC Media Player', desc: 'Robust fallback' },
                                                { id: 'mpv', name: 'MPV Player', desc: 'Lightweight shell' }
                                            ].map((player) => (
                                                <button
                                                    key={player.id}
                                                    onClick={() => setPreferredExternalPlayer(player.id as PreferredExternalPlayer)}
                                                    className={`py-3 px-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all cursor-pointer ${
                                                        preferredExternalPlayer === player.id 
                                                            ? "bg-[#E50914]/10 border-[#E50914] text-white shadow-lg shadow-[#E50914]/5"
                                                            : "bg-[#1C1C1E] border-white/5 text-[#AEAEB2] hover:bg-[#2C2C2E]"
                                                    }`}
                                                >
                                                    <span className="font-bold text-xs">{player.name}</span>
                                                    <span className="text-[9px] opacity-80 leading-none">{player.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <p className="text-[11px] text-[#636366] font-medium italic">
                                    💡 Note: These settings are preserved and can be changed anytime in the Settings tab.
                                </p>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Bottom Navigation controls */}
            <div className="p-6 bg-gradient-to-t from-black to-transparent border-t border-white/5 z-10 flex items-center justify-between">
                {/* Back button */}
                <button
                    onClick={handlePrev}
                    className={`px-5 py-2 rounded-md font-semibold text-sm transition-all active:scale-95 cursor-pointer ${
                        currentSlide === 0 
                            ? "opacity-0 pointer-events-none" 
                            : "text-[#AEAEB2] hover:text-white"
                    }`}
                >
                    Previous
                </button>

                {/* Indicators dots */}
                <div className="flex gap-2">
                    {[0, 1, 2].map((idx) => (
                        <div 
                            key={idx} 
                            className={`h-2 rounded-full transition-all duration-300 ${
                                currentSlide === idx ? "w-6 bg-[#E50914]" : "w-2 bg-white/20"
                            }`} 
                        />
                    ))}
                </div>

                {/* Action button */}
                <button
                    onClick={handleNext}
                    className="px-6 py-2 bg-[#E50914] hover:bg-[#B00610] text-white font-bold text-sm rounded-md shadow-lg shadow-[#E50914]/25 hover:shadow-[#E50914]/35 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                    {currentSlide === 2 ? "Let's Go!" : "Next"}
                </button>
            </div>
        </div>
    );
};

export default Onboarding;
