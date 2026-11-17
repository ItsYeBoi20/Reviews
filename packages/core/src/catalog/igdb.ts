import type { CatalogTitle } from "./types.ts";

/**
 * IGDB (games). Auth is a Twitch app access token (client credentials).
 * Commercial use of IGDB requires a partnership agreement with Twitch.
 */
interface IgdbGame {
  id: number; name: string; first_release_date?: number; summary?: string;
  cover?: { image_id: string }; artworks?: { image_id: string }[];
  genres?: { name: string }[]; platforms?: { abbreviation?: string; name: string }[];
  involved_companies?: { developer: boolean; company: { name: string } }[];
  total_rating_count?: number; hypes?: number;
}

export class IgdbClient {
  private token: { value: string; expiresAt: number } | null = null;
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!clientId || !clientSecret) throw new Error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required");
  }

  private async getToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const url = new URL("https://id.twitch.tv/oauth2/token");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("client_secret", this.clientSecret);
    url.searchParams.set("grant_type", "client_credentials");
    const res = await this.fetchImpl(url, { method: "POST" });
    if (!res.ok) throw new Error(`Twitch auth failed: ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  /** Recently released games with meaningful engagement. */
  async popularRecent(limit = 50, now = new Date()): Promise<CatalogTitle[]> {
    const since = Math.floor(now.getTime() / 1000) - 180 * 86_400;
    const until = Math.floor(now.getTime() / 1000);
    const body = [
      "fields name,first_release_date,summary,cover.image_id,artworks.image_id,genres.name,platforms.name,platforms.abbreviation,involved_companies.developer,involved_companies.company.name,total_rating_count,hypes;",
      `where first_release_date >= ${since} & first_release_date <= ${until} & total_rating_count > 5;`,
      "sort total_rating_count desc;",
      `limit ${limit};`,
    ].join(" ");
    const res = await this.fetchImpl("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: { "Client-ID": this.clientId, Authorization: `Bearer ${await this.getToken()}`, Accept: "application/json" },
      body,
    });
    if (!res.ok) throw new Error(`IGDB games failed: ${res.status}`);
    const games = (await res.json()) as IgdbGame[];
    return games.map((g) => {
      const date = g.first_release_date ? new Date(g.first_release_date * 1000) : null;
      return {
        kind: "game" as const,
        name: g.name,
        year: date ? date.getUTCFullYear() : null,
        releaseDate: date,
        synopsis: g.summary ?? null,
        posterUrl: g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
        backdropUrl: g.artworks?.[0] ? `https://images.igdb.com/igdb/image/upload/t_1080p/${g.artworks[0].image_id}.jpg` : null,
        genres: (g.genres ?? []).map((x) => x.name),
        platforms: (g.platforms ?? []).map((p) => p.abbreviation ?? p.name),
        creators: (g.involved_companies ?? []).filter((c) => c.developer).map((c) => c.company.name),
        runtimeMinutes: null,
        popularity: (g.total_rating_count ?? 0) + (g.hypes ?? 0),
        externalIds: { igdb: g.id },
      };
    });
  }
}
