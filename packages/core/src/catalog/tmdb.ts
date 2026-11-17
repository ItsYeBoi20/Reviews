import type { CatalogTitle } from "./types.ts";

/**
 * TMDB (movies + TV). Uses a v4 "API Read Access Token" as a bearer token.
 * TMDB's terms require attribution and a separate agreement for commercial use.
 */
const IMG = "https://image.tmdb.org/t/p";

interface TmdbItem {
  id: number;
  title?: string; name?: string;
  release_date?: string; first_air_date?: string;
  overview?: string; poster_path?: string | null; backdrop_path?: string | null;
  genre_ids?: number[]; popularity?: number;
}

export class TmdbClient {
  private genres: Map<number, string> | null = null;
  constructor(private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {
    if (!token) throw new Error("TMDB_API_TOKEN is required");
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" } });
    if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  private async genreMap() {
    if (this.genres) return this.genres;
    const [m, t] = await Promise.all([
      this.get<{ genres: { id: number; name: string }[] }>("/genre/movie/list"),
      this.get<{ genres: { id: number; name: string }[] }>("/genre/tv/list"),
    ]);
    this.genres = new Map([...m.genres, ...t.genres].map((g) => [g.id, g.name]));
    return this.genres;
  }

  /** This week's trending movies or shows, normalized. */
  async trending(kind: "movie" | "tv", page = 1): Promise<CatalogTitle[]> {
    const [data, genres] = await Promise.all([
      this.get<{ results: TmdbItem[] }>(`/trending/${kind}/week`, { page: String(page) }),
      this.genreMap(),
    ]);
    return data.results.map((r) => {
      const date = r.release_date || r.first_air_date || null;
      return {
        kind,
        name: (r.title ?? r.name ?? "").trim(),
        year: date ? Number(date.slice(0, 4)) : null,
        releaseDate: date ? new Date(`${date}T00:00:00Z`) : null,
        synopsis: r.overview || null,
        posterUrl: r.poster_path ? `${IMG}/w500${r.poster_path}` : null,
        backdropUrl: r.backdrop_path ? `${IMG}/w1280${r.backdrop_path}` : null,
        genres: (r.genre_ids ?? []).map((g) => genres.get(g)).filter((g): g is string => Boolean(g)),
        platforms: [],
        creators: [],
        runtimeMinutes: null,
        popularity: r.popularity ?? 0,
        externalIds: { tmdb: r.id },
      };
    });
  }
}
