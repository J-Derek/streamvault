/**
 * YTS API integration for StreamVault
 *
 * YTS provides movie metadata + torrent hashes for high-quality releases.
 * We use the hash to build magnet URIs — the user NEVER sees a .torrent file.
 * The magnet is consumed internally by WebTorrent to drive the download.
 */

// Standard BitTorrent trackers for best connectivity
const TRACKERS = [
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:80',
    'udp://tracker.coppersurfer.tk:6969',
    'udp://glotorrents.pw:6969/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://torrent.gresille.org:80/announce',
    'udp://p4p.arenabg.com:1337',
    'udp://tracker.leechers-paradise.org:6969',
];

export interface YTSTorrent {
    url: string;          // .torrent file url (we ignore this)
    hash: string;         // info-hash — all we need
    quality: '720p' | '1080p' | '1080p.x265' | '2160p' | string;
    type: 'web' | 'bluray' | string;
    video_codec: string;
    bit_depth: string;
    audio_channels: string;
    seeds: number;
    peers: number;
    size: string;         // human-readable, e.g. "2.18 GB"
    size_bytes: number;
    date_uploaded: string;
}

export interface YTSMovie {
    id: number;
    imdb_code: string;
    title: string;
    year: number;
    rating: number;
    runtime: number;
    summary: string;
    torrents: YTSTorrent[];
}

export interface YTSResult {
    movie: YTSMovie | null;
    error?: string;
}

/**
 * Fetch available YTS quality options for a movie by IMDB ID.
 * Works on both web (via proxy or CORS-open API) and Tauri.
 */
export async function fetchYTSMovie(imdbId: string): Promise<YTSResult> {
    try {
        const targetUrl = encodeURIComponent(`https://yts.mx/api/v2/movie_details.json?imdb_id=${imdbId}&with_images=false&with_cast=false`);
        const urls = [
            `https://yts.mx/api/v2/movie_details.json?imdb_id=${imdbId}&with_images=false&with_cast=false`,
            `https://corsproxy.io/?url=${targetUrl}`,
            `https://api.allorigins.win/raw?url=${targetUrl}`,
            `https://yts.torrentbay.to/api/v2/movie_details.json?imdb_id=${imdbId}&with_images=false&with_cast=false`
        ];

        let res: Response | null = null;
        for (const u of urls) {
            try {
                res = await fetch(u, { signal: AbortSignal.timeout(6000) });
                if (res.ok) break;
            } catch (e) {
                console.warn(`Failed to fetch from ${u}`, e);
            }
        }

        if (!res || !res.ok) throw new Error(`YTS API unreachable or returned ${res?.status}`);

        const json = await res.json();
        if (json.status !== 'ok' || !json.data?.movie) {
            return { movie: null, error: 'Not found on YTS' };
        }

        const raw = json.data.movie;
        const movie: YTSMovie = {
            id: raw.id,
            imdb_code: raw.imdb_code,
            title: raw.title,
            year: raw.year,
            rating: raw.rating,
            runtime: raw.runtime,
            summary: raw.summary,
            torrents: (raw.torrents ?? []) as YTSTorrent[],
        };

        return { movie };
    } catch (err: unknown) {
        return { movie: null, error: String(err) };
    }
}

/**
 * Build a magnet URI from a YTS torrent hash.
 * The result is passed to WebTorrent — no .torrent file is ever created.
 */
export function buildMagnet(hash: string, title: string): string {
    const trackerParams = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
    const encodedTitle = encodeURIComponent(title);
    return `magnet:?xt=urn:btih:${hash}&dn=${encodedTitle}&${trackerParams}`;
}

/**
 * Label helper — formats the quality selector button text.
 */
export function qualityLabel(t: YTSTorrent): string {
    const q = t.quality.replace('.x265', '');
    const codec = t.video_codec === 'x265' ? 'HEVC' : t.video_codec.toUpperCase();
    return `${q} · ${codec} · ${t.size}`;
}
