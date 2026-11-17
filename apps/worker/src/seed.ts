// Seeds fictional titles, demo users and reviews, then runs the consensus
// pipeline on synthetic Reddit fixtures. Safe to re-run.
//
// Uses the mock analyzer unless SEED_WITH_LLM=1, so seeding never spends
// API credits by accident.
import { sql } from "drizzle-orm";
import {
  FIXTURE_TITLES, FixtureRedditSource, MockConsensusAnalyzer, createAnalyzer, hashPassword, runConsensus,
} from "@verdict/core";
import { createDb, runMigrations, schema } from "@verdict/db";

const DEMO_PASSWORD = "verdict-demo-pass";

const USERS = [
  { username: "admin", displayName: "Site Admin", role: "admin" as const },
  { username: "reeltalk", displayName: "Reel Talk", role: "user" as const },
  { username: "late_night_viewer", displayName: "Late Night Viewer", role: "user" as const },
  { username: "pixel_pilgrim", displayName: "Pixel Pilgrim", role: "user" as const },
  { username: "couch_critic", displayName: "Couch Critic", role: "user" as const },
  { username: "savepoint", displayName: "Save Point", role: "user" as const },
  { username: "marquee_mo", displayName: "Marquee Mo", role: "user" as const },
];

const REVIEW_TEXT = {
  high: [
    ["An instant favorite", "This one stuck with me for days. Confident, distinctive and genuinely moving in places. I'll be recommending it to everyone I know."],
    ["Believe the hype", "Rarely does something live up to the word of mouth, but this does. Every department is firing on all cylinders and it shows."],
    ["Worth every minute", "Polished, ambitious and surprisingly warm. A couple of small stumbles, but nothing that dents how much I enjoyed it."],
  ],
  mid: [
    ["Good, not great", "There's a lot to like here and a few standout moments, but it never quite comes together the way I hoped. Still worth a look."],
    ["Uneven but interesting", "Strong first half, wobbly second half. The ideas are better than the execution, which makes the rough patches more frustrating."],
  ],
  low: [
    ["Didn't work for me", "I went in wanting to love it, but it felt hollow and overlong. A few nice ideas buried under a lot of noise."],
    ["A real letdown", "The marketing promised something special. What I got was a tired, by-the-numbers experience that I'd already forgotten by the next day."],
  ],
};

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const { db, pool } = createDb();
try {
  await runMigrations();

  // Titles
  for (const t of FIXTURE_TITLES) {
    const values = {
      kind: t.kind, name: t.name, year: t.year, releaseDate: new Date(`${t.releaseDate}T00:00:00Z`), synopsis: t.synopsis,
      genres: t.genres, platforms: t.platforms ?? [], creators: t.creators, runtimeMinutes: t.runtimeMinutes ?? null,
      popularity: t.popularity, redditConfig: { subreddits: t.subreddits ?? [] }, externalIds: { fixture: t.slug },
    };
    await db.insert(schema.titles).values({ slug: t.slug, ...values })
      .onConflictDoUpdate({ target: schema.titles.slug, set: values });
  }
  const titles = await db.select().from(schema.titles);
  const bySlug = new Map(titles.map((t) => [t.slug, t]));
  console.log(`titles: ${titles.length}`);

  // Users
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of USERS) {
    await db.insert(schema.users).values({ ...u, email: `${u.username}@verdict.local`, passwordHash })
      .onConflictDoNothing();
  }
  const users = await db.select().from(schema.users);
  console.log(`users: ${users.length} (password for all demo users: ${DEMO_PASSWORD})`);

  // Reviews: rating tracks each title's fixture sentiment profile.
  const rand = seeded(42);
  for (const u of users.filter((u) => u.role === "user")) {
    for (const t of FIXTURE_TITLES) {
      if (rand() < 0.35) continue;
      const title = bySlug.get(t.slug)!;
      const r = rand();
      const bucket = r < t.profile.positive ? "high" : r < t.profile.positive + t.profile.mixed ? "mid" : "low";
      const rating = bucket === "high" ? 8 + Math.floor(rand() * 3) : bucket === "mid" ? 5 + Math.floor(rand() * 3) : 2 + Math.floor(rand() * 3);
      const options = REVIEW_TEXT[bucket];
      const [headline, body] = options[Math.floor(rand() * options.length)]!;
      await db.insert(schema.reviews).values({
        titleId: title.id, userId: u.id, rating, headline: headline!, body: body!,
        helpfulCount: Math.floor(rand() * 40), createdAt: new Date(Date.now() - Math.floor(rand() * 60) * 86_400_000),
      }).onConflictDoNothing();
    }
  }
  // Recompute denormalized rating aggregates from scratch.
  await db.execute(sql`
    update titles t set
      user_rating_sum = coalesce(s.sum, 0),
      user_rating_count = coalesce(s.count, 0)
    from (select t2.id, sum(r.rating)::int as sum, count(r.id)::int as count
          from titles t2 left join reviews r on r.title_id = t2.id and r.status = 'published'
          group by t2.id) s
    where s.id = t.id`);
  const [{ count }] = (await db.execute(sql`select count(*)::int as count from reviews`)).rows as [{ count: number }];
  console.log(`reviews: ${count}`);

  // Consensus from synthetic Reddit threads.
  const reddit = new FixtureRedditSource();
  const analyzer = process.env.SEED_WITH_LLM === "1" ? createAnalyzer() : new MockConsensusAnalyzer();
  for (const t of titles.filter((t) => t.externalIds.fixture)) {
    const res = await runConsensus(t.id, { db, reddit, analyzer });
    console.log(`consensus ${t.slug}: ${res.status}${res.status === "ok" ? ` ${res.stats.score} (${res.stats.label}, n=${res.stats.sampleSize})` : ""}`);
  }
  await db.update(schema.titles).set({ consensusNextAt: sql`now() + interval '30 days'` })
    .where(sql`${schema.titles.externalIds} ? 'fixture'`);
} finally {
  await pool.end();
}
