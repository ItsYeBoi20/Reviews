import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ConsensusPoint, ConsensusQuote, ConsensusSource } from "@verdict/shared";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const mediaKindEnum = pgEnum("media_kind", ["movie", "tv", "game"]);
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const reviewStatusEnum = pgEnum("review_status", ["published", "hidden"]);
export const sentimentEnum = pgEnum("sentiment", ["positive", "mixed", "negative", "off_topic"]);
export const confidenceEnum = pgEnum("confidence", ["low", "medium", "high"]);

// ---------------------------------------------------------------- users

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  ...timestamps,
}, (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`)]);

/** Opaque session tokens. Only the SHA-256 of the token is stored. */
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

// ---------------------------------------------------------------- catalog

export interface RedditConfig {
  /** Title-specific subs, e.g. ["eldenring"]. Merged with the per-kind defaults. */
  subreddits?: string[];
  /** Extra search phrases, e.g. abbreviations like "TotK". */
  aliases?: string[];
}

export const titles = pgTable("titles", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: mediaKindEnum("kind").notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  year: smallint("year"),
  releaseDate: timestamp("release_date", { withTimezone: true, mode: "date" }),
  synopsis: text("synopsis"),
  posterUrl: text("poster_url"),
  backdropUrl: text("backdrop_url"),
  genres: text("genres").array().notNull().default(sql`'{}'::text[]`),
  platforms: text("platforms").array().notNull().default(sql`'{}'::text[]`),
  creators: text("creators").array().notNull().default(sql`'{}'::text[]`),
  runtimeMinutes: smallint("runtime_minutes"),
  externalIds: jsonb("external_ids").$type<Record<string, string | number>>().notNull().default({}),
  redditConfig: jsonb("reddit_config").$type<RedditConfig>().notNull().default({}),
  /** Catalog popularity (TMDB/IGDB) blended with on-site activity; drives "trending". */
  popularity: real("popularity").notNull().default(0),
  // Denormalized for list pages; maintained by the API (reviews) and worker (consensus).
  userRatingSum: integer("user_rating_sum").notNull().default(0),
  userRatingCount: integer("user_rating_count").notNull().default(0),
  consensusScore: smallint("consensus_score"),
  consensusLabel: text("consensus_label"),
  consensusConfidence: confidenceEnum("consensus_confidence"),
  consensusAnalyzedAt: timestamp("consensus_analyzed_at", { withTimezone: true }),
  consensusNextAt: timestamp("consensus_next_at", { withTimezone: true }).defaultNow(),
  ...timestamps,
}, (t) => [
  index("titles_kind_popularity_idx").on(t.kind, t.popularity),
  index("titles_consensus_next_idx").on(t.consensusNextAt),
  index("titles_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
]);

// ---------------------------------------------------------------- user reviews

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  titleId: uuid("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: smallint("rating").notNull(),
  headline: text("headline").notNull(),
  body: text("body").notNull(),
  containsSpoilers: boolean("contains_spoilers").notNull().default(false),
  status: reviewStatusEnum("status").notNull().default("published"),
  helpfulCount: integer("helpful_count").notNull().default(0),
  reportCount: integer("report_count").notNull().default(0),
  ...timestamps,
}, (t) => [
  uniqueIndex("reviews_title_user_idx").on(t.titleId, t.userId),
  index("reviews_title_helpful_idx").on(t.titleId, t.helpfulCount),
  index("reviews_user_idx").on(t.userId, t.createdAt),
]);

export const reviewVotes = pgTable("review_votes", {
  reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.reviewId, t.userId] })]);

export const reviewReports = pgTable("review_reports", {
  reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.reviewId, t.userId] })]);

// ---------------------------------------------------------------- reddit consensus

export const redditThreads = pgTable("reddit_threads", {
  id: text("id").primaryKey(), // reddit fullname, e.g. t3_abc123
  titleId: uuid("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
  subreddit: text("subreddit").notNull(),
  title: text("title").notNull(),
  permalink: text("permalink").notNull(),
  score: integer("score").notNull(),
  numComments: integer("num_comments").notNull(),
  relevance: real("relevance").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("reddit_threads_title_idx").on(t.titleId)]);

/**
 * Raw comment text is short-lived: the purge job nulls `body` after the
 * retention window so we never keep a long-term copy of Reddit content.
 * Usernames are not stored; `authorHash` exists only to cap one author's weight.
 */
export const redditComments = pgTable("reddit_comments", {
  id: text("id").primaryKey(), // t1_xxx
  threadId: text("thread_id").notNull().references(() => redditThreads.id, { onDelete: "cascade" }),
  titleId: uuid("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
  authorHash: text("author_hash").notNull(),
  body: text("body"),
  score: integer("score").notNull(),
  permalink: text("permalink").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("reddit_comments_title_idx").on(t.titleId), index("reddit_comments_fetched_idx").on(t.fetchedAt)]);

export const consensusSnapshots = pgTable("consensus_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  titleId: uuid("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
  score: smallint("score").notNull(),
  label: text("label").notNull(),
  confidence: confidenceEnum("confidence").notNull(),
  controversy: real("controversy").notNull(),
  positiveShare: real("positive_share").notNull(),
  mixedShare: real("mixed_share").notNull(),
  negativeShare: real("negative_share").notNull(),
  sampleSize: integer("sample_size").notNull(),
  threadCount: integer("thread_count").notNull(),
  summary: text("summary").notNull(),
  pros: jsonb("pros").$type<ConsensusPoint[]>().notNull(),
  cons: jsonb("cons").$type<ConsensusPoint[]>().notNull(),
  quotes: jsonb("quotes").$type<ConsensusQuote[]>().notNull(),
  sources: jsonb("sources").$type<ConsensusSource[]>().notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  isSampleData: boolean("is_sample_data").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("consensus_title_created_idx").on(t.titleId, t.createdAt)]);

/** Per-comment labels kept for audit and for re-scoring without another LLM pass. */
export const commentLabels = pgTable("comment_labels", {
  snapshotId: uuid("snapshot_id").notNull().references(() => consensusSnapshots.id, { onDelete: "cascade" }),
  commentId: text("comment_id").notNull(),
  sentiment: sentimentEnum("sentiment").notNull(),
  weight: real("weight").notNull(),
  aspects: text("aspects").array().notNull().default(sql`'{}'::text[]`),
}, (t) => [primaryKey({ columns: [t.snapshotId, t.commentId] })]);
