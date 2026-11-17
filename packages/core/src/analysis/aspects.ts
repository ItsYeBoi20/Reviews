import type { MediaKind } from "@verdict/shared";

/**
 * Controlled aspect vocabulary. The classifier must pick from this list so
 * pros/cons can be counted across hundreds of comments; free text would
 * fragment ("visuals", "the visuals", "cinematography", "how it looks").
 */
export const ASPECTS: Record<MediaKind, Record<string, string>> = {
  movie: {
    story: "Story", writing: "Writing & dialogue", acting: "Performances", characters: "Characters",
    direction: "Direction", visuals: "Visuals & cinematography", effects: "Visual effects", music: "Score & soundtrack",
    sound: "Sound design", pacing: "Pacing", runtime: "Length", ending: "Ending", action: "Action",
    humor: "Humor", tone: "Tone", originality: "Originality", faithfulness: "Faithfulness to source",
    rewatchability: "Rewatch value",
  },
  tv: {
    story: "Story", writing: "Writing & dialogue", acting: "Performances", characters: "Characters",
    visuals: "Visuals & cinematography", music: "Score & soundtrack", pacing: "Pacing",
    season_arc: "Season arc", episode_quality: "Episode consistency", finale: "Finale", ending: "Ending",
    humor: "Humor", tone: "Tone", worldbuilding: "Worldbuilding", faithfulness: "Faithfulness to source",
    release_schedule: "Release schedule",
  },
  game: {
    gameplay: "Core gameplay", combat: "Combat", story: "Story", characters: "Characters",
    visuals: "Visuals & art direction", performance: "Technical performance", bugs: "Bugs & stability",
    difficulty: "Difficulty", level_design: "Level & world design", exploration: "Exploration",
    progression: "Progression & rewards", music: "Music & sound", length: "Length",
    price_value: "Price & value", multiplayer: "Multiplayer", controls: "Controls", monetization: "Monetization",
    replayability: "Replayability",
  },
};

export function aspectKeys(kind: MediaKind): [string, ...string[]] {
  return Object.keys(ASPECTS[kind]) as [string, ...string[]];
}

export function aspectLabel(kind: MediaKind, key: string): string {
  return ASPECTS[kind][key] ?? key.replace(/_/g, " ");
}
