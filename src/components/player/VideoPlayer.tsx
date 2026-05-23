import { useState, useEffect, useRef } from "react";
import { Pause, Play, Volume2, VolumeX, Maximize } from "lucide-react";

interface VideoPlayerProps {
    isOffline: boolean;
    offlineSrc?: string | null;
    vidsrcUrl?: string | null;
    title: string;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onPlayingChange?: (playing: boolean) => void;
    onIframeLoad?: () => void;
    p2pLoading?: boolean;
}

const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return "0:00";
    try {
        const res = new Date(Math.max(time, 0) * 1000).toISOString().substr(11, 8);
        return res.startsWith("00:") ? res.substring(3) : res;
    } catch (e) {
        return "0:00";
    }
};

const VideoPlayer = ({ isOffline, offlineSrc, vidsrcUrl, title, containerRef, onPlayingChange, onIframeLoad, p2pLoading }: VideoPlayerProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [showUI, setShowUI] = useState(true);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Offline player state
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const dragProgress = useRef(0);

    const handleMouseMove = () => {
        setShowUI(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setShowUI(false), 3000);
    };

    const seekTo = (clientX: number) => {
        if (!videoRef.current || !progressBarRef.current) return;
        const rect = progressBarRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const dur = videoRef.current.duration;
        const time = percent * (isFinite(dur) ? dur : 0);
        videoRef.current.currentTime = time;
    };

    const handleSeekMouseDown = (e: React.MouseEvent) => {
        if (!videoRef.current) return;
        setIsDragging(true);
        seekTo(e.clientX);
    };

    useEffect(() => {
        if (!isDragging) return;
        const handleMove = (e: MouseEvent) => {
            e.preventDefault();
            seekTo(e.clientX);
        };
        const handleUp = () => {
            setIsDragging(false);
        };
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, [isDragging]);

    useEffect(() => {
        window.addEventListener("mousemove", handleMouseMove);
        handleMouseMove();
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const handleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen().catch(() => { });
        }
    };

    // Keyboard shortcuts (offline only)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOffline || !videoRef.current) return;
            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    if (videoRef.current.paused) videoRef.current.play();
                    else videoRef.current.pause();
                    break;
                case 'f':
                    e.preventDefault();
                    handleFullscreen();
                    break;
                case 'm':
                    e.preventDefault();
                    videoRef.current.muted = !videoRef.current.muted;
                    break;
                case 'arrowright':
                    e.preventDefault();
                    videoRef.current.currentTime += 10;
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    videoRef.current.currentTime -= 10;
                    break;
                case 'arrowup':
                    e.preventDefault();
                    videoRef.current.volume = Math.min(1, videoRef.current.volume + 0.1);
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    videoRef.current.volume = Math.max(0, videoRef.current.volume - 0.1);
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOffline]);

    // Notify parent of playing state changes
    useEffect(() => { onPlayingChange?.(isPlaying); }, [isPlaying]);

    const videoElement = isOffline ? (
        <video
            ref={videoRef}
            src={offlineSrc || undefined}
            autoPlay
            onClick={() => {
                if (videoRef.current) {
                    if (isPlaying) videoRef.current.pause();
                    else videoRef.current.play();
                }
            }}
            onDoubleClick={handleFullscreen}
            onTimeUpdate={() => {
                if (!videoRef.current) return;
                const ct = videoRef.current.currentTime;
                const dur = videoRef.current.duration;
                setCurrentTime(ct);
                const progressPct = dur && isFinite(dur) && dur > 0 ? (ct / dur) * 100 : 0;
                setProgress(progressPct);
            }}
            onLoadedMetadata={() => {
                const dur = videoRef.current?.duration || 0;
                setDuration(isFinite(dur) ? dur : 0);
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onVolumeChange={() => {
                if (!videoRef.current) return;
                setVolume(videoRef.current.volume);
                setIsMuted(videoRef.current.muted || videoRef.current.volume === 0);
            }}
            className="w-full h-full object-contain outline-none focus:outline-none cursor-pointer"
        >
            <p className="text-white">Your browser does not support HTML5 video.</p>
        </video>
    ) : vidsrcUrl ? (
        <iframe
            src={vidsrcUrl}
            className="w-full h-full border-none"
            allowFullScreen
            allow="fullscreen; autoplay; encrypted-media; clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
            {...(vidsrcUrl.includes("vidlink") ? {} : { sandbox: "allow-scripts allow-same-origin allow-forms allow-presentation allow-popups" })}
            onLoad={onIframeLoad}
        />
    ) : (
        <div className="flex flex-col items-center gap-4 text-white/20">
            <div className="w-10 h-10 border-2 border-white/5 border-t-white/20 rounded-full animate-spin" />
            <p className="text-xs font-bold uppercase tracking-widest">Waiting for source...</p>
        </div>
    );

    return (
        <>
            {videoElement}

            {/* P2P Loading Spinner — transparent to mouse events */}
            {p2pLoading && (
                <div className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none">
                    <div className="flex flex-col items-center gap-3 animate-in fade-in duration-300">
                        <div className="w-10 h-10 rounded-full border-[3px] border-[#E50914] border-t-transparent animate-spin" />
                        <span className="text-white/60 text-xs font-bold uppercase tracking-widest">Buffering stream…</span>
                    </div>
                </div>
            )}

            {/* Bottom Controls Overlay - Only show for Offline Native Video */}
            {isOffline && (
                <div className={`absolute bottom-0 left-0 right-0 pt-40 pb-10 px-10 flex flex-col justify-end pointer-events-none transition-opacity duration-500 bg-gradient-to-t from-black via-black/60 to-transparent ${showUI ? "opacity-100" : "opacity-0"}`}>
                    <div className="pointer-events-auto flex flex-col gap-5 w-full">
                        {/* Progress Bar */}
                        <div
                            ref={progressBarRef}
                            className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer hover:h-3 transition-all relative group/progress flex items-center"
                            onMouseDown={handleSeekMouseDown}
                        >
                            <div className="h-full bg-[#E50914] rounded-full relative pointer-events-none flex items-center justify-end" style={{ width: `${progress}%` }}>
                                <div className="absolute w-5 h-5 bg-[#E50914] rounded-full opacity-0 group-hover/progress:opacity-100 shadow-[0_0_15px_rgba(229,9,20,0.8)] transition-opacity translate-x-1/2" />
                            </div>
                        </div>

                        {/* Controls Row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                {/* Play/Pause */}
                                <button onClick={() => {
                                    if (videoRef.current) {
                                        if (isPlaying) videoRef.current.pause();
                                        else videoRef.current.play();
                                    }
                                }} className="text-white hover:text-white/80 transition-transform hover:scale-110 drop-shadow-md">
                                    {isPlaying ? <Pause className="w-10 h-10 fill-white" /> : <Play className="w-10 h-10 fill-white ml-1" />}
                                </button>

                                {/* Skip Backward 10s */}
                                <button onClick={() => {
                                    if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
                                }} className="text-white/80 hover:text-white transition-all hover:scale-110 drop-shadow-md hidden sm:block">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/></svg>
                                </button>

                                {/* Skip Forward 10s */}
                                <button onClick={() => {
                                    if (videoRef.current) videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10);
                                }} className="text-white/80 hover:text-white transition-all hover:scale-110 drop-shadow-md hidden sm:block">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 17l5-5-5-5"/><path d="M6 17l5-5-5-5"/></svg>
                                </button>

                                {/* Volume */}
                                <div className="flex items-center gap-3 group ml-2">
                                    <button onClick={() => {
                                        if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
                                    }} className="text-white hover:text-white/80 transition-colors drop-shadow-md">
                                        {isMuted || volume === 0 ? <VolumeX className="w-7 h-7" /> : <Volume2 className="w-7 h-7" />}
                                    </button>

                                    <div className="w-0 opacity-0 overflow-hidden group-hover:w-24 group-hover:opacity-100 transition-all duration-300 flex items-center">
                                        <input
                                            type="range"
                                            min="0" max="1" step="0.05"
                                            value={isMuted ? 0 : volume}
                                            onChange={(e) => {
                                                if (videoRef.current) {
                                                    videoRef.current.muted = false;
                                                    videoRef.current.volume = parseFloat(e.target.value);
                                                }
                                            }}
                                            className="w-full h-1.5 bg-white/20 rounded-full appearance-none accent-[#E50914] cursor-pointer"
                                        />
                                    </div>
                                    <span className="text-white/90 ml-3 text-sm font-semibold tracking-wide drop-shadow-md tabular-nums">
                                        {formatTime(currentTime)} <span className="text-white/40 mx-1">/</span> {formatTime(duration)}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-5">
                                {/* Picture in Picture */}
                                <button onClick={() => {
                                    if (videoRef.current && document.pictureInPictureEnabled) {
                                        if (document.pictureInPictureElement) document.exitPictureInPicture();
                                        else videoRef.current.requestPictureInPicture();
                                    }
                                }} className="text-white/80 hover:text-white transition-all hover:scale-110 drop-shadow-md">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><rect x="12" y="14" width="7" height="5" rx="1" ry="1"/></svg>
                                </button>
                                
                                {/* Fullscreen */}
                                <button onClick={handleFullscreen} className="text-white/80 hover:text-white transition-all hover:scale-110 drop-shadow-md">
                                    <Maximize className="w-7 h-7" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default VideoPlayer;
