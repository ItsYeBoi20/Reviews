import type { LLMProvider } from "../llm/types.ts";
import type { FilteredComment } from "../reddit/filter.ts";
import { PROMPT_VERSION, classifySchema, classifySystem, classifyUser, synthesizeSchema, synthesizeSystem, synthesizeUser } from "./prompts.ts";
import type { CommentLabel, ConsensusStats, WeightedComment } from "./scoring.ts";
import type { ConsensusAnalyzer, Synthesis, TitleContext } from "./types.ts";

export class LLMConsensusAnalyzer implements ConsensusAnalyzer {
  readonly promptVersion = PROMPT_VERSION;
  constructor(private readonly llm: LLMProvider, private readonly batchSize = 40, private readonly concurrency = 3) {}

  get provider() {
    return this.llm.name;
  }
  get model() {
    return this.llm.model;
  }

  async classify(title: TitleContext, comments: FilteredComment[]): Promise<CommentLabel[]> {
    const batches: FilteredComment[][] = [];
    for (let i = 0; i < comments.length; i += this.batchSize) batches.push(comments.slice(i, i + this.batchSize));

    const schema = classifySchema(title.kind);
    const system = classifySystem(title);
    const results: CommentLabel[][] = new Array(batches.length);
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const idx = next++;
        const batch = batches[idx]!;
        const out = await this.llm.generateJson({
          system,
          user: classifyUser(batch),
          schema,
          schemaName: "comment_labels",
          maxTokens: 8000,
        });
        const valid = new Set(batch.map((c) => c.id));
        // Drop labels for ids the model invented; missing ids are simply unlabeled.
        results[idx] = out.labels.filter((l) => valid.has(l.id));
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, batches.length) }, worker));
    return results.flat();
  }

  async synthesize(title: TitleContext, stats: ConsensusStats, sample: WeightedComment[]): Promise<Synthesis> {
    const out = await this.llm.generateJson({
      system: synthesizeSystem(title),
      user: synthesizeUser(title, stats, sample),
      schema: synthesizeSchema(title.kind),
      schemaName: "consensus_summary",
      maxTokens: 4000,
    });
    return {
      summary: out.summary.trim(),
      pros: Object.fromEntries(out.pros.map((p) => [p.aspect, p.point.trim()])),
      cons: Object.fromEntries(out.cons.map((p) => [p.aspect, p.point.trim()])),
    };
  }
}
