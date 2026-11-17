import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@verdict/db";
import type { ReviewView, UserPublic } from "@verdict/shared";
import { notFound } from "../http.ts";
import { toReviewView, toUserPublic } from "../mappers.ts";

export async function userRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get<{ Params: { username: string } }>("/users/:username", async (req): Promise<{
    user: UserPublic; reviews: ReviewView[]; stats: { reviewCount: number; averageRating: number | null };
  }> => {
    const user = await db.query.users.findFirst({ where: sql`lower(${schema.users.username}) = lower(${req.params.username})` });
    if (!user) throw notFound("user");
    const r = schema.reviews;
    const rows = await db.select({ review: r, title: schema.titles }).from(r)
      .innerJoin(schema.titles, eq(schema.titles.id, r.titleId))
      .where(and(eq(r.userId, user.id), eq(r.status, "published")))
      .orderBy(desc(r.createdAt)).limit(50);
    const avg = rows.length ? rows.reduce((s, x) => s + x.review.rating, 0) / rows.length : null;
    return {
      user: toUserPublic(user),
      reviews: rows.map((x) => toReviewView(x.review, user, { title: x.title })),
      stats: { reviewCount: rows.length, averageRating: avg === null ? null : Math.round(avg * 10) / 10 },
    };
  });
}
