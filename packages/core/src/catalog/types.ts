import type { MediaKind } from "@verdict/shared";

/** Normalized catalog record from TMDB/IGDB, ready to upsert into `titles`. */
export interface CatalogTitle {
  kind: MediaKind;
  name: string;
  year: number | null;
  releaseDate: Date | null;
  synopsis: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
  platforms: string[];
  creators: string[];
  runtimeMinutes: number | null;
  popularity: number;
  externalIds: Record<string, string | number>;
}

export function slugify(name: string, year: number | null): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return year ? `${base}-${year}` : base;
}
