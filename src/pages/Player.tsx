import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Copy, RefreshCw, AlertTriangle, Server, Magnet, Loader2, Home } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMovieDetails, getTVDetails, getExternalIds } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";

import { normalizeMedia, PROVIDERS } from "@/lib/tmdb-types";
import { getOfflineStreamUrl, startDownload } from "@/lib/downloads/manager";
import { useToast } from "@/components/ui/use-toast";
import { TorrentSelector } from "@/components/player/TorrentSelector";
import VideoPlayer from "@/components/player/VideoPlayer";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const FALLBACK_TIMEOUT_MS = 8000;

const isTauri = typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window);

const PlayerPage = () => {
    const { id } = useParams<{ id: string }>();
    const [queryParams, setQueryParams] = useSearchParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const mediaType = (queryParams.get("type") ?? "movie") as "movie" | "tv";
    const isMovie = mediaType === "movie";
    const numId = Number(id);

    const containerRef = useRef<HTMLDivElement>(null);
    const [showUI, setShowUI] = useState(true);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Default to VidLink
    const defaultProvider = PROVIDERS.find(p => p.id === "vidlink") || PROVIDERS[1];
    const sourceParam = queryParams.get("source") || defaultProvider.id;
    const selectedProvider = PROVIDERS.find(p => p.id === sourceParam) || defaultProvider;

    const [providerFailed, setProviderFailed] = useState(false);
    const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const iframeKey = useRef(0);

    const triggerFallback = useCallback(() => {
        setProviderFailed(true);
    }, []);

    const [torrentFallbackLoading, setTorrentFallbackLoading] = useState(false);
    const [p2pLoading, setP2pLoading] = useState(false);
    const [p2pError, setP2pError] = useState<string | null>(null);

    const handleIframeLoad = () => {
        if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
        setProviderFailed(false);
    };

    const switchProvider = (providerId: string) => {
        const next = new URLSearchParams(queryParams);
        next.set("source", providerId);
        navigate(`/watch/${numId}?${next.toString()}`, { replace: true });
    };

    const nonTorrentProviders = PROVIDERS.filter(p => p.id !== "torrentio");

    // Query for media details (must come BEFORE any hook that depends on `data`)
    const { data, isLoading, error: queryError } = useQuery<any>({
        queryKey: ["titleDetailWithExternal", numId, mediaType],
        queryFn: async () => {
            const details = mediaType === "movie" ? await getMovieDetails(numId) : await getTVDetails(numId);
            const external = await getExternalIds(numId, mediaType);

            const season = parseInt(queryParams.get("s") || "1", 10);
            const episode = parseInt(queryParams.get("e") || "1", 10);
            let finalOfflineUrl = await getOfflineStreamUrl(numId, isMovie ? undefined : season, isMovie ? undefined : episode);
            if (finalOfflineUrl && finalOfflineUrl.includes('/p2p-proxy/torrents/')) {
                const match = finalOfflineUrl.match(/\/torrents\/([a-fA-F0-9]+)\/stream/);
                if (match && match[1]) {
                    try {
                        const r = await fetch(`http://localhost:8083/p2p-proxy/torrents/${match[1]}`);
                        if (r.ok) {
                            const torrentData = await r.json();
                            if (torrentData.files && torrentData.files.length > 0) {
                                let maxIdx = 0;
                                let maxLen = 0;
                                torrentData.files.forEach((f: any, idx: number) => {
                                    if (f.length > maxLen) {
                                        maxLen = f.length;
                                        maxIdx = idx;
                                    }
                                });
                                finalOfflineUrl = finalOfflineUrl.replace('/stream/0', `/stream/${maxIdx}`);
                            }
                        }
                    } catch (e) {
                        console.error('Failed to fetch torrent file list for offline index:', e);
                    }
                }
            }

            return { ...details, ...external, finalOfflineUrl };
        },
        enabled: !!numId && !isNaN(numId),
    });

    const meta = useMemo(() => {
        if (!data) return null;
        const d = data as any;
        const title = mediaType === "movie" ? d?.title : d?.name;
        const imdbId = d?.imdb_id;
        const contentId = imdbId || String(numId);

        const season = parseInt(queryParams.get("s") || "1", 10);
        const episode = parseInt(queryParams.get("e") || "1", 10);
        const infoHash = queryParams.get("infoHash");
        const fileIdx = queryParams.get("fileIdx") || "0";
        const mirror = queryParams.get("mirror") || "webtor";

        let url = "";
        const fmt = (selectedProvider as any).urlFormat || "vidsrc-v2";

        let isOfflineFallback = false;
        if (sourceParam === "torrentio" && infoHash && selectedProvider.id === "torrentio") {
            if (mirror === "native") {
                isOfflineFallback = true;
                url = ""; // We don't use vidsrcUrl
            } else {
                isOfflineFallback = false;
                if (mirror === "webtor") {
                    url = `https://webtor.io/embed#/magnet:?xt=urn:btih:${infoHash}&file-index=0`;
                } else if (mirror === "instant") {
                    url = `https://instant.io/#${infoHash}`;
                } else if (mirror === "magnet-player") {
                    url = `https://magnet-player.com/#${infoHash}`;
                }
            }
        } else if (fmt === "vidsrc-v2") {
            url = isMovie
                ? `https://${selectedProvider.domain}/v2/embed/movie/${contentId}`
                : `https://${selectedProvider.domain}/v2/embed/tv/${contentId}/${season}/${episode}`;
        } else if (fmt === "vidsrc-path") {
            url = isMovie
                ? `https://${selectedProvider.domain}/embed/movie/${contentId}`
                : `https://${selectedProvider.domain}/embed/tv/${contentId}/${season}/${episode}`;
        } else if (fmt === "vidlink") {
            url = isMovie
                ? `https://${selectedProvider.domain}/movie/${contentId}`
                : `https://${selectedProvider.domain}/tv/${contentId}/${season}/${episode}`;
        } else if (fmt === "embed-su") {
            url = isMovie
                ? `https://embed.su/embed/movie/${numId}`
                : `https://embed.su/embed/tv/${numId}/${season}/${episode}`;
        }

        let finalOfflineUrl = d?.finalOfflineUrl;
        if (isOfflineFallback && !finalOfflineUrl && !url) {
            finalOfflineUrl = `http://127.0.0.1:8083/p2p-proxy/torrents/${infoHash.toLowerCase()}/stream/${fileIdx}`;
        }

        return {
            d, title, contentId, imdb_id: imdbId, season, episode, infoHash, fileIdx, vidsrcUrl: url, isOffline: queryParams.get("offline") === "true" || !!finalOfflineUrl || isOfflineFallback, offlineUrl: finalOfflineUrl
        };
    }, [data, mediaType, numId, queryParams, selectedProvider, sourceParam]);

    const handleTorrentFallback = useCallback(() => {
        if (!data?.imdb_id) return;
        const next = new URLSearchParams(queryParams);
        next.set("source", "torrentio");
        next.delete("infoHash"); // Ensure we show the quality selector
        navigate(`/watch/${numId}?${next.toString()}`, { replace: true });
    }, [data, numId, queryParams, navigate]);

    useEffect(() => {
        setProviderFailed(false);
        iframeKey.current++;
        if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
        if (sourceParam !== "torrentio") {
            fallbackTimer.current = setTimeout(triggerFallback, FALLBACK_TIMEOUT_MS);
        }
        return () => {
            if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
        };
    }, [sourceParam, triggerFallback]);

    // Automatically spawn P2P engine and start torrent download/stream when watching via torrentio
    const retryP2p = useRef<(() => void) | null>(null);

    useEffect(() => {
        const hash = queryParams.get("infoHash");
        const mirrorRaw = queryParams.get("mirror");
        const mirror = mirrorRaw || "webtor";

        if (sourceParam === "torrentio" && hash && mirror === "native") {
            const magnetUrl = `magnet:?xt=urn:btih:${hash}`;
            
            const initP2pStream = async () => {
                setP2pLoading(true);
                setP2pError(null);

                if (isTauri) {
                    try {
                        const { invoke } = await import("@tauri-apps/api/core");
                        console.log("PlayerPage: Spawning P2P engine for real-time stream...");
                        try { await invoke("spawn_p2p_engine"); } catch { /* ignore if already running */ }
                        await new Promise(r => setTimeout(r, 1500));
                        console.log("PlayerPage: Starting P2P download/stream for hash:", hash);
                        await invoke("start_p2p_download", { id: numId, magnet: magnetUrl });
                        setP2pLoading(false);
                    } catch (e: any) {
                        console.error("PlayerPage: Failed to spawn P2P engine or start stream:", e);
                        const msg = e?.message || String(e);
                        setP2pError(msg);
                        setP2pLoading(false);
                        toast({ title: "P2P Stream Failed", description: msg, variant: "destructive" });
                    }
                } else {
                    try {
                        console.log("PlayerPage: Sending web P2P start request for hash:", hash);
                        await fetch(`http://127.0.0.1:8083/p2p-proxy/torrents?is_url=true`, {
                            method: "POST",
                            headers: { "Content-Type": "text/plain" },
                            body: magnetUrl,
                        });
                        setP2pLoading(false);
                    } catch (e: any) {
                        console.warn("PlayerPage: Web P2P engine unreachable:", e);
                        const msg = e?.message || "P2P engine unreachable";
                        setP2pError(msg);
                        setP2pLoading(false);
                        toast({ title: "P2P Engine Unreachable", description: msg, variant: "destructive" });
                    }
                }
            };

            retryP2p.current = initP2pStream;
            initP2pStream();

            return () => {
                // Cleanup: Stop the specific torrent stream when player unmounts or source changes
                if (isTauri) {
                    import("@tauri-apps/api/core").then(({ invoke }) => {
                        invoke("stop_torrent_engine", { infoHash: hash }).catch(console.error);
                    });
                } else {
                    fetch(`http://127.0.0.1:8083/p2p-proxy/torrents/${hash.toLowerCase()}/delete`, { method: 'POST' }).catch(console.error);
                }
            };
        } else {
            setP2pLoading(false);
            setP2pError(null);
        }
    }, [sourceParam, queryParams, numId]);

    const handleMouseMove = useCallback(() => {
        setShowUI(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setShowUI(false), 3000);
    }, []);

    useEffect(() => {
        window.addEventListener("mousemove", handleMouseMove);
        handleMouseMove();

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [handleMouseMove]);

    if (isLoading) {
        return <div className="w-screen h-screen bg-[#0D0D0D] flex items-center justify-center text-white gap-3 scale-110">
            <div className="w-8 h-8 rounded-full border-2 border-[#E50914] border-t-transparent animate-spin" />
            <span className="font-black text-xs uppercase tracking-widest animate-pulse">Preparing your stream...</span>
        </div>;
    }

    if (queryError || !meta) {
        return <div className="w-screen h-screen bg-[#0D0D0D] flex flex-col items-center justify-center text-white p-10 text-center gap-6">
            <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-12 h-12 text-[#E50914]" />
            </div>
            <div>
                <h2 className="text-2xl font-black mb-2 uppercase">Extraction Failed</h2>
                <p className="text-[#AEAEB2] max-w-md">The media metadata could not be fetched. Check your internet connection or try another title.</p>
            </div>
            <Button onClick={() => navigate(-1)} className="bg-[#E50914] hover:bg-[#B00610] rounded-full px-8">Return to Browse</Button>
        </div>;
    }

    const { d, title, season, episode, infoHash, vidsrcUrl, isOffline, offlineUrl } = meta;

    return (
        <div ref={containerRef} className="relative w-screen h-screen bg-black overflow-hidden font-sans">
            {/* Safe Top Bar */}
            <div className={`absolute top-0 left-0 right-0 h-24 z-[100] px-6 pt-4 flex items-start justify-between transition-all duration-500 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none ${showUI ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full"}`}>
                <div className="flex items-start gap-4 pointer-events-auto">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.history.length > 2 ? navigate(-1) : navigate(`/title/${numId}`)}
                        className="rounded-full bg-white/5 hover:bg-white/10 text-white mt-1"
                        title="Go Back"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate("/")}
                        className="rounded-full bg-white/5 hover:bg-white/10 text-white mt-1"
                        title="Go Home"
                    >
                        <Home className="w-5 h-5" />
                    </Button>
                    <div className="flex flex-col">
                        <h1 className="text-white font-bold text-lg leading-tight">{title}</h1>
                        <div className="flex items-center gap-4">
                            <DropdownMenu>
                                <DropdownMenuTrigger className="flex items-center gap-1 text-white/40 text-[10px] uppercase tracking-widest hover:text-white/80 transition-colors focus:outline-none">
                                    {(isOffline && !infoHash) ? "OFFLINE VAULT STREAM" : (selectedProvider?.name || "Vault Stream")}
                                    {(!isOffline || !!infoHash) && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>}
                                </DropdownMenuTrigger>
                                {(!isOffline || !!infoHash) && (
                                    <DropdownMenuContent align="start" className="bg-[#1C1C1E] border-white/10 text-white min-w-[200px]">
                                        {nonTorrentProviders.map((p) => (
                                            <DropdownMenuItem 
                                                key={p.id} 
                                                onClick={() => switchProvider(p.id)}
                                                className={`cursor-pointer ${sourceParam === p.id ? 'bg-white/10' : ''}`}
                                            >
                                                <Server className="w-3.5 h-3.5 mr-2" />
                                                {p.name}
                                            </DropdownMenuItem>
                                        ))}
                                        <DropdownMenuItem onClick={handleTorrentFallback} className="cursor-pointer text-purple-400 focus:text-purple-300">
                                            <Magnet className="w-3.5 h-3.5 mr-2" />
                                            Stream from Torrent
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                )}
                            </DropdownMenu>

                            {sourceParam === "torrentio" && infoHash && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger className="flex items-center gap-1 text-purple-400/80 text-[10px] uppercase tracking-widest hover:text-purple-300 transition-colors focus:outline-none animate-pulse">
                                        Mirror: {queryParams.get("mirror") || "webtor"}
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="bg-[#1C1C1E] border-white/10 text-white min-w-[180px]">
                                        {isTauri && (
                                            <DropdownMenuItem 
                                                onClick={() => {
                                                    const next = new URLSearchParams(queryParams);
                                                    next.set("mirror", "native");
                                                    navigate(`/watch/${numId}?${next.toString()}`, { replace: true });
                                                }}
                                                className={`cursor-pointer ${queryParams.get("mirror") === "native" ? 'bg-white/10' : ''}`}
                                            >
                                                Native Torrent Stream (Local)
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem 
                                            onClick={() => {
                                                const next = new URLSearchParams(queryParams);
                                                next.set("mirror", "webtor");
                                                navigate(`/watch/${numId}?${next.toString()}`, { replace: true });
                                            }}
                                            className={`cursor-pointer ${(!queryParams.get("mirror") || queryParams.get("mirror") === "webtor") ? 'bg-white/10' : ''}`}
                                        >
                                            Webtor Player (Iframe)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem 
                                            onClick={() => {
                                                const next = new URLSearchParams(queryParams);
                                                next.set("mirror", "magnet-player");
                                                navigate(`/watch/${numId}?${next.toString()}`, { replace: true });
                                            }}
                                            className={`cursor-pointer ${queryParams.get("mirror") === "magnet-player" ? 'bg-white/10' : ''}`}
                                        >
                                            Magnet Player (Iframe)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem 
                                            onClick={() => {
                                                const next = new URLSearchParams(queryParams);
                                                next.set("mirror", "instant");
                                                navigate(`/watch/${numId}?${next.toString()}`, { replace: true });
                                            }}
                                            className={`cursor-pointer ${queryParams.get("mirror") === "instant" ? 'bg-white/10' : ''}`}
                                        >
                                            Instant.io (Iframe)
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* P2P Loading Overlay — only for torrent sources */}
            {p2pLoading && sourceParam === "torrentio" && (
                <div className="absolute inset-0 z-[90] bg-black/80 flex flex-col items-center justify-center gap-4 pointer-events-none">
                    <div className="w-12 h-12 rounded-full border-[3px] border-[#E50914] border-t-transparent animate-spin" />
                    <p className="text-white text-sm font-bold uppercase tracking-widest animate-pulse">Starting P2P Engine…</p>
                </div>
            )}

            {/* P2P Error Banner */}
            {p2pError && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[95] max-w-lg w-full px-4 pointer-events-auto">
                    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 backdrop-blur-sm">
                        <AlertTriangle className="w-5 h-5 text-[#E50914] shrink-0" />
                        <p className="text-white/90 text-sm flex-1 truncate">{p2pError}</p>
                        <Button
                            size="sm"
                            onClick={() => retryP2p.current?.()}
                            className="bg-[#E50914] hover:bg-[#B00610] text-white rounded-lg px-4 shrink-0"
                        >
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
                        </Button>
                    </div>
                </div>
            )}

            {/* Video / Content Area */}
            <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden">
                {isOffline && !offlineUrl ? (
                    <div className="flex flex-col items-center justify-center text-center p-8 gap-6 max-w-lg">
                        <div className="p-4 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                            <AlertTriangle className="w-10 h-10 text-yellow-500" />
                        </div>
                        <div>
                            <h2 className="text-white text-xl font-bold mb-1">Offline file not found</h2>
                            <p className="text-[#AEAEB2] text-sm">The downloaded file could not be located on disk. It may have been moved or deleted. Try downloading again.</p>
                        </div>
                        <div className="flex gap-3">
                            <Button onClick={() => navigate(`/title/${numId}`)} className="bg-[#E50914] hover:bg-[#B00610] rounded-full px-6">Go Back</Button>
                            <Button onClick={() => navigate("/downloads")} variant="outline" className="rounded-full px-6">Downloads</Button>
                        </div>
                    </div>
                ) : isOffline ? (
                    <VideoPlayer
                        isOffline
                        offlineSrc={offlineUrl}
                        title={title ?? ''}
                        containerRef={containerRef}
                        p2pLoading={p2pLoading}
                    />
                ) : (sourceParam === "torrentio" && !queryParams.get("infoHash")) ? (
                    <TorrentSelector
                        imdbId={meta?.imdb_id || String(numId)}
                        mediaType={mediaType}
                        season={season}
                        episode={episode}
                        onSelect={({ infoHash, fileIdx }) => {
                            const next = new URLSearchParams(queryParams);
                            next.set("infoHash", infoHash);
                            if (fileIdx !== undefined) next.set("fileIdx", String(fileIdx));
                            navigate(`/watch/${numId}?${next.toString()}`, { replace: true });
                        }}
                    />
                ) : providerFailed ? (
                    <div className="flex flex-col items-center justify-center text-center p-8 gap-6 max-w-lg">
                        <div className="p-4 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                            <AlertTriangle className="w-10 h-10 text-yellow-500" />
                        </div>
                        <div>
                            <h2 className="text-white text-xl font-bold mb-1">Server not responding?</h2>
                            <p className="text-[#AEAEB2] text-sm">The current source may be blocked or unavailable. Try another server below.</p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {nonTorrentProviders.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => switchProvider(p.id)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                                        p.id === sourceParam
                                            ? "bg-[#E50914] border-[#E50914] text-white"
                                            : "bg-[#1C1C1E] border-[#3A3A3C] text-[#AEAEB2] hover:border-[#636366] hover:text-white"
                                    }`}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                        {data?.imdb_id && (
                            <Button
                                onClick={handleTorrentFallback}
                                disabled={torrentFallbackLoading}
                                className="bg-[#BF5AF2] hover:bg-[#A855F7] text-white gap-2 rounded-full px-6"
                            >
                                {torrentFallbackLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Magnet className="w-4 h-4" />
                                )}
                                {torrentFallbackLoading ? "Finding torrent..." : "Watch via Torrent"}
                            </Button>
                        )}
                        <div className="flex gap-3 mt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setProviderFailed(false); iframeKey.current++; }}
                                className="gap-2 text-[#AEAEB2]"
                            >
                                <RefreshCw className="w-4 h-4" /> Retry current
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/title/${numId}`)}
                                className="text-[#AEAEB2]"
                            >
                                Go Back
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate("/")}
                                className="text-[#AEAEB2]"
                            >
                                Home
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <VideoPlayer
                            key={iframeKey.current}
                            isOffline={false}
                            vidsrcUrl={vidsrcUrl}
                            title={title ?? ''}
                            containerRef={containerRef}
                            onIframeLoad={handleIframeLoad}
                            p2pLoading={p2pLoading}
                        />

                        {/* Invisible Trigger Zones for Iframe Mouse Events */}
                        {!isOffline && (
                            <>
                                <div className="absolute top-0 left-0 right-0 h-2 z-[110]" onMouseMove={handleMouseMove} onMouseEnter={handleMouseMove} />
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default PlayerPage;
