import { AnthropicProvider } from "./llm/anthropic.ts";
import { MindStudioProvider } from "./llm/mindstudio.ts";
import { OpenAICompatibleProvider } from "./llm/openai-compatible.ts";
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

export function createAnalyzer(env: Env = process.env): ConsensusAnalyzer {
  const provider = env.LLM_PROVIDER ?? "mock";
  switch (provider) {
    case "mock":
      return new MockConsensusAnalyzer();
    case "mindstudio":
      return new LLMConsensusAnalyzer(
        new MindStudioProvider({
          apiKey: env.MINDSTUDIO_API_KEY ?? "",
          appId: env.MINDSTUDIO_APP_ID ?? "",
          workflow: env.MINDSTUDIO_WORKFLOW || undefined,
          runUrl: env.MINDSTUDIO_RUN_URL || "https://api.mindstudio.ai/developer/v2/apps/run",
        }),
      );
    case "openai-compatible":
      return new LLMConsensusAnalyzer(
        new OpenAICompatibleProvider({ baseUrl: env.LLM_BASE_URL ?? "", apiKey: env.LLM_API_KEY, model: env.LLM_MODEL ?? "" }),
      );
    case "anthropic":
      return new LLMConsensusAnalyzer(
        new AnthropicProvider({
          model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
          apiKey: env.ANTHROPIC_API_KEY || undefined,
          effort: (env.ANTHROPIC_EFFORT as "low" | "medium" | "high" | undefined) || "low",
        }),
      );
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}" (expected mock | mindstudio | openai-compatible | anthropic)`);
  }
}
