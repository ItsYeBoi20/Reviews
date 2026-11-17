import type { FastifyInstance } from "fastify";
import { desc, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@verdict/db";
import { titleListQuery, type ConsensusView, type Paginated, type TitleDetail, type TitleSummary } from "@verdict/shared";
import { z } from "zod";
import { HttpError, notFound, parse, requireAdmin } from "../http.ts";
import { toTitleSummary } from "../mappers.ts";

// Bayesian average for "top rated": a title needs real volume to outrank the prior.
const PRIOR_WEIGHT = 5;
const PRIOR_MEAN = 6.5;

export async function findTitle(db: Db, slug: string) {
  const title = await db.query.titles.findFirst({ where: eq(schema.titles.slug, slug) });
  if (!title) throw notFound("title");
  return title;
}

export async function titleRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get("/titles", async (req): Promise<Paginated<TitleSummary>> => {
    const q = parse(titleListQuery, req.query);
    const t = schema.titles;
    const where = q.kind ? eq(t.kind, q.kind) : undefined;
    const order = {
      trending: [desc(t.popularity)],
      top: [sql`(${PRIOR_WEIGHT * PRIOR_MEAN} + ${t.userRatingSum}) / (${PRIOR_WEIGHT} + ${t.userRatingCount})::float desc`],
      consensus: [sql`${t.consensusScore} desc nulls last`, desc(t.popularity)],
      new: [sql`${t.releaseDate} desc nulls last`],
    }[q.sort];
    const [rows, total] = await Promise.all([
      db.select().from(t).where(q.sort === "new" ? sql`${where ?? sql`true`} and ${t.releaseDate} <= now()` : where)
        .orderBy(...order).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      db.$count(t, where),
    ]);
    return { items: rows.map(toTitleSummary), page: q.page, pageSize: q.pageSize, total };
  });

  app.get("/search", async (req): Promise<TitleSummary[]> => {
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(100) }), req.query);
    const t = schema.titles;
    const rows = await db.select().from(t)
      .where(sql`${t.name} % ${q} or ${t.name} ilike ${"%" + q.replace(/[%_]/g, "\\$&") + "%"}`)
      .orderBy(sql`similarity(${t.name}, ${q}) desc`, desc(t.popularity))
      .limit(20);
    return rows.map(toTitleSummary);
  });

  app.get<{ Params: { slug: string } }>("/titles/:slug", async (req): Promise<TitleDetail> => {
    const title = await findTitle(db, req.params.slug);
    const hist = await db.execute(sql`
      select rating, count(*)::int as n from reviews
      where title_id = ${title.id} and status = 'published' group by rating`);
    const histogram = Array.from({ length: 10 }, () => 0);
    for (const row of hist.rows as { rating: number; n: number }[]) histogram[row.rating - 1] = row.n;
    return {
      ...toTitleSummary(title),
      synopsis: title.synopsis, backdropUrl: title.backdropUrl,
      releaseDate: title.releaseDate?.toISOString() ?? null, runtimeMinutes: title.runtimeMinutes,
      platforms: title.platforms, creators: title.creators, externalIds: title.externalIds, ratingHistogram: histogram,
    };
  });

  app.get<{ Params: { slug: string } }>("/titles/:slug/consensus", async (req): Promise<ConsensusView> => {
    const title = await findTitle(db, req.params.slug);
    const snaps = await db.select().from(schema.consensusSnapshots)
      .where(eq(schema.consensusSnapshots.titleId, title.id))
      .orderBy(desc(schema.consensusSnapshots.createdAt)).limit(30);
    const s = snaps[0];
    if (!s) throw new HttpError(404, "no_consensus", "no Reddit consensus has been computed for this title yet");
    return {
      titleId: title.id, score: s.score, label: s.label, confidence: s.confidence, controversy: s.controversy,
      breakdown: { positive: s.positiveShare, mixed: s.mixedShare, negative: s.negativeShare },
      sampleSize: s.sampleSize, threadCount: s.threadCount, summary: s.summary,
      pros: s.pros, cons: s.cons, quotes: s.quotes, sources: s.sources,
      provider: s.provider, model: s.model, promptVersion: s.promptVersion, isSampleData: s.isSampleData,
      analyzedAt: s.createdAt.toISOString(),
      history: snaps.map((h) => ({ analyzedAt: h.createdAt.toISOString(), score: h.score })).reverse(),
    };
  });

  /** Marks the title due now; the worker's 5-minute tick picks it up. */
  app.post<{ Params: { slug: string } }>("/titles/:slug/consensus/refresh", async (req, reply) => {
    requireAdmin(req);
    const title = await findTitle(db, req.params.slug);
    await db.update(schema.titles).set({ consensusNextAt: new Date() }).where(eq(schema.titles.id, title.id));
    return reply.code(202).send({ queued: true });
  });
}
