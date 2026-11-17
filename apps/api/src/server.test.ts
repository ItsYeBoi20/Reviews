// Integration tests against a real Postgres. Set TEST_DATABASE_URL to a
// throwaway database (it is wiped): e.g. postgres://postgres@localhost:5432/verdict_test
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { FixtureRedditSource, MockConsensusAnalyzer, runConsensus } from "@verdict/core";
import { createDb, runMigrations, schema, type Db } from "@verdict/db";
import { buildServer } from "./server.ts";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("API", () => {
  let db: Db;
  let close: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildServer>>;
  let titleId: string;

  beforeAll(async () => {
    const reset = createDb(url);
    await reset.db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
    await reset.pool.end();
    await runMigrations(url);
    const conn = createDb(url);
    db = conn.db;
    close = () => conn.pool.end();
    const [t] = await db.insert(schema.titles).values({
      slug: "glass-harbor-2026", kind: "movie", name: "Glass Harbor", year: 2026,
      releaseDate: new Date("2026-09-12T00:00:00Z"),
    }).returning();
    titleId = t!.id;
    app = await buildServer({ db, rateLimit: false, allowedOrigins: ["http://localhost:3000"] });
  });

  afterAll(async () => {
    await app?.close();
    await close?.();
  });

  async function register(username: string) {
    const res = await app.inject({ method: "POST", url: "/auth/register", payload: { email: `${username}@test.dev`, username, password: "correct-horse-battery" } });
    expect(res.statusCode).toBe(201);
    const cookie = res.cookies.find((c) => c.name === "verdict_session");
    expect(cookie?.httpOnly).toBe(true);
    return { verdict_session: cookie!.value };
  }

  it("registers, rejects duplicates and bad logins, resolves the session", async () => {
    const cookies = await register("alice");
    expect((await app.inject({ url: "/auth/me", cookies })).json().username).toBe("alice");
    expect((await app.inject({ method: "POST", url: "/auth/register", payload: { email: "ALICE@test.dev", username: "other", password: "correct-horse-battery" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/auth/login", payload: { email: "alice@test.dev", password: "wrong" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/auth/login", payload: { email: "alice@test.dev", password: "correct-horse-battery" } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/auth/me" })).statusCode).toBe(401);
  });

  it("upserts one review per user and keeps rating aggregates in sync", async () => {
    const alice = (await app.inject({ method: "POST", url: "/auth/login", payload: { email: "alice@test.dev", password: "correct-horse-battery" } })).cookies[0]!;
    const cookies = { verdict_session: alice.value };
    const review = { rating: 8, headline: "Moody and gorgeous", body: "Great performances, slow middle act, worth seeing on a big screen." };

    const bad = await app.inject({ method: "PUT", url: "/titles/glass-harbor-2026/reviews/mine", cookies, payload: { ...review, rating: 11 } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/titles/glass-harbor-2026/reviews/mine", payload: review })).statusCode).toBe(401);

    const created = await app.inject({ method: "PUT", url: "/titles/glass-harbor-2026/reviews/mine", cookies, payload: review });
    expect(created.statusCode).toBe(201);
    const updated = await app.inject({ method: "PUT", url: "/titles/glass-harbor-2026/reviews/mine", cookies, payload: { ...review, rating: 6 } });
    expect(updated.statusCode).toBe(200);

    const title = (await app.inject({ url: "/titles/glass-harbor-2026" })).json();
    expect(title.userRatingCount).toBe(1);
    expect(title.userScore).toBe(6);
    expect(title.ratingHistogram[5]).toBe(1);

    const list = (await app.inject({ url: "/titles/glass-harbor-2026/reviews", cookies })).json();
    expect(list.total).toBe(1);
    expect(list.mine.rating).toBe(6);

    // Helpful votes: others can toggle, the author cannot.
    const reviewId = list.items[0].id;
    expect((await app.inject({ method: "POST", url: `/reviews/${reviewId}/helpful`, cookies })).statusCode).toBe(403);
    const bob = await register("bob");
    const vote = await app.inject({ method: "POST", url: `/reviews/${reviewId}/helpful`, cookies: bob });
    expect(vote.json()).toEqual({ helpful: true, helpfulCount: 1 });
    expect((await app.inject({ method: "POST", url: `/reviews/${reviewId}/helpful`, cookies: bob })).json()).toEqual({ helpful: false, helpfulCount: 0 });

    const del = await app.inject({ method: "DELETE", url: "/titles/glass-harbor-2026/reviews/mine", cookies });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ url: "/titles/glass-harbor-2026" })).json().userRatingCount).toBe(0);
  });

  it("rejects state-changing requests from foreign origins", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/logout", headers: { origin: "https://evil.example" } });
    expect(res.statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/auth/logout", headers: { origin: "http://localhost:3000" } })).statusCode).toBe(204);
  });

  it("serves consensus after the pipeline runs, and gates manual refresh to admins", async () => {
    expect((await app.inject({ url: "/titles/glass-harbor-2026/consensus" })).json().error).toBe("no_consensus");
    const result = await runConsensus(titleId, { db, reddit: new FixtureRedditSource(), analyzer: new MockConsensusAnalyzer() });
    expect(result.status).toBe("ok");

    const c = (await app.inject({ url: "/titles/glass-harbor-2026/consensus" })).json();
    expect(c.score).toBeGreaterThan(50);
    expect(c.isSampleData).toBe(true);
    expect(c.sources.length).toBeGreaterThanOrEqual(1);
    expect(c.quotes.every((q: { text: string }) => !/dies/.test(q.text))).toBe(true);

    const listed = (await app.inject({ url: "/titles?sort=consensus" })).json();
    expect(listed.items[0].consensusScore).toBe(c.score);

    const bob = (await app.inject({ method: "POST", url: "/auth/login", payload: { email: "bob@test.dev", password: "correct-horse-battery" } })).cookies[0]!;
    expect((await app.inject({ method: "POST", url: "/titles/glass-harbor-2026/consensus/refresh", cookies: { verdict_session: bob.value } })).statusCode).toBe(403);
  });

  it("finds titles by fuzzy search", async () => {
    const res = (await app.inject({ url: "/search?q=glas harbour" })).json();
    expect(res[0]?.slug).toBe("glass-harbor-2026");
  });
});
