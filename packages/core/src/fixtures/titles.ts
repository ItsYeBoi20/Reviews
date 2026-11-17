import type { MediaKind } from "@verdict/shared";

/**
 * Fictional titles used for local development. They are deliberately not
 * real works: the Reddit threads generated for them are synthetic, and we
 * never want made-up "Reddit consensus" attached to a real film or game.
 */
export interface FixtureTitle {
  slug: string;
  kind: MediaKind;
  name: string;
  year: number;
  releaseDate: string;
  synopsis: string;
  genres: string[];
  platforms?: string[];
  creators: string[];
  runtimeMinutes?: number;
  popularity: number;
  subreddits?: string[];
  profile: { positive: number; mixed: number; negative: number; praised: string[]; criticized: string[] };
}

export const FIXTURE_TITLES: FixtureTitle[] = [
  {
    slug: "glass-harbor-2026", kind: "movie", name: "Glass Harbor", year: 2026, releaseDate: "2026-09-12",
    synopsis: "A harbor pilot in a fading port town uncovers a smuggling ring that reaches into her own family.",
    genres: ["Drama", "Thriller"], creators: ["Ines Valcourt"], runtimeMinutes: 128, popularity: 88,
    profile: { positive: 0.7, mixed: 0.18, negative: 0.12, praised: ["acting", "visuals", "music"], criticized: ["pacing", "ending"] },
  },
  {
    slug: "the-long-static-2025", kind: "movie", name: "The Long Static", year: 2025, releaseDate: "2025-10-24",
    synopsis: "A radio astronomer begins receiving a signal that sounds exactly like her own voice.",
    genres: ["Sci-Fi", "Horror"], creators: ["Mateo Riordan"], runtimeMinutes: 117, popularity: 64,
    profile: { positive: 0.44, mixed: 0.14, negative: 0.42, praised: ["visuals", "sound", "tone"], criticized: ["story", "ending", "pacing"] },
  },
  {
    slug: "paper-kingdoms-2026", kind: "movie", name: "Paper Kingdoms", year: 2026, releaseDate: "2026-06-19",
    synopsis: "Two origami soldiers from rival desk drawers team up to cross a very large office.",
    genres: ["Animation", "Adventure", "Comedy"], creators: ["Hana Okafor"], runtimeMinutes: 96, popularity: 92,
    profile: { positive: 0.86, mixed: 0.09, negative: 0.05, praised: ["visuals", "humor", "music", "characters"], criticized: ["runtime"] },
  },
  {
    slug: "ironclad-summer-2025", kind: "movie", name: "Ironclad Summer", year: 2025, releaseDate: "2025-07-04",
    synopsis: "A decommissioned battleship crew is called back for one last impossible mission.",
    genres: ["Action"], creators: ["Dale Brennick"], runtimeMinutes: 154, popularity: 71,
    profile: { positive: 0.22, mixed: 0.2, negative: 0.58, praised: ["action", "effects"], criticized: ["writing", "characters", "runtime"] },
  },
  {
    slug: "northbound-2025", kind: "tv", name: "Northbound", year: 2025, releaseDate: "2025-11-02",
    synopsis: "A transit detective works a string of disappearances along a night train line.",
    genres: ["Crime", "Drama"], creators: ["Priya Lund", "Owen Tsai"], popularity: 80,
    profile: { positive: 0.68, mixed: 0.2, negative: 0.12, praised: ["acting", "writing", "tone"], criticized: ["episode_quality", "finale"] },
  },
  {
    slug: "saltwater-saints-2026", kind: "tv", name: "Saltwater Saints", year: 2026, releaseDate: "2026-11-06",
    synopsis: "A failing seaside parish hires a former stand-up comic as its new vicar.",
    genres: ["Comedy"], creators: ["Bea Halloran"], popularity: 75,
    profile: { positive: 0.6, mixed: 0.22, negative: 0.18, praised: ["humor", "characters"], criticized: ["season_arc"] },
  },
  {
    slug: "the-quiet-hours-2024", kind: "tv", name: "The Quiet Hours", year: 2024, releaseDate: "2024-03-15",
    synopsis: "An anthology of stories set in the hour after a city-wide blackout.",
    genres: ["Sci-Fi", "Anthology"], creators: ["Lucas Ferreira"], popularity: 52,
    profile: { positive: 0.4, mixed: 0.3, negative: 0.3, praised: ["worldbuilding", "visuals"], criticized: ["episode_quality", "pacing"] },
  },
  {
    slug: "hollow-lantern-2026", kind: "game", name: "Hollow Lantern", year: 2026, releaseDate: "2026-02-27",
    synopsis: "A hand-drawn action platformer about a lamplighter descending into a drowned city.",
    genres: ["Metroidvania", "Action"], platforms: ["PC", "PS5", "Switch 2"], creators: ["Moth & Wick"], popularity: 90,
    subreddits: ["HollowLantern"],
    profile: { positive: 0.84, mixed: 0.1, negative: 0.06, praised: ["combat", "level_design", "music", "exploration"], criticized: ["difficulty"] },
  },
  {
    slug: "starfall-tactics-2025", kind: "game", name: "Starfall Tactics", year: 2025, releaseDate: "2025-09-09",
    synopsis: "Turn-based fleet tactics with a branching campaign and permanent ship loss.",
    genres: ["Strategy", "Tactics"], platforms: ["PC"], creators: ["Northlight Forge"], popularity: 60,
    profile: { positive: 0.58, mixed: 0.24, negative: 0.18, praised: ["gameplay", "replayability"], criticized: ["performance", "bugs", "price_value"] },
  },
  {
    slug: "neon-drift-online-2026", kind: "game", name: "Neon Drift Online", year: 2026, releaseDate: "2026-04-14",
    synopsis: "A free-to-start arcade racer set in a perpetually rain-soaked megacity.",
    genres: ["Racing", "Multiplayer"], platforms: ["PC", "PS5", "Xbox Series X|S"], creators: ["Velocity Unbound"], popularity: 58,
    profile: { positive: 0.14, mixed: 0.16, negative: 0.7, praised: ["visuals"], criticized: ["monetization", "bugs", "multiplayer", "price_value"] },
  },
];
