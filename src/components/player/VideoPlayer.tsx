import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Minimize, Settings, Captions, ExternalLink, Loader2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/store/settings';

import { useToast } from '@/hooks/use-toast';

const isTauri = typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

interface VideoPlayerProps {
    isOffline?: boolean;
    offlineSrc?: string;
    vidsrcUrl?: string;
    title: string;
    containerRef: React.RefObject<HTMLDivElement>;
    onIframeLoad?: () => void;
    p2pLoading?: boolean;
    filePath?: string;
    nextEpisodeKey?: string;
}

const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export default function VideoPlayer({
    isOffline,
    offlineSrc,
    vidsrcUrl,
    title,
    containerRef,
    onIframeLoad,
    p2pLoading,
    filePath,
    nextEpisodeKey
}: VideoPlayerProps) {
    const navigate = useNavigate();
    const { toast } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const scrubberRef = useRef<HTMLDivElement>(null);
    
    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const isFullscreenRef = useRef(false);

    useEffect(() => {
        isFullscreenRef.current = isFullscreen;
    }, [isFullscreen]);

    const [isBuffering, setIsBuffering] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showControls, setShowControls] = useState(true);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    
    // Play/Pause animation
    const [showPlayAnim, setShowPlayAnim] = useState(false);
    const [playAnimType, setPlayAnimType] = useState<'play' | 'pause'>('play');
    
    // Scrubber state
    const [isDragging, setIsDragging] = useState(false);
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverPos, setHoverPos] = useState(0);
    
    // MKV / Remux state
    const [playbackStage, setPlaybackStage] = useState<'native' | 'remuxing' | 'remuxed' | 'failed'>('native');
    const [remuxError, setRemuxError] = useState<string | null>(null);
    const [remuxedSrc, setRemuxedSrc] = useState<string | null>(null);
    const isRemuxCancelledRef = useRef(false);
    
    // Next episode state
    const [showNextOverlay, setShowNextOverlay] = useState(false);
    const [nextCountdown, setNextCountdown] = useState(5);
    const nextTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Subtitles state
    const [subtitles, setSubtitles] = useState<string[]>([]);
    
    // External Player Fallback state
    const [showPlayerModal, setShowPlayerModal] = useState(false);
    const { 
        preferredExternalPlayer, 
        customPlayerPath, 
        setPreferredExternalPlayer, 
        setCustomPlayerPath 
    } = useSettingsStore();

    const openExternalPlayer = async (playerType: 'system' | 'vlc' | 'mpv' | 'custom', customPath?: string) => {
        if (!isTauri) return;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            let pathArg: string | null = null;
            if (playerType === 'vlc') {
                pathArg = 'vlc';
            } else if (playerType === 'mpv') {
                pathArg = 'mpv';
            } else if (playerType === 'custom') {
                pathArg = customPath || customPlayerPath || null;
            }
            
            console.log(`[VideoPlayer] Launching external player: ${playerType} with path:`, pathArg);
            await invoke('open_in_external_player', { id: 0, filePath: filePath || null, playerPath: pathArg });
            
            toast({
                title: "External Player Launched",
                description: `Successfully started ${playerType === 'system' ? 'System Default' : playerType.toUpperCase()} player.`,
            });
        } catch (e: any) {
            console.error("Failed to open in external player", e);
            toast({
                title: "Launch Failure",
                description: e.toString() || "The selected external player failed to launch.",
                variant: "destructive",
            });
        }
    };
    
    const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);
    const canPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Mouse movement hides controls after 3 seconds
    const handlePointerMove = useCallback(() => {
        setShowControls(true);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => {
            if (!isDragging && isPlaying) {
                setShowControls(false);
                setShowSpeedMenu(false);
            }
        }, 3000);
    }, [isDragging, isPlaying]);

    useEffect(() => {
        handlePointerMove();
        return () => {
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        };
    }, [handlePointerMove]);

    // Subtitles detection
    useEffect(() => {
        if (!isOffline || !filePath || !isTauri) return;
        const scanSubtitles = async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const subs = await invoke<string[]>('find_subtitle_files', { filePath });
                setSubtitles(subs);
            } catch (e) {
                console.error("Failed to find subtitles:", e);
            }
        };
        scanSubtitles();
    }, [isOffline, filePath]);

    // Auto-resume load
    useEffect(() => {
        if (!isOffline || !filePath || !videoRef.current) return;
        const resumeKey = `resume:${filePath}`;
        const savedTimeStr = localStorage.getItem(resumeKey);
        if (savedTimeStr) {
            const savedTime = parseFloat(savedTimeStr);
            // We will set this once duration is loaded if valid
            videoRef.current.dataset.resumeTime = savedTime.toString();
        }
    }, [isOffline, filePath]);

    // Auto-resume save every 5s
    useEffect(() => {
        if (!isOffline || !filePath) return;
        const resumeKey = `resume:${filePath}`;
        const lastWatchedKey = `lastWatched:${filePath}`;
        const interval = setInterval(() => {
            if (videoRef.current && !videoRef.current.paused) {
                const ct = videoRef.current.currentTime;
                const dur = videoRef.current.duration;
                if (ct > 30 && dur - ct > 60) {
                    localStorage.setItem(resumeKey, ct.toString());
                    localStorage.setItem(lastWatchedKey, Date.now().toString());
                } else if (dur - ct <= 60) {
                    localStorage.removeItem(resumeKey); // remove if near end
                    localStorage.removeItem(lastWatchedKey);
                }
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [isOffline, filePath]);

    // Native timeout -> remux logic
    useEffect(() => {
        if (!isOffline) return;
        console.log("[VideoPlayer] Received offlineSrc:", offlineSrc);
        console.log("[VideoPlayer] Received filePath:", filePath);
        if (!filePath || !isTauri) return;
        
        if (playbackStage === 'native') {
            canPlayTimerRef.current = setTimeout(() => {
                // If it hasn't fired canplay after 5 seconds, attempt remux
                if (!videoRef.current || videoRef.current.readyState < 3) {
                    console.log("Native playback timeout, attempting remux...");
                    attemptRemux();
                }
            }, 5000);
        }
        
        return () => {
            if (canPlayTimerRef.current) clearTimeout(canPlayTimerRef.current);
        };
    }, [isOffline, filePath, offlineSrc, playbackStage]);

    const attemptRemux = async () => {
        if (!isTauri || !filePath) return;
        isRemuxCancelledRef.current = false;
        setPlaybackStage('remuxing');
        setRemuxError(null);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const newPath = await invoke<string>('remux_to_mp4', { filePath });
            
            if (isRemuxCancelledRef.current) {
                console.log("Remux completed but was cancelled by user.");
                return;
            }
            
            // Encode the new path to route through proxy
            const encoded = btoa(unescape(encodeURIComponent(newPath)));
            setRemuxedSrc(`http://127.0.0.1:8083/p2p-stream/?path=${encoded}`);
            setPlaybackStage('remuxed');
            
            toast({
                title: "Optimized Successfully",
                description: "Video is now ready for native playback.",
            });
        } catch (e: any) {
            if (isRemuxCancelledRef.current) return;
            console.error("Remux failed:", e);
            setRemuxError(e.toString());
            setPlaybackStage('failed');
            toast({
                title: "Remux Failed",
                description: e.toString() || "Failed to remux video format.",
                variant: "destructive",
            });
        }
    };

    const cancelRemux = () => {
        isRemuxCancelledRef.current = true;
        setRemuxError("Remux cancelled by user.");
        setPlaybackStage('failed');
        toast({
            title: "Remux Skipped",
            description: "Transitioned to external player fallback.",
        });
    };

    const handleVideoError = () => {
        if (playbackStage === 'native') {
            if (canPlayTimerRef.current) clearTimeout(canPlayTimerRef.current);
            console.log("Native playback error, attempting remux...");
            attemptRemux();
        }
    };

    const togglePlay = () => {
        if (videoRef.current) {
            if (videoRef.current.paused) {
                videoRef.current.play();
                setPlayAnimType('play');
            } else {
                videoRef.current.pause();
                setPlayAnimType('pause');
            }
            setShowPlayAnim(true);
            setTimeout(() => setShowPlayAnim(false), 500);
        }
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current || isDragging) return;
        const ct = videoRef.current.currentTime;
        setCurrentTime(ct);
        setProgress((ct / videoRef.current.duration) * 100);
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const dur = videoRef.current.duration;
            setDuration(dur);
            if (isOffline && filePath) {
                localStorage.setItem(`duration:${filePath}`, dur.toString());
            }
            const savedTime = videoRef.current.dataset.resumeTime;
            if (savedTime) {
                const st = parseFloat(savedTime);
                if (st > 30 && dur - st > 60) {
                    // Could show toast here, but we'll just jump
                    videoRef.current.currentTime = st;
                }
            }
        }
    };

    const handleCanPlay = () => {
        setIsBuffering(false);
        if (canPlayTimerRef.current) clearTimeout(canPlayTimerRef.current);
    };

    const handleWaiting = () => {
        setIsBuffering(true);
    };

    const handleVideoEnd = () => {
        if (nextEpisodeKey) {
            setShowNextOverlay(true);
            setNextCountdown(5);
            nextTimerRef.current = setInterval(() => {
                setNextCountdown(prev => {
                    if (prev <= 1) {
                        playNextEpisode();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
    };

    const playNextEpisode = () => {
        if (nextTimerRef.current) clearInterval(nextTimerRef.current);
        const match = nextEpisodeKey?.match(/(\d+):s(\d+)e(\d+)/);
        if (match) {
            const showId = match[1];
            const season = match[2];
            const episode = match[3];
            navigate(`/watch/${showId}?type=tv&s=${season}&e=${episode}&offline=true`);
        }
    };

    const cancelNextEpisode = () => {
        if (nextTimerRef.current) clearInterval(nextTimerRef.current);
        setShowNextOverlay(false);
    };

    const handleScrubberPointerDown = (e: React.PointerEvent) => {
        if (!scrubberRef.current || !videoRef.current) return;
        setIsDragging(true);
        const rect = scrubberRef.current.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setProgress(pos * 100);
        const newTime = pos * videoRef.current.duration;
        setCurrentTime(newTime);
        videoRef.current.currentTime = newTime;
    };

    const handleScrubberPointerMove = (e: React.PointerEvent) => {
        if (!scrubberRef.current || !videoRef.current) return;
        const rect = scrubberRef.current.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        
        setHoverPos(pos * 100);
        setHoverTime(pos * videoRef.current.duration);

        if (isDragging) {
            setProgress(pos * 100);
            const newTime = pos * videoRef.current.duration;
            setCurrentTime(newTime);
            videoRef.current.currentTime = newTime;
        }
    };

    const handleScrubberPointerUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        const handleGlobalPointerUp = () => setIsDragging(false);
        const handleGlobalPointerMove = (e: PointerEvent) => {
            if (isDragging && scrubberRef.current && videoRef.current) {
                const rect = scrubberRef.current.getBoundingClientRect();
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setProgress(pos * 100);
                const newTime = pos * videoRef.current.duration;
                setCurrentTime(newTime);
                videoRef.current.currentTime = newTime;
            }
        };
        
        window.addEventListener('pointerup', handleGlobalPointerUp);
        if (isDragging) window.addEventListener('pointermove', handleGlobalPointerMove);
        
        return () => {
            window.removeEventListener('pointerup', handleGlobalPointerUp);
            window.removeEventListener('pointermove', handleGlobalPointerMove);
        };
    }, [isDragging]);

    const toggleFullscreen = useCallback(async () => {
        if (isTauri) {
            try {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                const appWindow = getCurrentWindow();
                const currentlyFullscreen = isFullscreenRef.current;
                const nextFS = !currentlyFullscreen;
                
                // Bulletproof fullscreen entry/exit toggling decorations and fullscreen
                if (nextFS) {
                    await appWindow.setDecorations(false);
                    await appWindow.setFullscreen(true);
                } else {
                    await appWindow.setFullscreen(false);
                    await appWindow.setDecorations(true);
                }
                
                setIsFullscreen(nextFS);
                isFullscreenRef.current = nextFS;

                // Toggle body class and dispatch direct custom event instantly
                document.body.classList.toggle('is-fullscreen', nextFS);
                window.dispatchEvent(new CustomEvent("tauri-fullscreen", { detail: { fullscreen: nextFS } }));

                // Dispatch standard events as a fallback
                setTimeout(() => {
                    window.dispatchEvent(new Event("resize"));
                    window.dispatchEvent(new Event("fullscreenchange"));
                }, 150);
            } catch (err) {
                console.error("Tauri setFullscreen failed:", err);
            }
        } else {
            if (!document.fullscreenElement && containerRef.current) {
                containerRef.current.requestFullscreen().catch(console.error);
                setIsFullscreen(true);
                isFullscreenRef.current = true;
            } else if (document.exitFullscreen) {
                document.exitFullscreen();
                setIsFullscreen(false);
                isFullscreenRef.current = false;
            }
        }
    }, [containerRef]);

    useEffect(() => {
        let unlisten: (() => void) | null = null;
        
        const updateStates = async () => {
            if (isTauri) {
                try {
                    const { getCurrentWindow } = await import('@tauri-apps/api/window');
                    const appWindow = getCurrentWindow();
                    const isFS = await appWindow.isFullscreen();
                    setIsFullscreen(isFS);
                    isFullscreenRef.current = isFS;
                    document.body.classList.toggle('is-fullscreen', isFS);
                } catch (e) {
                    console.error("Failed to check fullscreen state in Player:", e);
                }
            } else {
                const isFS = !!document.fullscreenElement;
                setIsFullscreen(isFS);
                isFullscreenRef.current = isFS;
            }
        };

        const handleTauriFullscreen = (e: Event) => {
            const customEvent = e as CustomEvent<{ fullscreen: boolean }>;
            const isFS = !!customEvent.detail?.fullscreen;
            setIsFullscreen(isFS);
            isFullscreenRef.current = isFS;
            document.body.classList.toggle('is-fullscreen', isFS);
        };

        const setupListener = async () => {
            if (isTauri) {
                try {
                    const { getCurrentWindow } = await import('@tauri-apps/api/window');
                    const appWindow = getCurrentWindow();
                    await updateStates();
                    const unlistenFn = await appWindow.onResized(updateStates);
                    unlisten = unlistenFn;
                } catch (e) {
                    console.error("Failed to setup Tauri resize listener:", e);
                }
            } else {
                document.addEventListener('fullscreenchange', updateStates);
            }
        };

        setupListener();

        // 300ms fallback interval to prevent race conditions
        const interval = setInterval(updateStates, 300);

        // Bind standard & custom event listeners for instant reactivity
        window.addEventListener('resize', updateStates);
        window.addEventListener('fullscreenchange', updateStates);
        window.addEventListener('tauri-fullscreen', handleTauriFullscreen);

        return () => {
            clearInterval(interval);
            if (unlisten) unlisten();
            document.removeEventListener('fullscreenchange', updateStates);
            window.removeEventListener('resize', updateStates);
            window.removeEventListener('fullscreenchange', updateStates);
            window.removeEventListener('tauri-fullscreen', handleTauriFullscreen);
        };
    }, []);

    const toggleMute = () => {
        if (videoRef.current) {
            const newMuted = !videoRef.current.muted;
            videoRef.current.muted = newMuted;
            setIsMuted(newMuted);
            if (!newMuted && volume === 0) setVolume(1);
        }
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVolume(val);
        if (videoRef.current) {
            videoRef.current.volume = val;
            videoRef.current.muted = val === 0;
            setIsMuted(val === 0);
        }
    };

    const togglePiP = async () => {
        if (videoRef.current) {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await videoRef.current.requestPictureInPicture();
            }
        }
    };

    const skip = (seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime += seconds;
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const key = e.key.toLowerCase();
            
            // Escape key is universal shortcut (both online & offline)
            if (key === 'escape') {
                if (isFullscreenRef.current) {
                    e.preventDefault();
                    toggleFullscreen();
                }
                return;
            }

            if (!isOffline) return; // Only native shortcuts for offline

            switch (key) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'm':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'p':
                    e.preventDefault();
                    togglePiP();
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    skip(-10);
                    break;
                case 'arrowright':
                    e.preventDefault();
                    skip(10);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOffline, toggleFullscreen]);

    const openSystemPlayer = async () => {
        await openExternalPlayer('system');
    };

    if (!isOffline) {
        return (
            <div 
                className="w-full h-full relative group bg-black"
                onDoubleClick={toggleFullscreen}
            >
                <iframe
                    src={vidsrcUrl}
                    className="w-full h-full border-0"
                    allowFullScreen
                    onLoad={onIframeLoad}
                />
            </div>
        );
    }

    if (playbackStage === 'failed') {
        return (
            <div className="flex flex-col items-center justify-center text-center p-8 gap-6 w-full h-full bg-[#0D0D0D]">
                <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 animate-pulse">
                    <ExternalLink className="w-12 h-12 text-[#E50914]" />
                </div>
                <div>
                    <h2 className="text-white text-2xl font-black tracking-tight mb-2">Built-in Player Failed</h2>
                    <p className="text-[#AEAEB2] text-sm max-w-md mx-auto">
                        This file format (likely MKV/H.265/AC3) isn't supported natively by the built-in HTML5 player, and the automated MP4 remuxing failed.
                    </p>
                    {remuxError && (
                        <p className="text-[#636366] text-xs font-mono mt-3 bg-[#1C1C1E] border border-[#3A3A3C] p-2 rounded-lg max-w-md mx-auto truncate">
                            Error: {remuxError}
                        </p>
                    )}
                </div>
                
                <div className="flex flex-col gap-3 w-full max-w-sm">
                    <Button 
                        onClick={() => openExternalPlayer('vlc')} 
                        className="bg-[#E50914] hover:bg-[#B00610] text-white rounded-xl py-6 font-bold flex items-center justify-center gap-2 shadow-lg"
                    >
                        <span>Open in VLC Media Player</span>
                        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full uppercase">Best</span>
                    </Button>
                    
                    <div className="grid grid-cols-2 gap-2">
                        <Button 
                            variant="outline"
                            onClick={() => openExternalPlayer('mpv')} 
                            className="border-[#3A3A3C] hover:bg-[#1C1C1E] text-white rounded-xl py-5 text-xs font-bold"
                        >
                            Open in MPV
                        </Button>
                        <Button 
                            variant="outline"
                            onClick={() => openExternalPlayer('system')} 
                            className="border-[#3A3A3C] hover:bg-[#1C1C1E] text-white rounded-xl py-5 text-xs font-bold"
                        >
                            System Default
                        </Button>
                    </div>

                    <Button 
                        variant="ghost"
                        onClick={async () => {
                            try {
                                const { invoke } = await import("@tauri-apps/api/core");
                                const result = await invoke<string | null>("browse_custom_player");
                                if (result) {
                                    setCustomPlayerPath(result);
                                    setPreferredExternalPlayer("custom");
                                    openExternalPlayer('custom', result);
                                }
                            } catch (err) {
                                console.error(err);
                            }
                        }}
                        className="text-[#AEAEB2] hover:text-white text-xs"
                    >
                        {customPlayerPath ? `Open in Custom Player (${customPlayerPath.split('\\').pop()})` : "Choose Custom Player Executable..."}
                    </Button>

                    <Button
                        variant="link"
                        onClick={() => navigate('/settings')}
                        className="text-[#636366] hover:text-[#AEAEB2] text-[11px]"
                    >
                        Configure default fallback preferences in Settings
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div 
            className="w-full h-full relative group bg-black overflow-hidden" 
            onPointerMove={handlePointerMove}
            onPointerLeave={() => { if(isPlaying && !isDragging) setShowControls(false); }}
            onDoubleClick={toggleFullscreen}
        >
            {p2pLoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-none">
                    <Loader2 className="w-12 h-12 text-[#E50914] animate-spin" />
                </div>
            )}

            {isBuffering && !p2pLoading && (
                <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
                    <div className="w-16 h-16 rounded-full border-4 border-[#E50914] border-t-transparent animate-spin opacity-80" />
                </div>
            )}

            {playbackStage === 'remuxing' && (
                <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 px-6 text-center">
                    <Loader2 className="w-12 h-12 text-[#E50914] animate-spin mb-4" />
                    <h3 className="text-white text-xl font-bold tracking-tight mb-2">Optimizing Video Format...</h3>
                    <p className="text-[#AEAEB2] text-sm max-w-md mb-6">
                        This format isn't supported natively by your browser. We are optimizing it to MP4 in real-time. This can take up to 30 seconds.
                    </p>
                    <Button 
                        onClick={cancelRemux}
                        className="bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl px-6 py-5 text-xs font-bold"
                    >
                        Skip to External Player
                    </Button>
                </div>
            )}

            {showPlayAnim && (
                <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                    <div className="animate-ping-once bg-black/40 rounded-full p-6 backdrop-blur-sm">
                        {playAnimType === 'play' ? <Play className="w-12 h-12 text-white fill-white" /> : <Pause className="w-12 h-12 text-white fill-white" />}
                    </div>
                </div>
            )}

            {showNextOverlay && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80">
                    <h3 className="text-white text-2xl font-bold mb-6">Up Next</h3>
                    <div className="relative w-24 h-24 flex items-center justify-center mb-8">
                        <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                            <circle cx="48" cy="48" r="45" stroke="#3A3A3C" strokeWidth="6" fill="none" />
                            <circle cx="48" cy="48" r="45" stroke="#E50914" strokeWidth="6" fill="none" 
                                strokeDasharray="283" strokeDashoffset={283 - (283 * nextCountdown) / 5} 
                                className="transition-all duration-1000 linear" />
                        </svg>
                        <span className="text-white text-3xl font-bold">{nextCountdown}</span>
                    </div>
                    <div className="flex gap-4">
                        <Button onClick={playNextEpisode} className="bg-[#E50914] hover:bg-[#B00610] text-white px-8 rounded-full">Play Now</Button>
                        <Button onClick={cancelNextEpisode} variant="outline" className="text-white border-white/20 hover:bg-white/10 px-8 rounded-full">Cancel</Button>
                    </div>
                </div>
            )}

            {/* MKV Compatibility Notice Banner */}
            {isOffline && (filePath?.toLowerCase().endsWith('.mkv') || offlineSrc?.toLowerCase().includes('.mkv')) && showControls && (
                <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-[#1C1C1E]/95 border border-[#E50914]/30 backdrop-blur-md px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-2xl z-40 max-w-sm pointer-events-auto transition-all duration-300 hover:border-[#E50914]/60">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#E50914] animate-pulse shrink-0" />
                    <div className="flex-1 text-left">
                        <p className="text-white text-xs font-bold">MKV Playback Mode</p>
                        <p className="text-[#AEAEB2] text-[10px] leading-normal font-medium">
                            If you hear audio but see a black screen, open in an external player instead.
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            if (preferredExternalPlayer !== 'custom' || customPlayerPath) {
                                openExternalPlayer(preferredExternalPlayer);
                            } else {
                                setShowPlayerModal(true);
                            }
                        }}
                        className="text-[10px] font-bold text-white bg-[#E50914] hover:bg-[#B00610] px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                        Open VLC/MPV
                    </button>
                </div>
            )}

            {/* Video Element */}
            <video
                ref={videoRef}
                src={playbackStage === 'remuxed' ? (remuxedSrc || '') : (offlineSrc || '')}
                className="w-full h-full"
                onClick={togglePlay}
                onDoubleClick={toggleFullscreen}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onCanPlay={handleCanPlay}
                onWaiting={handleWaiting}
                onEnded={handleVideoEnd}
                onError={handleVideoError}
            >
                {/* Add subtitles if parsed manually, but currently we just fetch files. 
                    Local file paths to <track> might need blob URLs or proxy mapping. 
                    For now, we can proxy them through 8083 just like video. */}
                {subtitles.map((sub, idx) => {
                    const encoded = btoa(unescape(encodeURIComponent(sub)));
                    return (
                        <track 
                            key={idx} 
                            kind="subtitles" 
                            src={`http://127.0.0.1:8083/p2p-stream/?path=${encoded}`} 
                            label={`Subtitle ${idx + 1}`} 
                        />
                    );
                })}
            </video>

            {/* Controls Overlay */}
            <div 
                className={`absolute inset-0 pointer-events-none transition-opacity duration-300 flex flex-col justify-end ${showControls ? 'opacity-100' : 'opacity-0'}`}
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 30%, transparent 100%)' }}
            >
                <div className="pointer-events-auto p-4 flex flex-col gap-2">
                    {/* Top Right Next Episode Button */}
                    {nextEpisodeKey && showControls && !showNextOverlay && (
                        <div className="absolute top-6 right-6 pointer-events-auto">
                            <Button 
                                onClick={playNextEpisode}
                                className="bg-black/60 hover:bg-[#E50914] border border-white/10 text-white backdrop-blur-md rounded-lg gap-2 transition-colors"
                            >
                                Next Episode <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    )}

                    {/* Scrubber Bar */}
                    <div 
                        className="w-full h-8 flex items-center cursor-pointer group relative"
                        ref={scrubberRef}
                        onPointerDown={handleScrubberPointerDown}
                        onPointerMove={handleScrubberPointerMove}
                        onPointerLeave={() => setHoverTime(null)}
                    >
                        {hoverTime !== null && (
                            <div 
                                className="absolute bottom-full mb-2 bg-[#1C1C1E] text-white text-xs px-2 py-1 rounded pointer-events-none transform -translate-x-1/2 shadow-lg border border-[#3A3A3C]"
                                style={{ left: `${hoverPos}%` }}
                            >
                                {formatTime(hoverTime)}
                            </div>
                        )}
                        <div className="w-full bg-white/20 h-1 group-hover:h-2 transition-all rounded-full relative">
                            {/* Hover Bar */}
                            {hoverTime !== null && (
                                <div 
                                    className="absolute top-0 left-0 h-full bg-white/40 rounded-full"
                                    style={{ width: `${hoverPos}%` }}
                                />
                            )}
                            {/* Progress Bar */}
                            <div 
                                className="absolute top-0 left-0 h-full bg-[#E50914] rounded-full"
                                style={{ width: `${progress}%` }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transform translate-x-1/2 shadow" />
                            </div>
                        </div>
                    </div>

                    {/* Controls Layout */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={togglePlay} className="text-white hover:text-[#E50914] transition-colors">
                                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                            </button>
                            <button onClick={() => skip(-10)} className="text-white hover:text-white/70 transition-colors">
                                <SkipBack className="w-5 h-5" />
                            </button>
                            <button onClick={() => skip(10)} className="text-white hover:text-white/70 transition-colors">
                                <SkipForward className="w-5 h-5" />
                            </button>

                            <div className="flex items-center gap-2 group/volume relative">
                                <button onClick={toggleMute} className="text-white hover:text-white/70 transition-colors">
                                    {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                                </button>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={isMuted ? 0 : volume}
                                    onChange={handleVolumeChange}
                                    className="w-0 opacity-0 group-hover/volume:w-20 group-hover/volume:opacity-100 transition-all duration-300 origin-left accent-[#E50914] h-1"
                                />
                            </div>

                            <div className="text-white text-sm font-medium ml-2 font-mono">
                                {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
                            </div>
                        </div>

                        <div className="flex items-center gap-4 relative">
                            {/* Playback Speed Menu */}
                            {showSpeedMenu && (
                                <div className="absolute bottom-full right-0 mb-4 bg-[#1C1C1E] border border-[#3A3A3C] rounded-lg shadow-xl overflow-hidden min-w-[120px] z-50">
                                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                                        <button
                                            key={speed}
                                            onClick={() => {
                                                setPlaybackRate(speed);
                                                if (videoRef.current) videoRef.current.playbackRate = speed;
                                                setShowSpeedMenu(false);
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${playbackRate === speed ? 'text-[#E50914] font-bold bg-[#E50914]/10' : 'text-white'}`}
                                        >
                                            {speed}x
                                        </button>
                                    ))}
                                </div>
                            )}

                            <button 
                                onClick={() => setShowSpeedMenu(!showSpeedMenu)} 
                                className={`text-sm font-bold transition-colors ${playbackRate !== 1 ? 'text-[#E50914]' : 'text-white hover:text-white/70'}`}
                            >
                                {playbackRate}x
                            </button>

                            <button 
                                onClick={() => {
                                    if (preferredExternalPlayer !== 'custom' || customPlayerPath) {
                                        openExternalPlayer(preferredExternalPlayer);
                                    } else {
                                        setShowPlayerModal(true);
                                    }
                                }} 
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setShowPlayerModal(true);
                                }}
                                className="text-white hover:text-[#E50914] transition-colors pointer-events-auto" 
                                title={`Open in External Player (${preferredExternalPlayer === 'system' ? 'System Default' : preferredExternalPlayer === 'custom' ? 'Custom' : preferredExternalPlayer.toUpperCase()}) - Right click to change`}
                            >
                                <ExternalLink className="w-5 h-5" />
                            </button>

                            <button onClick={togglePiP} className="text-white hover:text-white/70 transition-colors" title="Picture in Picture">
                                <Minimize className="w-5 h-5" />
                            </button>

                            <button onClick={toggleFullscreen} className="text-white hover:text-white/70 transition-colors">
                                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick External Player Settings Modal */}
            {showPlayerModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
                    <div className="bg-[#1C1C1E] border border-[#3A3A3C] w-full max-w-md p-6 rounded-2xl shadow-2xl flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-white text-lg font-black tracking-tight flex items-center gap-2">
                                <ExternalLink className="w-5 h-5 text-[#E50914]" />
                                External Player Settings
                            </h3>
                            <button 
                                onClick={() => setShowPlayerModal(false)}
                                className="text-[#AEAEB2] hover:text-white text-xs font-bold bg-[#2C2C2E] px-3 py-1 rounded-md"
                            >
                                Close
                            </button>
                        </div>

                        <div className="flex flex-col gap-3">
                            <p className="text-[#AEAEB2] text-xs">
                                Configure which media player to launch when manually casting or as an automatic fallback when the built-in HTML5 engine fails.
                            </p>
                            
                            <div className="flex flex-col gap-2 mt-2">
                                {[
                                    { id: 'system', name: 'System Default Player', desc: 'OS default association for this file extension' },
                                    { id: 'vlc', name: 'VLC Media Player', desc: 'Industry-standard compatibility (recommended)' },
                                    { id: 'mpv', name: 'MPV Player', desc: 'High performance, lightweight, minimal' },
                                    { id: 'custom', name: 'Custom Executable Path', desc: 'Point to any player binary (.exe) on your drive' }
                                ].map(p => (
                                    <button
                                        key={p.id}
                                        onClick={async () => {
                                            if (p.id === 'custom') {
                                                try {
                                                    const { invoke } = await import("@tauri-apps/api/core");
                                                    const path = await invoke<string | null>("browse_custom_player");
                                                    if (path) {
                                                        setCustomPlayerPath(path);
                                                        setPreferredExternalPlayer('custom');
                                                    }
                                                } catch (e) {
                                                    console.error("Failed to browse custom player", e);
                                                }
                                            } else {
                                                setPreferredExternalPlayer(p.id as any);
                                            }
                                        }}
                                        className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                                            preferredExternalPlayer === p.id 
                                                ? 'bg-[#E50914]/10 border-[#E50914]' 
                                                : 'bg-[#2C2C2E]/50 border-transparent hover:border-[#3A3A3C]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-white text-sm font-bold">{p.name}</span>
                                            {preferredExternalPlayer === p.id && (
                                                <span className="w-2 h-2 rounded-full bg-[#E50914]" />
                                            )}
                                        </div>
                                        <span className="text-[#AEAEB2] text-[10px] mt-0.5">{p.desc}</span>
                                    </button>
                                ))}
                            </div>

                            {preferredExternalPlayer === 'custom' && (
                                <div className="bg-[#2C2C2E]/30 border border-[#3A3A3C] p-3 rounded-xl flex flex-col gap-2 mt-1">
                                    <span className="text-[#AEAEB2] text-[10px] font-bold uppercase tracking-wider">Executable Path</span>
                                    <span className="text-white text-xs font-mono break-all bg-black/40 p-2 rounded-lg border border-[#3A3A3C]">
                                        {customPlayerPath || "Not chosen yet"}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={async () => {
                                            try {
                                                const { invoke } = await import("@tauri-apps/api/core");
                                                const path = await invoke<string | null>("browse_custom_player");
                                                if (path) {
                                                    setCustomPlayerPath(path);
                                                }
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        }}
                                        className="text-xs text-white border-[#3A3A3C] hover:bg-[#1C1C1E] self-start"
                                    >
                                        Browse File System
                                    </Button>
                                </div>
                            )}
                        </div>

                        <Button
                            onClick={() => {
                                openExternalPlayer(preferredExternalPlayer);
                                setShowPlayerModal(false);
                            }}
                            disabled={preferredExternalPlayer === 'custom' && !customPlayerPath}
                            className="bg-[#E50914] hover:bg-[#B00610] text-white rounded-xl py-6 font-bold flex items-center justify-center gap-2 shadow-lg"
                        >
                            Launch External Player Now
                        </Button>
                    </div>
                </div>
            )}
            
            <style>{`
                .animate-ping-once {
                    animation: ping-once 0.5s cubic-bezier(0, 0, 0.2, 1) forwards;
                }
                @keyframes ping-once {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.5); opacity: 0; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
