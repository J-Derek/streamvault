import { StreamVaultMedia } from "@/lib/tmdb-types";

export interface DirectLink {
    url: string;
    quality: string;
    source: string;
    size?: string;
    isMagnet: boolean;
}

interface ScraperSource {
    name: string;
    fetch: (imdbId: string, mediaType: 'movie' | 'tv', season?: number, episode?: number) => Promise<DirectLink[]>;
}

// In-memory cache to avoid re-scraping the same title in a session
const resultCache = new Map<string, { links: DirectLink[]; ts: number }>();
const CACHE_TTL = 1000 * 60 * 15; // 15 min

function getCached(key: string): DirectLink[] | null {
    const entry = resultCache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.links;
    resultCache.delete(key);
    return null;
}

function setCache(key: string, links: DirectLink[]) {
    resultCache.set(key, { links, ts: Date.now() });
}

function parseQuality(label: string): string {
    const lower = label.toLowerCase();
    if (lower.includes('2160') || lower.includes('4k')) return '4K';
    if (lower.includes('1080')) return '1080p';
    if (lower.includes('720')) return '720p';
    if (lower.includes('480')) return '480p';
    if (lower.includes('360')) return '360p';
    return 'HD';
}

function buildTorrentioMagnet(stream: any): string | null {
    if (stream?.url?.startsWith('magnet:')) return stream.url;
    if (stream?.infoHash) return `magnet:?xt=urn:btih:${stream.infoHash}`;
    return null;
}

const SCRAPERS: ScraperSource[] = [
    {
        name: 'Torrentio',
        fetch: async (imdbId, mediaType, season, episode) => {
            const type = mediaType === 'movie' ? 'movie' : 'series';
            const suffix = episode ? `${imdbId}:${season}:${episode}` : imdbId;
            const res = await fetch(`https://torrentio.strem.fun/stream/${type}/${suffix}.json`, {
                signal: AbortSignal.timeout(8000)
            });
            const data = await res.json();
            if (!data?.streams?.length) return [];

            return data.streams
                .filter((s: any) => !!buildTorrentioMagnet(s))
                .map((s: any) => {
                    const rawName = ((s.name ?? '') + ' ' + (s.title ?? '')).toLowerCase();
                    const qual = parseQuality(rawName);
                    const sizeMatch = (s.title ?? '').match(/([\d.]+\s*(?:GB|MB|TB))/i);
                    return {
                        url: buildTorrentioMagnet(s)!,
                        quality: qual,
                        source: 'Torrentio',
                        size: sizeMatch?.[1] ?? undefined,
                        isMagnet: true,
                    };
                });
        }
    },
    {
        name: 'SuperEmbed',
        fetch: async (imdbId, mediaType) => {
            if (mediaType !== 'movie') return [];
            const urls = [
                `https://multiembed.mov/direct-stream.php?video_id=${imdbId}&tmdb=1`,
                `https://embed.su/direct-stream.php?video_id=${imdbId}&tmdb=1`,
            ];
            const fetchOne = async (url: string): Promise<DirectLink[]> => {
                const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
                if (!res.ok) throw new Error("Fetch failed");
                const text = await res.text();
                const urlMatch = text.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|mkv|webm)[^\s"'<>]*/i);
                const found = urlMatch?.[0];
                if (found) return [{ url: found, quality: 'HD', source: 'SuperEmbed', isMagnet: false }];
                throw new Error("No link found");
            };
            try {
                return await Promise.any(urls.map(fetchOne));
            } catch {
                return [];
            }
        }
    },
];

async function fetchWithFallback(urls: string[], timeoutMs = 6000): Promise<Response | null> {
    const fetchOne = async (u: string) => {
        const res = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return res;
        throw new Error("Failed");
    };
    try {
        return await Promise.any(urls.map(fetchOne));
    } catch {
        return null;
    }
}

const YTS_DIRECT_SOURCES: ScraperSource = {
    name: 'YTS',
    fetch: async (imdbId) => {
        const urls = [
            `https://yts.mx/api/v2/movie_details.json?imdb_id=${imdbId}&with_images=false&with_cast=false`,
            `https://yts.torrentbay.to/api/v2/movie_details.json?imdb_id=${imdbId}&with_images=false&with_cast=false`,
        ];

        const res = await fetchWithFallback(urls);
        if (!res) return [];

        const json = await res.json();
        if (json.status !== 'ok' || !json.data?.movie?.torrents) return [];

        return json.data.movie.torrents.map((t: any) => {
            const qual = t.quality?.includes('2160') ? '4K' :
                t.quality?.includes('1080') ? '1080p' :
                    t.quality?.includes('720') ? '720p' : 'HD';
            return {
                url: `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(json.data.movie.title || '')}`,
                quality: qual,
                source: 'YTS',
                size: t.size ?? undefined,
                isMagnet: true,
            };
        });
    }
};

export const findBestDownloadLink = async (media: StreamVaultMedia, imdbId: string): Promise<string> => {
    const results = await findAllLinks(media, imdbId);
    const direct = results.find(r => !r.isMagnet);
    if (direct) return direct.url;
    const bestP2P = results.find(r => r.isMagnet);
    if (bestP2P) return bestP2P.url;
    throw new Error("Could not find any downloadable source.");
};

export const findDirectOnlyLink = async (media: StreamVaultMedia, imdbId: string): Promise<string | null> => {
    const results = await findAllLinks(media, imdbId);
    const direct = results.find(r => !r.isMagnet);
    return direct?.url ?? null;
};

export const findAllLinks = async (
    media: StreamVaultMedia,
    imdbId: string,
    season?: number,
    episode?: number,
): Promise<DirectLink[]> => {
    if (!imdbId) return [];

    const cacheKey = `${imdbId}:${media.mediaType}:${season ?? ''}:${episode ?? ''}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const allSources: ScraperSource[] = [
        ...SCRAPERS,
        ...(media.mediaType === 'movie' ? [YTS_DIRECT_SOURCES] : []),
    ];

    const allLinks: DirectLink[] = [];
    const seen = new Set<string>();

    const dedup = (links: DirectLink[]) => {
        for (const l of links) {
            const key = `${l.quality}:${l.source}:${l.url.slice(0, 40)}`;
            if (!seen.has(key)) {
                seen.add(key);
                allLinks.push(l);
            }
        }
    };

    await Promise.all(allSources.map(async (source) => {
        try {
            const links = await source.fetch(imdbId, media.mediaType, season, episode);
            dedup(links);
        } catch { /* source failed, skip */ }
    }));

    // Sort: 4K > 1080p > 720p > HD
    const QUAL_ORDER = ['4K', '1080p', '720p', 'HD', '480p', '360p'];
    allLinks.sort((a, b) => QUAL_ORDER.indexOf(a.quality) - QUAL_ORDER.indexOf(b.quality));

    setCache(cacheKey, allLinks);
    return allLinks;
};

export const clearScraperCache = () => resultCache.clear();
