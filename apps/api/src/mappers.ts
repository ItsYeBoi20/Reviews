import type { schema } from "@verdict/db";
import type { ReviewView, TitleSummary, UserPublic } from "@verdict/shared";

type TitleRow = typeof schema.titles.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;
type ReviewRow = typeof schema.reviews.$inferSelect;

export function toUserPublic(u: UserRow): UserPublic {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role, createdAt: u.createdAt.toISOString() };
}

export function toTitleSummary(t: TitleRow): TitleSummary {
  return {
    id: t.id, slug: t.slug, kind: t.kind, name: t.name, year: t.year, posterUrl: t.posterUrl, genres: t.genres,
    consensusScore: t.consensusScore, consensusLabel: t.consensusLabel, consensusConfidence: t.consensusConfidence,
    userScore: t.userRatingCount ? Math.round((t.userRatingSum / t.userRatingCount) * 10) / 10 : null,
    userRatingCount: t.userRatingCount,
  };
}

export function toReviewView(
  r: ReviewRow,
  author: Pick<UserRow, "id" | "username" | "displayName">,
  extra: { viewerFoundHelpful?: boolean; title?: Pick<TitleRow, "slug" | "name"> } = {},
): ReviewView {
  return {
    id: r.id, titleId: r.titleId, titleSlug: extra.title?.slug, titleName: extra.title?.name,
    author: { id: author.id, username: author.username, displayName: author.displayName },
    rating: r.rating, headline: r.headline, body: r.body, containsSpoilers: r.containsSpoilers,
    helpfulCount: r.helpfulCount, viewerFoundHelpful: extra.viewerFoundHelpful ?? false,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}
