import { AnthropicProvider } from "./llm/anthropic.ts";
import { MindStudioProvider } from "./llm/mindstudio.ts";
import { OpenAICompatibleProvider, type JsonMode } from "./llm/openai-compatible.ts";
import type { LLMProvider } from "./llm/types.ts";
import { LLMConsensusAnalyzer } from "./analysis/llm-analyzer.ts";
import { MockConsensusAnalyzer } from "./analysis/mock-analyzer.ts";
import type { ConsensusAnalyzer } from "./analysis/types.ts";
import { FixtureRedditSource } from "./fixtures/fixture-source.ts";
import { RedditApiSource } from "./reddit/api-source.ts";
import type { RedditSource } from "./reddit/types.ts";

type Env = Record<string, string | undefined>;

export function createRedditSource(env: Env = process.env): RedditSource {
  const kind = env.REDDIT_SOURCE ?? "fixtures";
  if (kind === "fixtures") return new FixtureRedditSource();
  if (kind === "api") {
    return new RedditApiSource({
      clientId: env.REDDIT_CLIENT_ID ?? "",
      clientSecret: env.REDDIT_CLIENT_SECRET ?? "",
      userAgent: env.REDDIT_USER_AGENT ?? "",
    });
  }
  throw new Error(`Unknown REDDIT_SOURCE "${kind}" (expected fixtures | api)`);
}

export const MITTWALD_BASE_URL = "https://llm.aihosting.mittwald.de/v1";
export const MITTWALD_DEFAULT_MODEL = "gpt-oss-120b";

function jsonMode(v: string | undefined): JsonMode | undefined {
  return v === "json_schema" || v === "json_object" || v === "prompt" ? v : undefined;
}

export function createAnalyzer(env: Env = process.env): ConsensusAnalyzer {
  const provider = env.LLM_PROVIDER ?? "mock";
  // Comments per labeling call and parallel calls; lower both if the provider rate-limits.
  const batchSize = Number(env.LLM_BATCH_SIZE ?? 40);
  const concurrency = Number(env.LLM_CONCURRENCY ?? 3);
  const analyzer = (llm: LLMProvider) => new LLMConsensusAnalyzer(llm, batchSize, concurrency);

  switch (provider) {
    case "mock":
      return new MockConsensusAnalyzer();
    case "mittwald":
      // mittwald AI Hosting (key created in mStudio): OpenAI-compatible chat completions.
      if (!env.MITTWALD_API_KEY) throw new Error("MITTWALD_API_KEY is required for LLM_PROVIDER=mittwald (create one in mStudio under AI Hosting)");
      return analyzer(
        new OpenAICompatibleProvider({
          name: "mittwald",
          baseUrl: env.MITTWALD_BASE_URL || MITTWALD_BASE_URL,
          apiKey: env.MITTWALD_API_KEY,
          model: env.MITTWALD_MODEL || MITTWALD_DEFAULT_MODEL,
          jsonMode: jsonMode(env.LLM_JSON_MODE),
          extraBody: env.LLM_REASONING_EFFORT ? { reasoning_effort: env.LLM_REASONING_EFFORT } : undefined,
        }),
      );
    case "mindstudio":
      return analyzer(
        new MindStudioProvider({
          apiKey: env.MINDSTUDIO_API_KEY ?? "",
          appId: env.MINDSTUDIO_APP_ID ?? "",
          workflow: env.MINDSTUDIO_WORKFLOW || undefined,
          runUrl: env.MINDSTUDIO_RUN_URL || "https://api.mindstudio.ai/developer/v2/apps/run",
        }),
      );
    case "openai-compatible":
      return analyzer(
        new OpenAICompatibleProvider({
          baseUrl: env.LLM_BASE_URL ?? "", apiKey: env.LLM_API_KEY, model: env.LLM_MODEL ?? "",
          jsonMode: jsonMode(env.LLM_JSON_MODE),
          extraBody: env.LLM_REASONING_EFFORT ? { reasoning_effort: env.LLM_REASONING_EFFORT } : undefined,
        }),
      );
    case "anthropic":
      return analyzer(
        new AnthropicProvider({
          model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
          apiKey: env.ANTHROPIC_API_KEY || undefined,
          effort: (env.ANTHROPIC_EFFORT as "low" | "medium" | "high" | undefined) || "low",
        }),
      );
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}" (expected mock | mittwald | mindstudio | openai-compatible | anthropic)`);
  }
}
