/**
 * Torrentio API integration for StreamVault
 * Fetches high-quality magnet links for Movies and TV Shows.
 */

export interface TorrentioStream {
    name: string;
    title: string;
    infoHash: string;
    fileIdx?: number;
}

export interface TorrentioResult {
    streams: TorrentioStream[];
    error?: string;
}

/**
 * Fetch available torrent streams from Torrentio by IMDB ID.
 * Supports Movies and TV Shows.
 */
export async function fetchTorrentioStreams(
    imdbId: string,
    type: 'movie' | 'tv' = 'movie',
    season?: number,
    episode?: number
): Promise<TorrentioResult> {
    try {
        if (!imdbId) return { streams: [], error: 'Missing IMDB ID' };

        // Construct Torrentio URL
        // Movie: https://torrentio.strem.fun/stream/movie/tt...json
        // Series: https://torrentio.strem.fun/stream/series/tt...%3A1%3A1.json (tt...:S:E)
        let idPath = imdbId;
        if (type === 'tv' && season !== undefined && episode !== undefined) {
            idPath = `${imdbId}:${season}:${episode}`;
        }

        const url = `https://torrentio.strem.fun/stream/${type === 'movie' ? 'movie' : 'series'}/${idPath}.json`;

        console.log(`[Vault] Fetching Torrentio: ${url}`);
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

        if (!res.ok) {
            throw new Error(`Torrentio returned ${res.status}`);
        }

        const json = await res.json();
        const streams = (json.streams || []) as TorrentioStream[];

        return { streams };
    } catch (err: any) {
        console.error("[Vault] Torrentio Error:", err);
        return { streams: [], error: err.message || String(err) };
    }
}

/**
 * Normalizes the messy Torrentio title and name into clean display labels.
 */
export function normalizeTorrentioStream(stream: TorrentioStream) {
    const lines = stream.title.split('\n');
    const fileName = lines[0] || 'Unknown File';

    // Extract size from second line if available (Size: 2.18 GB)
    const sizeLine = lines.find(l => l.toLowerCase().includes('size:')) || '';
    const size = sizeLine.replace(/Size:\s*/i, '').trim();

    // Extract seeds if available (👤 12)
    const seedLine = lines.find(l => l.includes('👤') || l.toLowerCase().includes('seeders:')) || '';
    const seeds = seedLine.replace(/[👤\s]|Seeders:\s*/gi, '').trim();

    // Quality detection (Torrentio\n1080p)
    const nameParts = stream.name.split('\n');
    const quality = nameParts[1] || '720p';
    const provider = nameParts[0] || 'Unknown';

    // Weighted ranking logic based on user trust
    let rank = 0;
    const lowerTitle = stream.title.toLowerCase();
    const lowerName = stream.name.toLowerCase();

    if (lowerTitle.includes('yts') || lowerName.includes('yts')) rank = 1000;
    else if (lowerTitle.includes('1337x') || lowerName.includes('1337x')) rank = 900;
    else if (lowerTitle.includes('tpb') || lowerTitle.includes('piratebay')) rank = 800;
    else rank = (parseInt(seeds, 10) || 0);

    return {
        fileName,
        size,
        seeds: parseInt(seeds, 10) || 0,
        quality,
        provider,
        rank,
        infoHash: stream.infoHash,
        fileIdx: stream.fileIdx
    };
}
