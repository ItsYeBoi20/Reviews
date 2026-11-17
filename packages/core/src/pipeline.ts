import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@verdict/db";
import { schema } from "@verdict/db";
import type { ConsensusSource } from "@verdict/shared";
import { aspectLabel } from "./analysis/aspects.ts";
import { computeStats, nextRefreshAt, pickQuotes, weighComments, type ConsensusStats } from "./analysis/scoring.ts";
import type { ConsensusAnalyzer } from "./analysis/types.ts";
import { DEFAULT_SUBREDDITS, buildSearchQuery, pickThreads, type TitleRef } from "./reddit/discovery.ts";
import { DEFAULT_FILTER, filterComments, type FilterOptions } from "./reddit/filter.ts";
import type { RedditComment, RedditSource, RedditThread } from "./reddit/types.ts";

export interface PipelineDeps {
  db: Db;
  reddit: RedditSource;
  analyzer: ConsensusAnalyzer;
  now?: () => Date;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  filter?: Partial<FilterOptions>;
  maxThreads?: number;
  commentsPerThread?: number;
  /** below this many opinionated comments we publish nothing */
  minSample?: number;
}

export type PipelineResult =
  | { status: "ok"; snapshotId: string; stats: ConsensusStats; threads: number }
  | { status: "insufficient_data"; comments: number; threads: number }
  | { status: "not_found" };

/**
 * discover threads -> fetch top comments -> filter -> label (LLM) -> score (code)
 * -> summarize (LLM) -> persist snapshot. Safe to re-run; each run appends a
 * snapshot so score history is preserved.
 */
export async function runConsensus(titleId: string, deps: PipelineDeps): Promise<PipelineResult> {
  const { db, reddit, analyzer } = deps;
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? (() => {});
  const minSample = deps.minSample ?? 10;

  const title = await db.query.titles.findFirst({ where: eq(schema.titles.id, titleId) });
  if (!title) return { status: "not_found" };

  const ref: TitleRef = {
    name: title.name, year: title.year, kind: title.kind, releaseDate: title.releaseDate,
    aliases: title.redditConfig.aliases,
  };

  // 1. Discover
  const subs = [...new Set([...DEFAULT_SUBREDDITS[title.kind], ...(title.redditConfig.subreddits ?? [])])];
  const query = buildSearchQuery(ref);
  const candidates: RedditThread[] = [];
  for (const sub of subs) {
    try {
      candidates.push(...(await reddit.searchThreads(sub, query, 15)));
    } catch (err) {
      log("reddit search failed", { sub, err: String(err) });
    }
  }
  const picked = pickThreads(ref, candidates, deps.maxThreads ?? 6, now);
  log("threads picked", { title: title.slug, candidates: candidates.length, picked: picked.length });

  // 2. Harvest
  const commentsByThread = new Map<string, RedditComment[]>();
  for (const { thread } of picked) {
    commentsByThread.set(thread.id, await reddit.fetchTopComments(thread, deps.commentsPerThread ?? 100));
  }
  const threads = picked.map((p) => p.thread);
  const filtered = filterComments(threads, commentsByThread, { ...DEFAULT_FILTER, ...deps.filter });

  // Persist raw inputs (body is purged later by the retention job).
  await db.transaction(async (tx) => {
    for (const p of picked) {
      const t = p.thread;
      await tx.insert(schema.redditThreads).values({
        id: t.id, titleId, subreddit: t.subreddit, title: t.title, permalink: t.permalink, score: t.score,
        numComments: t.numComments, relevance: p.score, postedAt: t.postedAt, fetchedAt: now,
      }).onConflictDoUpdate({
        target: schema.redditThreads.id,
        set: { score: t.score, numComments: t.numComments, relevance: p.score, fetchedAt: now },
      });
    }
    for (const c of filtered) {
      await tx.insert(schema.redditComments).values({
        id: c.id, threadId: c.threadId, titleId, authorHash: c.authorHash, body: c.body, score: c.score,
        permalink: c.permalink, postedAt: c.postedAt, fetchedAt: now,
      }).onConflictDoUpdate({ target: schema.redditComments.id, set: { body: c.body, score: c.score, fetchedAt: now } });
    }
  });

  // 3. Label
  const ctx = { name: title.name, year: title.year, kind: title.kind };
  const labels = filtered.length ? await analyzer.classify(ctx, filtered) : [];
  const weighted = weighComments(filtered, labels);
  const stats = computeStats(weighted);
  log("labeled", { title: title.slug, comments: filtered.length, opinionated: stats.sampleSize });

  if (stats.sampleSize < minSample) {
    await db.update(schema.titles)
      .set({ consensusNextAt: nextRefreshAt(title.releaseDate, now, false) })
      .where(eq(schema.titles.id, titleId));
    return { status: "insufficient_data", comments: stats.sampleSize, threads: threads.length };
  }

  // 4. Summarize
  const sample = weighted
    .filter((c) => c.label.sentiment !== "off_topic" && !c.label.spoiler)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 40);
  const synthesis = await analyzer.synthesize(ctx, stats, sample);

  const sources: ConsensusSource[] = threads.map((t) => ({
    id: t.id, subreddit: t.subreddit, title: t.title, permalink: t.permalink,
    commentCount: filtered.filter((c) => c.threadId === t.id).length,
  }));
  const toPoints = (xs: ConsensusStats["pros"], phrasing: Record<string, string>) =>
    xs.map((x) => ({ point: phrasing[x.aspect] ?? aspectLabel(title.kind, x.aspect), share: Math.round(x.share * 100) / 100 }));

  // 5. Persist
  const snapshotId = await db.transaction(async (tx) => {
    const [snap] = await tx.insert(schema.consensusSnapshots).values({
      titleId, score: stats.score, label: stats.label, confidence: stats.confidence, controversy: stats.controversy,
      positiveShare: stats.breakdown.positive, mixedShare: stats.breakdown.mixed, negativeShare: stats.breakdown.negative,
      sampleSize: stats.sampleSize, threadCount: threads.length, summary: synthesis.summary,
      pros: toPoints(stats.pros, synthesis.pros), cons: toPoints(stats.cons, synthesis.cons),
      quotes: pickQuotes(weighted, stats), sources,
      provider: analyzer.provider, model: analyzer.model, promptVersion: analyzer.promptVersion,
      isSampleData: reddit.isSampleData, createdAt: now,
    }).returning({ id: schema.consensusSnapshots.id });

    if (weighted.length) {
      await tx.insert(schema.commentLabels).values(
        weighted.map((c) => ({
          snapshotId: snap!.id, commentId: c.id, sentiment: c.label.sentiment, weight: c.weight,
          aspects: [...c.label.praised.map((a) => `+${a}`), ...c.label.criticized.map((a) => `-${a}`)],
        })),
      );
    }
    // Only the current snapshot keeps quoted Reddit text; history keeps numbers only.
    await tx.update(schema.consensusSnapshots).set({ quotes: [] })
      .where(and(eq(schema.consensusSnapshots.titleId, titleId), sql`${schema.consensusSnapshots.id} <> ${snap!.id}`));
    await tx.update(schema.titles).set({
      consensusScore: stats.score, consensusLabel: stats.label, consensusConfidence: stats.confidence,
      consensusAnalyzedAt: now, consensusNextAt: nextRefreshAt(title.releaseDate, now, true), updatedAt: now,
    }).where(eq(schema.titles.id, titleId));
    return snap!.id;
  });

  return { status: "ok", snapshotId, stats, threads: threads.length };
}

/** Titles whose refresh is due, most popular first. */
export async function dueTitles(db: Db, limit: number, now = new Date()) {
  return db
    .select({ id: schema.titles.id, slug: schema.titles.slug })
    .from(schema.titles)
    .where(and(sql`${schema.titles.consensusNextAt} <= ${now.toISOString()}`))
    .orderBy(sql`${schema.titles.popularity} desc`)
    .limit(limit);
}

/** Reddit content retention: drop raw comment text after `days`. */
export async function purgeCommentBodies(db: Db, days: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const res = await db.update(schema.redditComments).set({ body: null })
    .where(sql`${schema.redditComments.fetchedAt} < ${cutoff.toISOString()} and ${schema.redditComments.body} is not null`);
  return res.rowCount ?? 0;
}
