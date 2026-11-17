import { describe, expect, it } from "vitest";
import { buildSearchQuery, pickThreads, threadRelevance, type TitleRef } from "./discovery.ts";
import type { RedditThread } from "./types.ts";

const title: TitleRef = { name: "Glass Harbor", year: 2026, kind: "movie", releaseDate: new Date("2026-09-12T00:00:00Z") };
const now = new Date("2026-11-17T00:00:00Z");
const thread = (t: Partial<RedditThread>): RedditThread => ({
  id: `t3_${Math.random()}`, subreddit: "movies", title: "", permalink: "", score: 100, numComments: 900,
  postedAt: new Date("2026-09-13T00:00:00Z"), ...t,
});

describe("thread discovery", () => {
  it("prefers official discussion threads", () => {
    const r = threadRelevance(title, thread({ title: "Official Discussion - Glass Harbor [SPOILERS]" }), now);
    expect(r.match).toBe(1);
    expect(r.score).toBeGreaterThan(0.9);
  });
  it("rejects trailers, remakes and unrelated titles", () => {
    const picked = pickThreads(title, [
      thread({ title: "Glass Harbor - Official Trailer", postedAt: new Date("2026-05-01T00:00:00Z") }),
      thread({ title: "Glass Harbor (1987) is underrated" }),
      thread({ title: "Best harbor scenes in film?" }),
      thread({ title: "Just watched Glass Harbor, thoughts?" }),
    ], 6, now);
    expect(picked.map((p) => p.thread.title)).toEqual(["Just watched Glass Harbor, thoughts?"]);
  });
  it("dedupes and builds a title-scoped query with aliases", () => {
    const t = thread({ id: "t3_x", title: "Official Discussion - Glass Harbor" });
    expect(pickThreads(title, [t, t], 6, now)).toHaveLength(1);
    expect(buildSearchQuery({ ...title, aliases: ["GH"] })).toBe('title:"Glass Harbor" OR title:"GH"');
  });
});
