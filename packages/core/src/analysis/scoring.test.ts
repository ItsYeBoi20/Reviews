import { describe, expect, it } from "vitest";
import type { FilteredComment } from "../reddit/filter.ts";
import {
  capThreadShare, commentWeight, computeStats, confidenceFor, nextRefreshAt, pickQuotes, scoreLabel, weighComments, type CommentLabel,
} from "./scoring.ts";

function comment(id: string, threadId: string, score: number, body = `comment ${id} with enough text to be quotable in the panel ok`): FilteredComment {
  return { id, threadId, author: id, authorHash: id, body, score, permalink: `https://r/${id}`, postedAt: new Date(), subreddit: "movies" };
}
const label = (id: string, sentiment: CommentLabel["sentiment"], extra: Partial<CommentLabel> = {}): CommentLabel =>
  ({ id, sentiment, praised: [], criticized: [], spoiler: false, ...extra });

describe("commentWeight", () => {
  it("is log-scaled so one viral comment cannot dominate", () => {
    expect(commentWeight(0)).toBe(1);
    expect(commentWeight(9999)).toBeCloseTo(5, 5);
    expect(commentWeight(-50)).toBe(1);
  });
});

describe("capThreadShare", () => {
  it("leaves a single thread alone", () => {
    expect(capThreadShare([{ threadId: "a", weight: 10 }]).get("a")).toBe(1);
  });
  it("caps a dominant thread among many", () => {
    const items = [{ threadId: "a", weight: 90 }, ...["b", "c", "d", "e"].map((t) => ({ threadId: t, weight: 2.5 }))];
    const f = capThreadShare(items);
    const scaledA = 90 * f.get("a")!;
    expect(scaledA / (scaledA + 10)).toBeCloseTo(0.5, 3);
  });
  it("is loose with two threads so the bigger one still counts more", () => {
    const f = capThreadShare([{ threadId: "a", weight: 80 }, { threadId: "b", weight: 20 }]);
    expect(f.get("a")).toBeCloseTo(1, 5); // 80% < 85% cap for two threads
  });
});

describe("computeStats", () => {
  const comments = ["1", "2", "3", "4", "5"].map((id) => comment(id, "t", 10));
  it("scores approval with mixed counting half and ignores off-topic", () => {
    const labels = [label("1", "positive"), label("2", "positive"), label("3", "mixed"), label("4", "negative"), label("5", "off_topic")];
    const stats = computeStats(weighComments(comments, labels));
    expect(stats.sampleSize).toBe(4);
    expect(stats.score).toBe(Math.round((2.5 / 4) * 100));
    expect(stats.breakdown.positive + stats.breakdown.mixed + stats.breakdown.negative).toBeCloseTo(1);
  });
  it("aggregates aspect shares", () => {
    const labels = comments.map((c, i) => label(c.id, "positive", { praised: i < 3 ? ["visuals"] : [], criticized: i === 4 ? ["pacing"] : [] }));
    const stats = computeStats(weighComments(comments, labels));
    expect(stats.pros[0]).toEqual({ aspect: "visuals", share: 0.6 });
    expect(stats.cons[0]?.aspect).toBe("pacing");
  });
  it("handles no opinions", () => {
    const stats = computeStats(weighComments(comments, comments.map((c) => label(c.id, "off_topic"))));
    expect(stats.sampleSize).toBe(0);
    expect(stats.confidence).toBe("low");
  });
});

describe("labels and confidence", () => {
  it("maps score and controversy to labels", () => {
    expect(scoreLabel(90, 0.1)).toBe("Widely loved");
    expect(scoreLabel(75, 0.2)).toBe("Well liked");
    expect(scoreLabel(55, 0.9)).toBe("Divisive");
    expect(scoreLabel(55, 0.3)).toBe("Mostly positive");
    expect(scoreLabel(45, 0.3)).toBe("Mixed");
    expect(scoreLabel(10, 0.1)).toBe("Panned");
  });
  it("requires volume for confidence", () => {
    expect(confidenceFor(10, 10)).toBe("low");
    expect(confidenceFor(40, 30)).toBe("medium");
    expect(confidenceFor(200, 120)).toBe("high");
  });
});

describe("pickQuotes", () => {
  it("never quotes spoilers and includes dissent", () => {
    const bodies = {
      a: "When the captain dies at the end I lost it, best scene of the year",
      b: "The cinematography is gorgeous and every frame could hang in a gallery",
      c: "Performances across the whole cast felt grounded and genuinely lived in",
      d: "Score swells at exactly the right moments without ever overpowering things",
      e: "Pacing collapses in the second hour and the plot threads never connect",
      f: "Dialogue was stiff, I checked my watch constantly during the middle stretch",
    } as const;
    const cs = (Object.keys(bodies) as (keyof typeof bodies)[]).map((id, i) => comment(id, `t${i % 3}`, 100 - i, bodies[id]));
    const labels = [
      label("a", "positive", { spoiler: true }), label("b", "positive"), label("c", "positive"),
      label("d", "positive"), label("e", "negative"), label("f", "negative"),
    ];
    const w = weighComments(cs, labels);
    const quotes = pickQuotes(w, computeStats(w));
    expect(quotes.some((q) => q.text.includes("captain dies"))).toBe(false);
    expect(quotes.some((q) => q.sentiment === "negative")).toBe(true);
  });
});

describe("nextRefreshAt", () => {
  const now = new Date("2026-11-17T00:00:00Z");
  const day = 86_400_000;
  it("refreshes new releases often and back catalog rarely", () => {
    expect(nextRefreshAt(new Date(now.getTime() - 3 * day), now, true).getTime() - now.getTime()).toBe(0.5 * day);
    expect(nextRefreshAt(new Date("2020-01-01"), now, true).getTime() - now.getTime()).toBe(60 * day);
    expect(nextRefreshAt(new Date(now.getTime() - 3 * day), now, false).getTime() - now.getTime()).toBe(day);
  });
});
