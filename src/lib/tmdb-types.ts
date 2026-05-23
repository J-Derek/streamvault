export interface TMDBMovie {
    id: number;
    title: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string;
    vote_average: number;
    vote_count: number;
    genre_ids: number[];
    genres?: TMDBGenre[];
    runtime?: number;
    status?: string;
    tagline?: string;
    original_language: string;
    popularity: number;
    adult: boolean;
}

export interface TMDBTVShow {
    id: number;
    name: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    first_air_date: string;
    last_air_date?: string;
    vote_average: number;
    vote_count: number;
    genre_ids: number[];
    genres?: TMDBGenre[];
    status?: string;
    number_of_seasons?: number;
    number_of_episodes?: number;
}

export interface TMDBGenre {
    id: number;
    name: string;
}

export interface TMDBListResponse<T> {
    page: number;
    results: T[];
    total_pages: number;
    total_results: number;
}

export interface TMDBCastMember {
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
    order: number;
}

export interface TMDBCrewMember {
    id: number;
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
}

export interface TMDBCredits {
    id: number;
    cast: TMDBCastMember[];
    crew: TMDBCrewMember[];
}

export interface TMDBVideo {
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
    official: boolean;
}

export interface TMDBProvider {
    provider_id: number;
    provider_name: string;
    logo_path: string;
}

export interface TMDBWatchProviders {
    id: number;
    results: {
        [countryCode: string]: {
            link: string;
            flatrate?: TMDBProvider[];
            rent?: TMDBProvider[];
            buy?: TMDBProvider[];
        };
    };
}

export interface TMDBReview {
    id: string;
    author: string;
    author_details: {
        rating: number | null;
        avatar_path: string | null;
    };
    content: string;
    created_at: string;
}

export type StreamVaultStatus = 'completed' | 'ongoing' | 'cancelled' | 'new' | 'leaving' | null;

export interface StreamVaultMedia {
    id: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    year: string;
    rating: number;
    genres: string[];
    status: StreamVaultStatus;
}

export function mapTMDBStatus(status?: string): StreamVaultStatus {
    if (!status) return null;
    const map: Record<string, StreamVaultStatus> = {
        'Released': 'completed',
        'Ended': 'completed',
        'Returning Series': 'ongoing',
        'Canceled': 'cancelled',
        'In Production': 'new',
        'Planned': 'new',
    };
    return map[status] ?? null;
}

export function normalizeMedia(
    item: TMDBMovie | TMDBTVShow,
    mediaType: 'movie' | 'tv'
): StreamVaultMedia {
    const isMovie = mediaType === 'movie';
    const movie = item as TMDBMovie;
    const show = item as TMDBTVShow;
    return {
        id: item.id,
        mediaType,
        title: isMovie ? movie.title : show.name,
        posterPath: item.poster_path,
        backdropPath: item.backdrop_path,
        year: isMovie
            ? movie.release_date?.slice(0, 4) ?? ''
            : show.first_air_date?.slice(0, 4) ?? '',
        rating: item.vote_average,
        genres: [],
        status: mapTMDBStatus(item.status),
    };
}
export const PROVIDERS = [
    { id: "torrentio", name: "Torrentio (Verified)", domain: "torrentio.strem.fun", reliability: "High", urlFormat: "torrentio" },
    { id: "vidsrc-to", name: "Server 1 (VidSrc TO)", domain: "vidsrc.to", reliability: "High", urlFormat: "vidsrc-path" },
    { id: "embed-su", name: "Server 2 (Embed SU)", domain: "embed.su", reliability: "High", urlFormat: "embed-su" },
    { id: "vidlink", name: "Server 3 (VidLink)", domain: "vidlink.pro", reliability: "High", urlFormat: "vidlink" },
    { id: "vidsrc-cc", name: "Server 4 (VidSrc CC)", domain: "vidsrc.cc", reliability: "Medium", urlFormat: "vidsrc-path" },
    { id: "vidsrc-xyz", name: "Server 5 (VidSrc XYZ)", domain: "vidsrc.xyz", reliability: "Medium", urlFormat: "vidsrc-path" },
    { id: "vidsrc-net", name: "Server 6 (VidSrc NET)", domain: "vidsrc.net", reliability: "Medium", urlFormat: "vidsrc-path" },
];

