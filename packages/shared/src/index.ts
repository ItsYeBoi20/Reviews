// API contracts shared by the API server and the web client.
// Request bodies are validated with these schemas on the server; response
// types are plain TS so the web app gets them without a runtime cost.
import { z } from "zod";

export const MEDIA_KINDS = ["movie", "tv", "game"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const mediaKind = z.enum(MEDIA_KINDS);

export const SENTIMENTS = ["positive", "mixed", "negative", "off_topic"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const TITLE_SORTS = ["trending", "top", "consensus", "new"] as const;
export type TitleSort = (typeof TITLE_SORTS)[number];

// ---------- request schemas ----------

export const registerInput = z.object({
  email: z.email().max(254).transform((s) => s.toLowerCase()),
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "letters, numbers and underscores only"),
  password: z.string().min(10).max(200),
});
export type RegisterInput = z.infer<typeof registerInput>;

export const loginInput = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(200),
});

export const reviewInput = z.object({
  rating: z.int().min(1).max(10),
  headline: z.string().trim().min(3).max(120),
  body: z.string().trim().min(20).max(10_000),
  containsSpoilers: z.boolean().default(false),
});
export type ReviewInput = z.infer<typeof reviewInput>;

export const reportInput = z.object({
  reason: z.enum(["spam", "abuse", "spoilers", "off_topic", "other"]),
  note: z.string().trim().max(500).optional(),
});

export const titleListQuery = z.object({
  kind: mediaKind.optional(),
  sort: z.enum(TITLE_SORTS).default("trending"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const reviewListQuery = z.object({
  sort: z.enum(["helpful", "recent", "rating_high", "rating_low"]).default("helpful"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

// ---------- response types ----------

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UserPublic {
  id: string;
  username: string;
  displayName: string;
  role: "user" | "admin";
  createdAt: string;
}

export interface ScoreBadge {
  /** 0-100 approval share for Reddit consensus; null when never analyzed */
  consensusScore: number | null;
  consensusLabel: string | null;
  consensusConfidence: Confidence | null;
  /** mean of user ratings on a 1-10 scale */
  userScore: number | null;
  userRatingCount: number;
}

export type Confidence = "low" | "medium" | "high";

export interface TitleSummary extends ScoreBadge {
  id: string;
  slug: string;
  kind: MediaKind;
  name: string;
  year: number | null;
  posterUrl: string | null;
  genres: string[];
}

export interface TitleDetail extends TitleSummary {
  synopsis: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  platforms: string[];
  creators: string[];
  externalIds: Record<string, string | number>;
  ratingHistogram: number[]; // index 0 => rating 1
}

export interface ConsensusPoint {
  point: string;
  /** share of analyzed comments that raised it, 0-1 */
  share: number;
}

export interface ConsensusQuote {
  text: string;
  sentiment: Sentiment;
  upvotes: number;
  permalink: string;
  subreddit: string;
}

export interface ConsensusSource {
  id: string;
  subreddit: string;
  title: string;
  permalink: string;
  commentCount: number;
}

export interface ConsensusView {
  titleId: string;
  score: number; // 0-100
  label: string;
  confidence: Confidence;
  controversy: number; // 0-1, higher = more split
  breakdown: { positive: number; mixed: number; negative: number }; // weighted shares, sum to 1
  sampleSize: number; // comments used after filtering
  threadCount: number;
  summary: string;
  pros: ConsensusPoint[];
  cons: ConsensusPoint[];
  quotes: ConsensusQuote[];
  sources: ConsensusSource[];
  provider: string;
  model: string;
  promptVersion: string;
  isSampleData: boolean;
  analyzedAt: string;
  history: { analyzedAt: string; score: number }[];
}

export interface ReviewView {
  id: string;
  titleId: string;
  titleSlug?: string;
  titleName?: string;
  author: Pick<UserPublic, "id" | "username" | "displayName">;
  rating: number;
  headline: string;
  body: string;
  containsSpoilers: boolean;
  helpfulCount: number;
  viewerFoundHelpful: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
