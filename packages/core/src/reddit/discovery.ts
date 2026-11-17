import type { MediaKind } from "@verdict/shared";
import type { RedditThread } from "./types.ts";

/**
 * Default communities per media kind. Title-specific subs (r/eldenring,
 * r/TheBear) are added from titles.reddit_config and usually carry the most
 * opinionated discussion.
 */
export const DEFAULT_SUBREDDITS: Record<MediaKind, string[]> = {
  movie: ["movies", "flicks", "TrueFilm"],
  tv: ["television", "TrueTelevision"],
  game: ["Games", "gaming", "patientgamers"],
};

export interface TitleRef {
  name: string;
  year: number | null;
  kind: MediaKind;
  releaseDate: Date | null;
  aliases?: string[];
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildSearchQuery(title: TitleRef): string {
  const names = [title.name, ...(title.aliases ?? [])].map((n) => `title:"${n.replace(/"/g, "")}"`);
  return names.join(" OR ");
}

const OPINION_MARKERS = /\b(official discussion|discussion thread|review thread|reviews? megathread|post[- ]?(episode|finale|season|credits)|impressions|thoughts|just (finished|watched|beat|completed)|finally (watched|played|beat))\b/i;
const NON_OPINION_MARKERS = /\b(trailer|teaser|first look|poster|casting|cast as|announced|announcement|box office|release date|pre[- ]?order|leak|giveaway|sale)\b/i;

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  if (ta.size === 0) return 0;
  const tb = new Set(b.split(" ").filter(Boolean));
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / ta.size;
}

/**
 * 0..1 relevance of a thread as a source of *opinions* about the title.
 * Pure heuristics; cheap enough to run on every search result.
 */
export function threadRelevance(title: TitleRef, thread: RedditThread, now = new Date()): { score: number; match: number } {
  const postTitle = normalize(thread.title);
  const names = [title.name, ...(title.aliases ?? [])].map(normalize);
  const match = Math.max(...names.map((n) => (postTitle.includes(n) ? 1 : tokenOverlap(n, postTitle) * 0.8)));

  let score = 0.55 * match;
  score += 0.25 * Math.min(1, Math.log10(1 + thread.numComments) / 3.5); // ~3000 comments saturates
  if (OPINION_MARKERS.test(thread.title) || /discussion|review/i.test(thread.flair ?? "")) score += 0.25;
  if (NON_OPINION_MARKERS.test(thread.title)) score -= 0.45;

  // A different year in the post title usually means a remake, sequel or older adaptation.
  if (title.year) {
    const years = thread.title.match(/\b(19|20)\d{2}\b/g)?.map(Number) ?? [];
    if (years.length && !years.some((y) => Math.abs(y - title.year!) <= 1)) score -= 0.35;
  }
  // Threads from well before release are hype, not opinions.
  if (title.releaseDate && thread.postedAt.getTime() < title.releaseDate.getTime() - 14 * 86_400_000) score -= 0.4;
  if (thread.postedAt.getTime() > now.getTime() + 86_400_000) score -= 1; // clock skew / bad data

  return { score: Math.max(0, Math.min(1, score)), match };
}

export function pickThreads(title: TitleRef, candidates: RedditThread[], max = 6, now = new Date()) {
  const seen = new Set<string>();
  return candidates
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    .map((t) => ({ thread: t, ...threadRelevance(title, t, now) }))
    .filter((t) => t.match >= 0.6 && t.score >= 0.45 && t.thread.numComments >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
