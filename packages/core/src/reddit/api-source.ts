import type { RedditComment, RedditSource, RedditThread } from "./types.ts";

export interface RedditApiOptions {
  clientId: string;
  clientSecret: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
}

interface Listing<T> {
  kind: "Listing";
  data: { children: { kind: string; data: T }[]; after: string | null };
}

interface RawPost {
  name: string; subreddit: string; title: string; permalink: string; score: number;
  num_comments: number; created_utc: number; link_flair_text?: string | null; over_18?: boolean;
}
interface RawComment {
  name: string; author: string; body: string; score: number; permalink: string;
  created_utc: number; stickied?: boolean; distinguished?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Minimal Reddit Data API client (application-only OAuth).
 *
 * Rate limiting: Reddit reports the remaining budget in X-Ratelimit-* headers
 * (free tier is 100 queries/minute per OAuth client). We pause when the budget
 * runs low instead of guessing a fixed rate, and back off on 429.
 * One client instance should be shared per process; across worker processes,
 * keep the consensus queue concurrency low (see docs/PLAN.md).
 */
export class RedditApiSource implements RedditSource {
  readonly name = "reddit-api";
  readonly isSampleData = false;
  private token: { value: string; expiresAt: number } | null = null;
  private pauseUntil = 0;
  private readonly fetch: typeof fetch;

  constructor(private readonly opts: RedditApiOptions) {
    if (!opts.clientId || !opts.clientSecret) throw new Error("REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are required for REDDIT_SOURCE=api");
    if (/CHANGE_ME/.test(opts.userAgent)) throw new Error("Set REDDIT_USER_AGENT to identify your app and Reddit username");
    this.fetch = opts.fetchImpl ?? fetch;
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await this.fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this.opts.userAgent,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`Reddit auth failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async get<T>(path: string, params: Record<string, string | number>, attempt = 0): Promise<T> {
    const wait = this.pauseUntil - Date.now();
    if (wait > 0) await sleep(wait);

    const url = new URL(`https://oauth.reddit.com${path}`);
    for (const [k, v] of Object.entries({ ...params, raw_json: 1 })) url.searchParams.set(k, String(v));
    const res = await this.fetch(url, {
      headers: { Authorization: `Bearer ${await this.getToken()}`, "User-Agent": this.opts.userAgent },
    });

    const remaining = Number(res.headers.get("x-ratelimit-remaining"));
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(remaining) && Number.isFinite(reset) && remaining < 3) {
      this.pauseUntil = Date.now() + (reset + 1) * 1000;
    }

    if (res.status === 401 && attempt === 0) {
      this.token = null;
      return this.get(path, params, attempt + 1);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 2000);
      return this.get(path, params, attempt + 1);
    }
    if (!res.ok) throw new Error(`Reddit GET ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  async searchThreads(subreddit: string, query: string, limit: number): Promise<RedditThread[]> {
    const listing = await this.get<Listing<RawPost>>(`/r/${encodeURIComponent(subreddit)}/search`, {
      q: query, restrict_sr: 1, sort: "relevance", t: "all", type: "link", limit,
    });
    return listing.data.children
      .filter((c) => c.kind === "t3")
      .map(({ data: p }) => ({
        id: p.name,
        subreddit: p.subreddit,
        title: p.title,
        permalink: `https://www.reddit.com${p.permalink}`,
        score: p.score,
        numComments: p.num_comments,
        postedAt: new Date(p.created_utc * 1000),
        flair: p.link_flair_text ?? null,
      }));
  }

  async fetchTopComments(thread: RedditThread, limit: number): Promise<RedditComment[]> {
    const id36 = thread.id.replace(/^t3_/, "");
    const [, comments] = await this.get<[Listing<RawPost>, Listing<RawComment>]>(`/comments/${id36}`, {
      sort: "top", limit, depth: 1,
    });
    return comments.data.children
      .filter((c) => c.kind === "t1")
      .map(({ data: c }) => ({
        id: c.name,
        threadId: thread.id,
        author: c.author,
        body: c.body,
        score: c.score,
        permalink: `https://www.reddit.com${c.permalink}`,
        postedAt: new Date(c.created_utc * 1000),
        stickied: c.stickied,
        distinguished: c.distinguished,
      }));
  }
}
