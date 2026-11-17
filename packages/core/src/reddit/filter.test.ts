import { describe, expect, it } from "vitest";
import { filterComments } from "./filter.ts";
import type { RedditComment, RedditThread } from "./types.ts";

const t = (id: string): RedditThread => ({ id, subreddit: "movies", title: id, permalink: "", score: 1, numComments: 10, postedAt: new Date() });
let n = 0;
const c = (threadId: string, author: string, body: string, score = 10, extra: Partial<RedditComment> = {}): RedditComment =>
  ({ id: `t1_${n++}`, threadId, author, body, score, permalink: "", postedAt: new Date(), ...extra });

describe("filterComments", () => {
  const body = (s: string) => `${s} this has enough characters to count as an opinion`;
  it("drops bots, removed, low-signal, low-score, duplicates and stickied mod posts", () => {
    const out = filterComments([t("a")], new Map([["a", [
      c("a", "AutoModerator", body("rules")),
      c("a", "[deleted]", "[deleted]"),
      c("a", "someone", "lol"),
      c("a", "low", body("low score"), 0),
      c("a", "x", body("same text")),
      c("a", "y", body("same text")),
      c("a", "mod", body("pinned"), 50, { stickied: true }),
      c("a", "RemindMeBot", body("reminder")),
      c("a", "real", body("a real opinion")),
    ]]]));
    expect(out.map((o) => o.author).sort()).toEqual(["real", "x"]);
  });
  it("keeps one comment per author, the highest scored", () => {
    const out = filterComments([t("a"), t("b")], new Map([
      ["a", [c("a", "sam", body("first"), 5)]],
      ["b", [c("b", "sam", body("second"), 50)]],
    ]));
    expect(out).toHaveLength(1);
    expect(out[0]!.score).toBe(50);
  });
  it("samples round-robin across threads", () => {
    const many = (id: string) => Array.from({ length: 10 }, (_, i) => c(id, `${id}${i}`, body(`${id} ${i}`), 100 - i));
    const out = filterComments([t("a"), t("b")], new Map([["a", many("a")], ["b", many("b")]]), {
      minScore: 1, minLength: 10, maxChars: 500, maxComments: 4,
    });
    expect(out.map((o) => o.threadId)).toEqual(["a", "b", "a", "b"]);
  });
});
