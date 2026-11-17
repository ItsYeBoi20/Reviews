import { PgBoss } from "pg-boss";
import { eq } from "drizzle-orm";
import {
  IgdbClient, TmdbClient, createAnalyzer, createRedditSource, dueTitles, purgeCommentBodies, runConsensus, upsertCatalogTitles,
} from "@verdict/core";
import { schema, type Db } from "@verdict/db";

export const QUEUES = {
  refresh: "consensus-refresh",
  tick: "consensus-tick",
  purge: "reddit-purge",
  catalog: "catalog-sync",
} as const;

const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

export async function registerJobs(boss: PgBoss, db: Db, env = process.env) {
  const reddit = createRedditSource(env);
  const analyzer = createAnalyzer(env);
  log("worker config", { reddit: reddit.name, provider: analyzer.provider, model: analyzer.model });

  // `stately` + singletonKey=titleId: at most one queued and one running refresh per title.
  await boss.createQueue(QUEUES.refresh, { policy: "stately", retryLimit: 2, retryDelay: 60, retryBackoff: true, expireInSeconds: 900 });
  await boss.createQueue(QUEUES.tick, { policy: "exclusive" });
  await boss.createQueue(QUEUES.purge, { policy: "exclusive" });
  await boss.createQueue(QUEUES.catalog, { policy: "exclusive", expireInSeconds: 1800 });

  // Low concurrency on purpose: the Reddit free tier is 100 requests/minute per client,
  // and one refresh makes ~10-20 requests.
  const concurrency = Number(env.CONSENSUS_CONCURRENCY ?? 2);
  await boss.work<{ titleId: string }>(QUEUES.refresh, { localConcurrency: concurrency }, async ([job]) => {
    if (!job) return;
    const started = Date.now();
    const result = await runConsensus(job.data.titleId, { db, reddit, analyzer, log });
    log("consensus refreshed", { titleId: job.data.titleId, status: result.status, ms: Date.now() - started,
      ...(result.status === "ok" ? { score: result.stats.score, sample: result.stats.sampleSize } : {}) });
  });

  // The DB is the source of truth for what is due (titles.consensus_next_at). The API's
  // "refresh now" just sets that column to now(); this tick turns due rows into jobs.
  await boss.work(QUEUES.tick, async () => {
    const due = await dueTitles(db, Number(env.CONSENSUS_TICK_BATCH ?? 25));
    for (const t of due) await boss.send(QUEUES.refresh, { titleId: t.id }, { singletonKey: t.id });
    if (due.length) log("enqueued refreshes", { count: due.length });
  });

  await boss.work(QUEUES.purge, async () => {
    const purged = await purgeCommentBodies(db, Number(env.REDDIT_RETENTION_DAYS ?? 30));
    log("purged reddit comment bodies", { purged });
  });

  await boss.work(QUEUES.catalog, async () => {
    if (env.TMDB_API_TOKEN) {
      const tmdb = new TmdbClient(env.TMDB_API_TOKEN);
      for (const kind of ["movie", "tv"] as const) log("tmdb sync", { kind, ...(await upsertCatalogTitles(db, await tmdb.trending(kind))) });
    }
    if (env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) {
      const igdb = new IgdbClient(env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET);
      log("igdb sync", await upsertCatalogTitles(db, await igdb.popularRecent()));
    }
  });

  await boss.schedule(QUEUES.tick, "*/5 * * * *");
  await boss.schedule(QUEUES.purge, "17 3 * * *");
  await boss.schedule(QUEUES.catalog, "41 4 * * *");
}

export async function titleIdBySlug(db: Db, slug: string) {
  const row = await db.query.titles.findFirst({ where: eq(schema.titles.slug, slug), columns: { id: true } });
  return row?.id ?? null;
}
