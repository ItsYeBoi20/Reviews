import type { MediaKind } from "@verdict/shared";

export const KIND_LABEL: Record<MediaKind, string> = { movie: "Movie", tv: "TV series", game: "Game" };
export const KIND_PLURAL: Record<MediaKind, string> = { movie: "Movies", tv: "TV", game: "Games" };

export function scoreTone(score: number | null, outOf: 10 | 100): "good" | "mid" | "bad" | "none" {
  if (score === null) return "none";
  const pct = outOf === 10 ? score * 10 : score;
  if (pct >= 70) return "good";
  if (pct >= 45) return "mid";
  return "bad";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function hueFor(slug: string): number {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
