import { createHash } from "node:crypto";
import type { MediaKind } from "@verdict/shared";
import type { RedditComment, RedditSource, RedditThread } from "../reddit/types.ts";
import { FIXTURE_TITLES, type FixtureTitle } from "./titles.ts";

/**
 * Generates deterministic synthetic Reddit threads for the fixture titles.
 * The mix includes noise the real pipeline must handle: a pre-release trailer
 * thread, an older same-name work, AutoModerator, deleted comments,
 * duplicates, low-score replies, off-topic chatter and spoilers.
 */

function rng(seed: string) {
  let h = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PHRASE: Record<string, string> = {
  story: "the story", writing: "the dialogue", acting: "the lead performance", characters: "the character work",
  direction: "the direction", visuals: "the cinematography", effects: "the CGI", music: "the score",
  sound: "the sound design", pacing: "the pacing", runtime: "the runtime", ending: "the ending",
  action: "the action", humor: "the humor", tone: "the tone", season_arc: "this season",
  episode_quality: "the run of middle episodes", finale: "the finale", worldbuilding: "the worldbuilding",
  gameplay: "the gameplay", combat: "the combat", level_design: "the level design", exploration: "the exploration",
  difficulty: "the difficulty", performance: "the frame rate", bugs: "the bug situation", price_value: "the price",
  monetization: "the microtransaction model", multiplayer: "the multiplayer", replayability: "the replayability",
  progression: "the progression",
};
const GAME_PHRASE: Record<string, string> = { visuals: "the art direction", music: "the soundtrack" };

const WORDS: Record<MediaKind, { noun: string; seen: string; did: string }> = {
  movie: { noun: "movie", seen: "seen", did: "watched" },
  tv: { noun: "show", seen: "watched", did: "finished" },
  game: { noun: "game", seen: "played", did: "beat" },
};

const POSITIVE = [
  "{A} was absolutely incredible. Easily one of the best {noun}s I've {seen} this year.",
  "Honestly loved it. {A} was superb, and {b} was fantastic too.",
  "Came in with low expectations and was blown away. {A} is stunning.",
  "{A} is brilliant. I haven't stopped thinking about it since I {did} it.",
  "Just {did} it and wow. {A} was phenomenal and {b} was great.",
  "This is a masterpiece. {A} and {b} are both outstanding.",
  "I rarely post but I have to say {a} was excellent. Gripping from start to finish.",
  "Second time through and I enjoyed it even more. {A} is beautiful.",
];
const NEGATIVE = [
  "{A} was a mess. I really wanted to like it but it was boring.",
  "Sorry but this was disappointing. {A} felt lazy and {b} was weak.",
  "{A} is terrible. Huge waste of time for me.",
  "Overrated. {A} was bland and {b} was tedious.",
  "I was bored the whole time. {A} was awful.",
  "Really frustrating experience. {A} is broken and nobody seems to care.",
];
const MIXED = [
  "{A} was gorgeous, but {c} was a real drag.",
  "Loved {a}, but {c} was disappointing.",
  "Great {a_bare}. However {c} was frustrating and it hurt the whole thing.",
  "{A} is excellent, though {c} felt rushed.",
];
const OFF_TOPIC: Record<MediaKind, string[]> = {
  movie: [
    "The guy next to me in the theater was on his phone the entire time.",
    "Is this streaming anywhere yet or only in theaters?",
    "My popcorn cost more than the ticket at this point.",
  ],
  tv: [
    "Does anyone know when the next season is supposed to come out?",
    "Which streaming service has the rest of the series?",
    "My partner fell asleep during episode two, so we're starting over.",
  ],
  game: [
    "Anyone know if there's a physical edition coming?",
    "What platform are you all playing on?",
    "Downloading now, see you all in forty hours.",
  ],
};
const SPOILER_POSITIVE = "When the mentor dies in the last act I actually teared up. Incredible scene.";

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fill(t: string, kind: MediaKind, a: string, b: string, c: string) {
  const ph = (k: string) => (kind === "game" ? GAME_PHRASE[k] : undefined) ?? PHRASE[k] ?? k;
  const w = WORDS[kind];
  return t
    .replaceAll("{A}", cap(ph(a)))
    .replaceAll("{a}", ph(a))
    .replaceAll("{a_bare}", ph(a).replace(/^the /, ""))
    .replaceAll("{b}", ph(b))
    .replaceAll("{c}", ph(c))
    .replaceAll("{noun}", w.noun)
    .replaceAll("{seen}", w.seen)
    .replaceAll("{did}", w.did);
}

interface ThreadSpec {
  sub: string;
  title: string;
  dayOffset: number;
  comments: number;
  opinion: boolean;
}

function threadSpecs(t: FixtureTitle): ThreadSpec[] {
  const own = t.subreddits?.[0];
  switch (t.kind) {
    case "movie":
      return [
        { sub: "movies", title: `Official Discussion - ${t.name} [SPOILERS]`, dayOffset: 1, comments: 34, opinion: true },
        { sub: "flicks", title: `Just watched ${t.name} (${t.year}), what did everyone think?`, dayOffset: 6, comments: 18, opinion: true },
        { sub: "movies", title: `${t.name} - Official Trailer`, dayOffset: -120, comments: 12, opinion: false },
        { sub: "TrueFilm", title: `${t.name} (1987) is an overlooked gem`, dayOffset: 30, comments: 9, opinion: false },
      ];
    case "tv":
      return [
        { sub: "television", title: `'${t.name}' Season 1 Finale Discussion`, dayOffset: 2, comments: 32, opinion: true },
        { sub: "TrueTelevision", title: `${t.name} post-season thoughts`, dayOffset: 9, comments: 16, opinion: true },
        { sub: "television", title: `${t.name} - Official Teaser`, dayOffset: -90, comments: 10, opinion: false },
      ];
    case "game":
      return [
        { sub: "Games", title: `${t.name} - Review Thread`, dayOffset: 0, comments: 30, opinion: true },
        { sub: "gaming", title: `Just finished ${t.name}, impressions`, dayOffset: 12, comments: 14, opinion: true },
        ...(own ? [{ sub: own, title: `${t.name} discussion: one month later`, dayOffset: 30, comments: 14, opinion: true }] : []),
        { sub: "Games", title: `${t.name} - Launch Trailer`, dayOffset: -60, comments: 10, opinion: false },
      ];
  }
}

function pickSentiment(r: number, p: FixtureTitle["profile"]) {
  if (r < p.positive) return "positive";
  if (r < p.positive + p.mixed) return "mixed";
  return "negative";
}

interface Generated {
  thread: RedditThread;
  comments: RedditComment[];
}

function generate(t: FixtureTitle): Generated[] {
  const rand = rng(t.slug);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  const release = new Date(`${t.releaseDate}T00:00:00Z`);

  return threadSpecs(t).map((spec, ti) => {
    const id36 = createHash("sha1").update(`${t.slug}:${ti}`).digest("hex").slice(0, 7);
    const threadId = `t3_${id36}`;
    const postedAt = new Date(release.getTime() + spec.dayOffset * 86_400_000);
    const permalink = `https://www.reddit.com/r/${spec.sub}/comments/${id36}/`;
    const comments: RedditComment[] = [];
    const add = (body: string, author: string, score: number, extra: Partial<RedditComment> = {}) => {
      const cid = createHash("sha1").update(`${threadId}:${comments.length}`).digest("hex").slice(0, 7);
      comments.push({
        id: `t1_${cid}`, threadId, author, body, score, permalink: `${permalink}${cid}/`,
        postedAt: new Date(postedAt.getTime() + comments.length * 600_000), ...extra,
      });
    };

    if (!spec.opinion) {
      for (let i = 0; i < spec.comments; i++) add(pick(["Can't wait for this!", "Day one for me.", "Looks interesting.", "Hype."]), `fan_${ti}_${i}`, Math.floor(rand() * 400));
    } else {
      add("Please keep discussion civil. Spoiler tags are required outside this thread.", "AutoModerator", 1, { stickied: true, distinguished: "moderator" });
      for (let i = 0; i < spec.comments; i++) {
        const score = Math.floor(2 + 2800 * rand() ** 4);
        const author = `user_${createHash("md5").update(`${t.slug}${ti}${i}`).digest("hex").slice(0, 6)}`;
        if (rand() < 0.12) {
          add(pick(OFF_TOPIC[t.kind]), author, score);
          continue;
        }
        const s = pickSentiment(rand(), t.profile);
        const pr = t.profile.praised;
        const cr = t.profile.criticized;
        if (s === "positive") {
          const a = pick(pr);
          add(fill(pick(POSITIVE), t.kind, a, pick(pr.filter((x) => x !== a).concat(a)), ""), author, score);
        } else if (s === "negative") {
          const a = pick(cr);
          add(fill(pick(NEGATIVE), t.kind, a, pick(cr.filter((x) => x !== a).concat(a)), ""), author, score);
        } else {
          add(fill(pick(MIXED), t.kind, pick(pr), "", pick(cr)), author, score);
        }
      }
      // Noise the filter must remove.
      add("[deleted]", "[deleted]", 40);
      add("lol", "drive_by_commenter", 55);
      add(comments[1]?.body ?? "dup", "copy_paster", 3);
      add("I thought it was okay. Nothing special in my opinion honestly.", "lowscore_user", 0);
      if (ti === 0) add(SPOILER_POSITIVE, "spoiler_fan", 1900);
    }

    return {
      thread: {
        id: threadId, subreddit: spec.sub, title: spec.title, permalink, postedAt,
        score: Math.floor(500 + rand() * 9000), numComments: spec.opinion ? 400 + Math.floor(rand() * 3000) : 60 + Math.floor(rand() * 300),
        flair: spec.opinion ? "Discussion" : null,
      },
      comments,
    };
  });
}

export class FixtureRedditSource implements RedditSource {
  readonly name = "fixtures";
  readonly isSampleData = true;
  private readonly cache = new Map<string, Generated[]>();

  private forTitle(t: FixtureTitle) {
    if (!this.cache.has(t.slug)) this.cache.set(t.slug, generate(t));
    return this.cache.get(t.slug)!;
  }

  async searchThreads(subreddit: string, query: string): Promise<RedditThread[]> {
    const q = query.toLowerCase();
    return FIXTURE_TITLES.filter((t) => q.includes(t.name.toLowerCase()))
      .flatMap((t) => this.forTitle(t))
      .filter((g) => g.thread.subreddit.toLowerCase() === subreddit.toLowerCase())
      .map((g) => g.thread);
  }

  async fetchTopComments(thread: RedditThread, limit: number): Promise<RedditComment[]> {
    for (const t of FIXTURE_TITLES) {
      const g = this.forTitle(t).find((x) => x.thread.id === thread.id);
      if (g) return [...g.comments].sort((a, b) => b.score - a.score).slice(0, limit);
    }
    return [];
  }
}
