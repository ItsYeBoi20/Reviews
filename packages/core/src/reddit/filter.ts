import { createHash } from "node:crypto";
import type { RedditComment, RedditThread } from "./types.ts";

export interface FilterOptions {
  minScore: number;
  minLength: number;
  maxChars: number;
  maxComments: number;
}

export const DEFAULT_FILTER: FilterOptions = { minScore: 2, minLength: 25, maxChars: 1200, maxComments: 200 };

const BOT_AUTHOR = /(^automoderator$|bot$|^\[deleted\]$|^remindmebot|^sneakpeekbot)/i;
const REMOVED_BODY = /^\s*\[(deleted|removed)\]\s*$/i;
// Link-only, emoji-only and pure-reaction comments carry no reviewable opinion.
const LOW_SIGNAL = /^(\W|lol|lmao|this|same|\^|f)+$/i;

export function hashAuthor(author: string): string {
  return createHash("sha256").update(author.toLowerCase()).digest("hex").slice(0, 16);
}

function bodyKey(body: string): string {
  return createHash("sha1").update(body.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");
}

function clip(body: string, maxChars: number): string {
  if (body.length <= maxChars) return body;
  const cut = body.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (lastStop > maxChars * 0.6 ? cut.slice(0, lastStop + 1) : cut) + " …";
}

export interface FilteredComment extends RedditComment {
  authorHash: string;
  subreddit: string;
}

/**
 * Removes bots, deleted/removed comments, low-score and low-signal comments,
 * duplicates, and repeat authors (one voice per person per title), then samples
 * round-robin across threads so no single thread dominates the input.
 */
export function filterComments(
  threads: RedditThread[],
  commentsByThread: Map<string, RedditComment[]>,
  opts: FilterOptions = DEFAULT_FILTER,
): FilteredComment[] {
  const seenBodies = new Set<string>();
  const bestByAuthor = new Map<string, FilteredComment>();

  for (const thread of threads) {
    for (const c of commentsByThread.get(thread.id) ?? []) {
      if (c.stickied || c.distinguished === "moderator") continue;
      if (BOT_AUTHOR.test(c.author) || REMOVED_BODY.test(c.body)) continue;
      const body = c.body.trim();
      if (body.length < opts.minLength || LOW_SIGNAL.test(body)) continue;
      if (c.score < opts.minScore) continue;
      const key = bodyKey(body);
      if (seenBodies.has(key)) continue;
      seenBodies.add(key);

      const authorHash = hashAuthor(c.author);
      const prev = bestByAuthor.get(authorHash);
      if (prev && prev.score >= c.score) continue;
      bestByAuthor.set(authorHash, { ...c, body: clip(body, opts.maxChars), authorHash, subreddit: thread.subreddit });
    }
  }

  // Round-robin by thread, highest score first within each thread.
  const perThread = new Map<string, FilteredComment[]>();
  for (const c of bestByAuthor.values()) {
    const list = perThread.get(c.threadId) ?? [];
    list.push(c);
    perThread.set(c.threadId, list);
  }
  for (const list of perThread.values()) list.sort((a, b) => b.score - a.score);

  const out: FilteredComment[] = [];
  const queues = [...perThread.values()];
  while (out.length < opts.maxComments && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
      if (out.length >= opts.maxComments) break;
    }
  }
  return out;
}
