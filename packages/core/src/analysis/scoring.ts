import type { Confidence, ConsensusQuote, Sentiment } from "@verdict/shared";
import type { FilteredComment } from "../reddit/filter.ts";

export interface CommentLabel {
  id: string;
  sentiment: Sentiment;
  praised: string[];
  criticized: string[];
  spoiler: boolean;
}

export interface WeightedComment extends FilteredComment {
  label: CommentLabel;
  weight: number;
}

export interface AspectShare {
  aspect: string;
  share: number;
}

export interface ConsensusStats {
  score: number;
  label: string;
  confidence: Confidence;
  controversy: number;
  breakdown: { positive: number; mixed: number; negative: number };
  sampleSize: number;
  effectiveSampleSize: number;
  pros: AspectShare[];
  cons: AspectShare[];
}

/** Log-scaled upvote weight: a 5,000-upvote comment counts ~4.7x a 1-upvote one, not 5,000x. */
export function commentWeight(upvotes: number): number {
  return 1 + Math.log10(1 + Math.max(0, upvotes));
}

/**
 * Max share of total weight one thread may hold. Loose with few threads
 * (forcing two threads to 50/50 would let a 7-comment thread outvote a
 * 28-comment one), tightening to 50% once there are enough threads that one
 * viral thread or one subreddit's mood could otherwise define the consensus.
 */
export function threadShareCap(threadCount: number): number {
  return Math.max(0.5, 1 - 0.15 * (threadCount - 1));
}

export function capThreadShare(items: { threadId: string; weight: number }[], cap?: number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const i of items) totals.set(i.threadId, (totals.get(i.threadId) ?? 0) + i.weight);
  const factors = new Map<string, number>();
  for (const id of totals.keys()) factors.set(id, 1);
  if (totals.size < 2) return factors;
  cap ??= threadShareCap(totals.size);

  // Iterate: shrinking one thread changes everyone's share.
  for (let pass = 0; pass < 5; pass++) {
    const scaled = [...totals].map(([id, t]) => [id, t * factors.get(id)!] as const);
    const sum = scaled.reduce((s, [, t]) => s + t, 0);
    let changed = false;
    for (const [id, t] of scaled) {
      if (t / sum > cap + 1e-9) {
        const others = sum - t;
        factors.set(id, (factors.get(id)! * (cap * others)) / ((1 - cap) * t));
        changed = true;
      }
    }
    if (!changed) break;
  }
  return factors;
}

export function scoreLabel(score: number, controversy: number): string {
  if (score >= 85) return "Widely loved";
  if (score >= 70) return "Well liked";
  if (score >= 40 && controversy >= 0.6) return "Divisive";
  if (score >= 55) return "Mostly positive";
  if (score >= 40) return "Mixed";
  if (score >= 25) return "Mostly negative";
  return "Panned";
}

export function confidenceFor(sampleSize: number, effective: number): Confidence {
  if (sampleSize < 15 || effective < 12) return "low";
  if (effective < 50) return "medium";
  return "high";
}

export function weighComments(comments: FilteredComment[], labels: CommentLabel[]): WeightedComment[] {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const raw = comments
    .filter((c) => byId.has(c.id))
    .map((c) => ({ ...c, label: byId.get(c.id)!, weight: commentWeight(c.score) }));
  const opinionated = raw.filter((c) => c.label.sentiment !== "off_topic");
  const factors = capThreadShare(opinionated);
  return raw.map((c) => ({ ...c, weight: c.weight * (factors.get(c.threadId) ?? 1) }));
}

export function computeStats(weighted: WeightedComment[], minAspectShare = 0.05): ConsensusStats {
  const opinions = weighted.filter((c) => c.label.sentiment !== "off_topic");
  let pos = 0, mixed = 0, neg = 0, sumSq = 0;
  const praised = new Map<string, number>();
  const criticized = new Map<string, number>();

  for (const c of opinions) {
    if (c.label.sentiment === "positive") pos += c.weight;
    else if (c.label.sentiment === "mixed") mixed += c.weight;
    else neg += c.weight;
    sumSq += c.weight ** 2;
    for (const a of new Set(c.label.praised)) praised.set(a, (praised.get(a) ?? 0) + c.weight);
    for (const a of new Set(c.label.criticized)) criticized.set(a, (criticized.get(a) ?? 0) + c.weight);
  }

  const total = pos + mixed + neg;
  if (total === 0) {
    return {
      score: 0, label: "Not enough discussion", confidence: "low", controversy: 0,
      breakdown: { positive: 0, mixed: 0, negative: 0 }, sampleSize: 0, effectiveSampleSize: 0, pros: [], cons: [],
    };
  }

  const score = Math.round(((pos + 0.5 * mixed) / total) * 100);
  const controversy = pos + neg > 0 ? 1 - Math.abs(pos - neg) / (pos + neg) : 0;
  const effective = total ** 2 / sumSq;
  const rank = (m: Map<string, number>) =>
    [...m]
      .map(([aspect, w]) => ({ aspect, share: w / total }))
      .filter((a) => a.share >= minAspectShare)
      .sort((a, b) => b.share - a.share)
      .slice(0, 5);

  return {
    score,
    label: scoreLabel(score, controversy),
    confidence: confidenceFor(opinions.length, effective),
    controversy: Math.round(controversy * 100) / 100,
    breakdown: { positive: pos / total, mixed: mixed / total, negative: neg / total },
    sampleSize: opinions.length,
    effectiveSampleSize: Math.round(effective),
    pros: rank(praised),
    cons: rank(criticized),
  };
}

function clipQuote(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(" "))) + " …";
}

/**
 * Picks spoiler-free, high-weight quotes roughly in proportion to the
 * sentiment breakdown, always including the strongest dissent when there is one.
 */
export function pickQuotes(weighted: WeightedComment[], stats: ConsensusStats, count = 4): ConsensusQuote[] {
  // Rank by the comment's own upvotes (not the thread-capped weight), then spread across threads.
  const pool = weighted
    .filter((c) => !c.label.spoiler && c.label.sentiment !== "off_topic" && c.body.length >= 60)
    .sort((a, b) => b.score - a.score);
  const usedThreads = new Set<string>();
  // Skip near-duplicates of an already-picked quote so the four quotes say four different things.
  const chosen: WeightedComment[] = [];
  const tokens = (t: string) => new Set(t.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const similar = (a: string, b: string) => {
    const ta = tokens(a), tb = tokens(b);
    let inter = 0;
    for (const w of ta) if (tb.has(w)) inter++;
    return inter / Math.max(1, Math.min(ta.size, tb.size)) > 0.6;
  };
  const take = (s: string, n: number) => {
    const out: WeightedComment[] = [];
    // First pass prefers threads not quoted yet; second pass fills any remaining slots.
    for (const preferNewThread of [true, false]) {
      for (const c of pool) {
        if (out.length >= n) break;
        if (c.label.sentiment !== s || chosen.includes(c) || chosen.some((q) => similar(q.body, c.body))) continue;
        if (preferNewThread && usedThreads.has(c.threadId)) continue;
        out.push(c);
        chosen.push(c);
        usedThreads.add(c.threadId);
      }
    }
    return out;
  };

  const nNeg = stats.breakdown.negative >= 0.08 ? Math.max(1, Math.round(count * stats.breakdown.negative)) : 0;
  const nMixed = stats.breakdown.mixed >= 0.12 ? 1 : 0;
  const nPos = Math.max(1, count - nNeg - nMixed);
  const picked = [...take("positive", nPos), ...take("mixed", nMixed), ...take("negative", nNeg)];

  return picked.slice(0, count).map((c) => ({
    text: clipQuote(c.body),
    sentiment: c.label.sentiment,
    upvotes: c.score,
    permalink: c.permalink,
    subreddit: c.subreddit,
  }));
}

/** Next refresh: new releases are re-read often, back-catalog rarely. */
export function nextRefreshAt(releaseDate: Date | null, now: Date, hadEnoughData: boolean): Date {
  const day = 86_400_000;
  const age = releaseDate ? now.getTime() - releaseDate.getTime() : Infinity;
  let interval: number;
  if (age < 0) interval = 3 * day; // unreleased: check for early reviews
  else if (age < 14 * day) interval = hadEnoughData ? 0.5 * day : 1 * day;
  else if (age < 60 * day) interval = 2 * day;
  else if (age < 365 * day) interval = 14 * day;
  else interval = 60 * day;
  if (!hadEnoughData) interval = Math.max(interval, 1 * day);
  return new Date(now.getTime() + interval);
}
