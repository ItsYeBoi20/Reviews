import type { MediaKind } from "@verdict/shared";
import type { FilteredComment } from "../reddit/filter.ts";
import type { CommentLabel, ConsensusStats, WeightedComment } from "./scoring.ts";

export interface TitleContext {
  name: string;
  year: number | null;
  kind: MediaKind;
}

export interface Synthesis {
  summary: string;
  /** phrasing per aspect key, e.g. { visuals: "Stunning desert photography..." } */
  pros: Record<string, string>;
  cons: Record<string, string>;
}

/**
 * Two calls per title: label every comment (batched), then write the summary
 * from code-computed stats. The score itself is never asked of the model.
 */
export interface ConsensusAnalyzer {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  classify(title: TitleContext, comments: FilteredComment[]): Promise<CommentLabel[]>;
  synthesize(title: TitleContext, stats: ConsensusStats, sample: WeightedComment[]): Promise<Synthesis>;
}
