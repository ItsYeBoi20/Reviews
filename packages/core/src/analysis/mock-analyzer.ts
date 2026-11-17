import type { MediaKind, Sentiment } from "@verdict/shared";
import type { FilteredComment } from "../reddit/filter.ts";
import { aspectLabel } from "./aspects.ts";
import type { CommentLabel, ConsensusStats, WeightedComment } from "./scoring.ts";
import type { ConsensusAnalyzer, Synthesis, TitleContext } from "./types.ts";

/**
 * Deterministic, offline stand-in for the LLM analyzer. Lexicon-based, so it
 * misses sarcasm and nuance; it exists so the full pipeline, UI and tests run
 * without network access or API keys. Never use it for real data.
 */
const POSITIVE = /\b(love[ds]?|loving|masterpiece|incredible|amazing|fantastic|great|brilliant|excellent|phenomenal|gorgeous|beautiful|stunning|enjoy(ed)?|fun|best|perfect|superb|outstanding|nailed|riveting|gripping|hooked|addictive|satisfying|tight|polished|smooth|haunting)\b/gi;
const NEGATIVE = /\b(boring|disappoint(ing|ed|ment)|terrible|awful|mess(y)?|worst|bad|hated?|waste|bland|tedious|dull|overrated|forgettable|broken|clunky|frustrating|drag(ged|s)?|bloated|predictable|weak|lazy|janky|unplayable|grindy|slog|rushed|cheap|confusing|stutter(s|ing)?)\b/gi;
const SPOILER = /\b(dies|died|death of|killed|the twist|ending (where|when)|turns out|final boss|post[- ]credits?|in the end)\b/i;

const KEYWORDS: Record<string, RegExp> = {
  story: /\b(story|plot|narrative|storyline)\b/i,
  writing: /\b(writing|script|dialogue|written)\b/i,
  acting: /\b(acting|performances?|cast|actor|actress)\b/i,
  characters: /\b(characters?|protagonist|villain)\b/i,
  direction: /\b(direct(ion|ed|or))\b/i,
  visuals: /\b(visuals?|cinematography|looks|gorgeous|art style|art direction|graphics|shot|lighting)\b/i,
  effects: /\b(cgi|vfx|effects)\b/i,
  music: /\b(score|soundtrack|music)\b/i,
  sound: /\b(sound design|audio)\b/i,
  pacing: /\b(pacing|paced|drags?|dragged|slow)\b/i,
  runtime: /\b(runtime|too long|length)\b/i,
  length: /\b(hours long|too short|too long|length|runtime)\b/i,
  ending: /\b(ending|ended|last act|third act)\b/i,
  finale: /\b(finale)\b/i,
  action: /\b(action|fight scenes?|set ?pieces?)\b/i,
  humor: /\b(funny|humou?r|jokes?|hilarious)\b/i,
  tone: /\b(tone|tonal(ly)?|atmosphere|mood)\b/i,
  originality: /\b(original(ity)?|fresh|derivative)\b/i,
  worldbuilding: /\b(world ?building|lore)\b/i,
  season_arc: /\b(season arc|this season|the season)\b/i,
  episode_quality: /\b(episodes?|filler)\b/i,
  gameplay: /\b(gameplay|game ?loop|mechanics)\b/i,
  combat: /\b(combat|fights?|boss(es)?)\b/i,
  performance: /\b(fps|frame ?rate|performance|stutter(s|ing)?|optimi[sz]ation)\b/i,
  bugs: /\b(bugs?|buggy|crash(es|ed)?|glitch(es|y)?)\b/i,
  difficulty: /\b(difficulty|too hard|too easy|challenging)\b/i,
  level_design: /\b(level design|levels|map design|open world)\b/i,
  exploration: /\b(explor(e|ing|ation))\b/i,
  progression: /\b(progression|grind(y|ing)?|loot|upgrades?)\b/i,
  price_value: /\b(price|\$\d+|worth (it|the money)|full price)\b/i,
  multiplayer: /\b(multiplayer|co-?op|pvp|online)\b/i,
  controls: /\b(controls?|input lag)\b/i,
  monetization: /\b(microtransactions?|mtx|battle pass|monetization)\b/i,
  replayability: /\b(replay(ability|able)?|new game\+)\b/i,
  rewatchability: /\b(rewatch(ing|able)?)\b/i,
  faithfulness: /\b(source material|the books?|the novel|the comics?|adaptation)\b/i,
  release_schedule: /\b(weekly release|binge|release schedule)\b/i,
};

const VALID: Record<MediaKind, Set<string>> = {
  movie: new Set(["story", "writing", "acting", "characters", "direction", "visuals", "effects", "music", "sound", "pacing", "runtime", "ending", "action", "humor", "tone", "originality", "faithfulness", "rewatchability"]),
  tv: new Set(["story", "writing", "acting", "characters", "visuals", "music", "pacing", "season_arc", "episode_quality", "finale", "ending", "humor", "tone", "worldbuilding", "faithfulness", "release_schedule"]),
  game: new Set(["gameplay", "combat", "story", "characters", "visuals", "performance", "bugs", "difficulty", "level_design", "exploration", "progression", "music", "length", "price_value", "multiplayer", "controls", "monetization", "replayability"]),
};

function count(re: RegExp, s: string): number {
  return s.match(re)?.length ?? 0;
}

export function heuristicLabel(kind: MediaKind, c: Pick<FilteredComment, "id" | "body">): CommentLabel {
  const sentences = c.body.split(/(?<=[.!?])\s+|\s+(?:but|however|although|though)\s+/i);
  let pos = 0, neg = 0;
  const praised = new Set<string>();
  const criticized = new Set<string>();
  for (const s of sentences) {
    const p = count(POSITIVE, s);
    const n = count(NEGATIVE, s);
    pos += p;
    neg += n;
    if (p === n) continue;
    for (const [aspect, re] of Object.entries(KEYWORDS)) {
      if (!VALID[kind].has(aspect) || !re.test(s)) continue;
      (p > n ? praised : criticized).add(aspect);
    }
  }
  let sentiment: Sentiment;
  if (pos === 0 && neg === 0) sentiment = "off_topic";
  else if (pos > 0 && neg > 0 && Math.min(pos, neg) / Math.max(pos, neg) >= 0.5) sentiment = "mixed";
  else sentiment = pos > neg ? "positive" : "negative";
  return { id: c.id, sentiment, praised: [...praised], criticized: [...criticized], spoiler: SPOILER.test(c.body) };
}

export class MockConsensusAnalyzer implements ConsensusAnalyzer {
  readonly provider = "mock";
  readonly model = "lexicon-v1";
  readonly promptVersion = "mock-1";

  async classify(title: TitleContext, comments: FilteredComment[]): Promise<CommentLabel[]> {
    return comments.map((c) => heuristicLabel(title.kind, c));
  }

  async synthesize(title: TitleContext, stats: ConsensusStats): Promise<Synthesis> {
    const list = (xs: { aspect: string }[]) => xs.slice(0, 2).map((x) => aspectLabel(title.kind, x.aspect).toLowerCase());
    const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "");
    const pros = list(stats.pros);
    const cons = list(stats.cons);
    const tone: Record<string, string> = {
      "Widely loved": "overwhelmingly enthusiastic",
      "Well liked": "largely positive",
      "Mostly positive": "leaning positive",
      Mixed: "mixed",
      Divisive: "sharply split",
      "Mostly negative": "leaning negative",
      Panned: "largely negative",
    };
    const parts = [`Reddit discussion of ${title.name} is ${tone[stats.label] ?? "limited"}.`];
    if (pros.length) parts.push(`Commenters most often praise the ${join(pros)}.`);
    if (cons.length) parts.push(`The most common complaints concern the ${join(cons)}.`);
    return {
      summary: parts.join(" "),
      pros: Object.fromEntries(stats.pros.map((p) => [p.aspect, `Frequently praised: ${aspectLabel(title.kind, p.aspect).toLowerCase()}`])),
      cons: Object.fromEntries(stats.cons.map((p) => [p.aspect, `Frequently criticized: ${aspectLabel(title.kind, p.aspect).toLowerCase()}`])),
    };
  }
}
