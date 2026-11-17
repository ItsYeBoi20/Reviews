import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, sql, asc } from "drizzle-orm";
import { schema, type Db } from "@verdict/db";
import { reportInput, reviewInput, reviewListQuery, type Paginated, type ReviewView } from "@verdict/shared";
import { z } from "zod";
import { forbidden, noContent, notFound, parse, requireUser } from "../http.ts";
import { toReviewView } from "../mappers.ts";
import { findTitle } from "./titles.ts";

const AUTO_HIDE_REPORTS = 5;
const writeLimit = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

export async function reviewRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const r = schema.reviews;
  const u = schema.users;

  async function viewerVotes(viewerId: string | undefined, reviewIds: string[]) {
    if (!viewerId || !reviewIds.length) return new Set<string>();
    const rows = await db.select({ id: schema.reviewVotes.reviewId }).from(schema.reviewVotes)
      .where(and(eq(schema.reviewVotes.userId, viewerId), inArray(schema.reviewVotes.reviewId, reviewIds)));
    return new Set(rows.map((x) => x.id));
  }

  app.get<{ Params: { slug: string } }>("/titles/:slug/reviews", async (req): Promise<Paginated<ReviewView> & { mine: ReviewView | null }> => {
    const q = parse(reviewListQuery, req.query);
    const title = await findTitle(db, req.params.slug);
    const order = {
      helpful: [desc(r.helpfulCount), desc(r.createdAt)],
      recent: [desc(r.createdAt)],
      rating_high: [desc(r.rating), desc(r.helpfulCount)],
      rating_low: [asc(r.rating), desc(r.helpfulCount)],
    }[q.sort];
    const where = and(eq(r.titleId, title.id), eq(r.status, "published"));
    const [rows, total] = await Promise.all([
      db.select({ review: r, author: u }).from(r).innerJoin(u, eq(u.id, r.userId)).where(where)
        .orderBy(...order).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      db.$count(r, where),
    ]);
    const votes = await viewerVotes(req.user?.id, rows.map((x) => x.review.id));
    let mine: ReviewView | null = null;
    if (req.user) {
      const own = await db.select().from(r).where(and(eq(r.titleId, title.id), eq(r.userId, req.user.id))).limit(1);
      if (own[0]) mine = toReviewView(own[0], req.user);
    }
    return {
      items: rows.map((x) => toReviewView(x.review, x.author, { viewerFoundHelpful: votes.has(x.review.id) })),
      page: q.page, pageSize: q.pageSize, total, mine,
    };
  });

  /** Create or replace the viewer's review (one per user per title). */
  app.put<{ Params: { slug: string } }>("/titles/:slug/reviews/mine", writeLimit, async (req, reply) => {
    const user = requireUser(req);
    const input = parse(reviewInput, req.body);
    const title = await findTitle(db, req.params.slug);

    const { review, created } = await db.transaction(async (tx) => {
      const existing = await tx.select().from(r).where(and(eq(r.titleId, title.id), eq(r.userId, user.id))).for("update").limit(1);
      const prev = existing[0];
      const values = { rating: input.rating, headline: input.headline, body: input.body, containsSpoilers: input.containsSpoilers };
      if (prev) {
        const [row] = await tx.update(r).set({ ...values, updatedAt: new Date() }).where(eq(r.id, prev.id)).returning();
        if (prev.status === "published") {
          await tx.update(schema.titles)
            .set({ userRatingSum: sql`${schema.titles.userRatingSum} + ${input.rating - prev.rating}` })
            .where(eq(schema.titles.id, title.id));
        }
        return { review: row!, created: false };
      }
      const [row] = await tx.insert(r).values({ ...values, titleId: title.id, userId: user.id }).returning();
      await tx.update(schema.titles).set({
        userRatingSum: sql`${schema.titles.userRatingSum} + ${input.rating}`,
        userRatingCount: sql`${schema.titles.userRatingCount} + 1`,
      }).where(eq(schema.titles.id, title.id));
      return { review: row!, created: true };
    });
    return reply.code(created ? 201 : 200).send(toReviewView(review, user));
  });

  app.delete<{ Params: { slug: string } }>("/titles/:slug/reviews/mine", async (req, reply) => {
    const user = requireUser(req);
    const title = await findTitle(db, req.params.slug);
    await db.transaction(async (tx) => {
      const [deleted] = await tx.delete(r).where(and(eq(r.titleId, title.id), eq(r.userId, user.id))).returning();
      if (!deleted) throw notFound("review");
      if (deleted.status === "published") {
        await tx.update(schema.titles).set({
          userRatingSum: sql`${schema.titles.userRatingSum} - ${deleted.rating}`,
          userRatingCount: sql`${schema.titles.userRatingCount} - 1`,
        }).where(eq(schema.titles.id, title.id));
      }
    });
    return noContent(reply);
  });

  /** Toggles the viewer's "helpful" vote. */
  app.post<{ Params: { id: string } }>("/reviews/:id/helpful", writeLimit, async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    return db.transaction(async (tx) => {
      const review = await tx.query.reviews.findFirst({ where: eq(r.id, id) });
      if (!review || review.status !== "published") throw notFound("review");
      if (review.userId === user.id) throw forbidden("you can't vote on your own review");
      const removed = await tx.delete(schema.reviewVotes)
        .where(and(eq(schema.reviewVotes.reviewId, id), eq(schema.reviewVotes.userId, user.id))).returning();
      if (!removed.length) await tx.insert(schema.reviewVotes).values({ reviewId: id, userId: user.id });
      const [row] = await tx.update(r).set({ helpfulCount: sql`${r.helpfulCount} + ${removed.length ? -1 : 1}` })
        .where(eq(r.id, id)).returning({ helpfulCount: r.helpfulCount });
      return { helpful: !removed.length, helpfulCount: row!.helpfulCount };
    });
  });

  /** Reports a review; enough distinct reports hide it pending moderation. */
  app.post<{ Params: { id: string } }>("/reviews/:id/report", writeLimit, async (req, reply) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const input = parse(reportInput, req.body);
    await db.transaction(async (tx) => {
      const review = await tx.query.reviews.findFirst({ where: eq(r.id, id) });
      if (!review) throw notFound("review");
      const inserted = await tx.insert(schema.reviewReports).values({ reviewId: id, userId: user.id, reason: input.reason, note: input.note })
        .onConflictDoNothing().returning();
      if (!inserted.length) return;
      const [row] = await tx.update(r).set({ reportCount: sql`${r.reportCount} + 1` }).where(eq(r.id, id)).returning();
      if (row!.reportCount >= AUTO_HIDE_REPORTS && row!.status === "published") {
        await tx.update(r).set({ status: "hidden" }).where(eq(r.id, id));
        await tx.update(schema.titles).set({
          userRatingSum: sql`${schema.titles.userRatingSum} - ${row!.rating}`,
          userRatingCount: sql`${schema.titles.userRatingCount} - 1`,
        }).where(eq(schema.titles.id, row!.titleId));
      }
    });
    return noContent(reply);
  });

  app.get("/reviews/recent", async (req): Promise<ReviewView[]> => {
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(30).default(8) }), req.query);
    const rows = await db.select({ review: r, author: u, title: schema.titles }).from(r)
      .innerJoin(u, eq(u.id, r.userId)).innerJoin(schema.titles, eq(schema.titles.id, r.titleId))
      .where(and(eq(r.status, "published"), eq(r.containsSpoilers, false)))
      .orderBy(desc(r.createdAt)).limit(limit);
    return rows.map((x) => toReviewView(x.review, x.author, { title: x.title }));
  });
}
