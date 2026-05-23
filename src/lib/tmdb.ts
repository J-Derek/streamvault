import type {
    TMDBListResponse,
    TMDBMovie,
    TMDBTVShow,
    TMDBGenre,
    TMDBCredits,
    TMDBWatchProviders,
    TMDBProvider,
} from './tmdb-types';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

// Image URL helpers
export const posterUrl = (path: string | null, size = 'w342') =>
    path ? `${IMG_BASE}/${size}${path}` : '/placeholder-poster.svg';

export const backdropUrl = (path: string | null, size = 'w1280') =>
    path ? `${IMG_BASE}/${size}${path}` : '/placeholder-backdrop.svg';

export const profileUrl = (path: string | null, size = 'w185') =>
    path ? `${IMG_BASE}/${size}${path}` : '/placeholder-person.svg';

// Simple in-memory cache to avoid duplicate requests in same session
const cache = new Map<string, unknown>();

async function tmdbFetch<T>(
    endpoint: string,
    params: Record<string, string> = {}
): Promise<T> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = url.toString();

    if (cache.has(cacheKey)) {
        return cache.get(cacheKey) as T;
    }

    const token = import.meta.env.VITE_TMDB_READ_TOKEN;
    if (!token) {
        throw new Error('VITE_TMDB_READ_TOKEN is not set in .env.local');
    }

    const res = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    if (!res.ok) {
        throw new Error(`TMDB fetch failed: ${res.status} on ${endpoint}`);
    }

    const data = await res.json();
    cache.set(cacheKey, data);
    return data as T;
}

// ─── HOME PAGE ────────────────────────────────────────────────
export const getTrendingMovies = () =>
    tmdbFetch<TMDBListResponse<TMDBMovie>>('/trending/movie/week');

export const getTrendingAll = () =>
    tmdbFetch<TMDBListResponse<TMDBMovie | TMDBTVShow>>('/trending/all/week');

export const getNowPlaying = (page = '1') =>
    tmdbFetch<TMDBListResponse<TMDBMovie>>('/movie/now_playing', { page });

export const getTopRatedMovies = (page = '1') =>
    tmdbFetch<TMDBListResponse<TMDBMovie>>('/movie/top_rated', { page });

export const getPopularTVShows = (page = '1') =>
    tmdbFetch<TMDBListResponse<TMDBTVShow>>('/tv/popular', { page });

export const getUpcoming = () =>
    tmdbFetch<TMDBListResponse<TMDBMovie>>('/movie/upcoming');

// ─── BROWSE / DISCOVER ───────────────────────────────────────
export interface DiscoverParams {
    mediaType?: 'movie' | 'tv';
    genres?: number[];
    minRating?: number;
    yearFrom?: number;
    yearTo?: number;
    maxRuntime?: number;
    minRuntime?: number;
    withKeywords?: string;
    voteCountGte?: number;
    voteCountLte?: number;
    sortBy?: string;
    page?: number;
}

export const discoverContent = (params: DiscoverParams) => {
    const {
        mediaType = 'movie',
        genres,
        minRating,
        yearFrom,
        yearTo,
        maxRuntime,
        minRuntime,
        withKeywords,
        voteCountGte,
        voteCountLte,
        sortBy = 'popularity.desc',
        page = 1,
    } = params;

    const query: Record<string, string> = {
        sort_by: sortBy,
        page: String(page),
        'vote_count.gte': voteCountGte ? String(voteCountGte) : '50',
    };

    if (genres?.length) query.with_genres = genres.join(',');
    if (minRating) query['vote_average.gte'] = String(minRating);
    if (yearFrom) query['primary_release_date.gte'] = `${yearFrom}-01-01`;
    if (yearTo) query['primary_release_date.lte'] = `${yearTo}-12-31`;
    if (maxRuntime) query['with_runtime.lte'] = String(maxRuntime);
    if (minRuntime) query['with_runtime.gte'] = String(minRuntime);
    if (withKeywords) query.with_keywords = withKeywords;
    if (voteCountLte) query['vote_count.lte'] = String(voteCountLte);

    return tmdbFetch<TMDBListResponse<TMDBMovie>>(`/discover/${mediaType}`, query);
};

export const getGenres = (mediaType: 'movie' | 'tv' = 'movie') =>
    tmdbFetch<{ genres: TMDBGenre[] }>(`/genre/${mediaType}/list`);

// ─── SEARCH ──────────────────────────────────────────────────
export const searchMulti = (query: string, page = '1') =>
    tmdbFetch<TMDBListResponse<TMDBMovie | TMDBTVShow>>('/search/multi', { query, page });

export const searchMovies = (query: string) =>
    tmdbFetch<TMDBListResponse<TMDBMovie>>('/search/movie', { query });

export const searchPeople = (query: string) =>
    tmdbFetch('/search/person', { query });

// ─── TITLE DETAIL ────────────────────────────────────────────
export const getMovieDetails = (id: number) =>
    tmdbFetch<TMDBMovie & { credits: TMDBCredits; videos: { results: unknown[] }; similar: TMDBListResponse<TMDBMovie>; 'watch/providers': TMDBWatchProviders }>(
        `/movie/${id}`,
        { append_to_response: 'videos,credits,similar,watch/providers,reviews' }
    );

export const getTVDetails = (id: number) =>
    tmdbFetch<TMDBTVShow & { credits: TMDBCredits; videos: { results: unknown[] }; similar: TMDBListResponse<TMDBTVShow>; 'watch/providers': TMDBWatchProviders }>(
        `/tv/${id}`,
        { append_to_response: 'videos,credits,similar,watch/providers,reviews' }
    );

export const getTVSeasonDetails = (tvId: number, seasonNumber: number) =>
    tmdbFetch<any>(`/tv/${tvId}/season/${seasonNumber}`);

export const getRecommendations = (mediaType: 'movie' | 'tv', id: number, page = 1) =>
    tmdbFetch<TMDBListResponse<TMDBMovie | TMDBTVShow>>(`/${mediaType}/${id}/recommendations`, { page: String(page) });

export const getExternalIds = (id: number, mediaType: 'movie' | 'tv') =>
    tmdbFetch<any>(`/${mediaType}/${id}/external_ids`);

export const getDiverseSwipeDeck = async () => {
    // Fetch a mix of general popularity and specific distinct genres
    const q1 = discoverContent({ mediaType: 'movie', page: 1, sortBy: 'popularity.desc' });
    const q2 = discoverContent({ mediaType: 'movie', genres: [27, 53], page: 1 }); // Horror/Thriller
    const q3 = discoverContent({ mediaType: 'movie', genres: [35, 10749], page: 1 }); // Comedy/Romance

    const [res1, res2, res3] = await Promise.all([q1, q2, q3]);
    const pool = [...res1.results, ...res2.results, ...res3.results];

    // Remove duplicates
    const unique = Array.from(new Map(pool.map(item => [item.id, item])).values());

    // Shuffle array
    const shuffled = unique.sort(() => 0.5 - Math.random());

    return { results: shuffled.slice(0, 20) };
};


// ─── WATCH PROVIDERS ─────────────────────────────────────────
export const getWatchProviders = async (
    id: number,
    mediaType: 'movie' | 'tv' = 'movie'
): Promise<{ flatrate?: TMDBProvider[]; rent?: TMDBProvider[]; buy?: TMDBProvider[] } | null> => {
    const data = await tmdbFetch<TMDBWatchProviders>(`/${mediaType}/${id}/watch/providers`);
    return data.results?.KE ?? data.results?.US ?? null;
};

// ─── CONFIGURATION ───────────────────────────────────────────
export const getLanguages = () =>
    tmdbFetch<Array<{ iso_639_1: string; english_name: string; name: string }>>(
        '/configuration/languages'
    );
