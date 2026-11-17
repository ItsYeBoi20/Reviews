import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LLMOutputError, withRetry, type JsonRequest, type LLMProvider } from "./types.ts";

export interface AnthropicOptions {
  model: string;
  apiKey?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

/**
 * Claude via the official SDK with structured outputs. Server-side refusal
 * fallbacks are enabled so a safety decline on a comment batch reroutes
 * instead of failing the whole title.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  constructor(private readonly opts: AnthropicOptions) {
    // The SDK resolves credentials itself (ANTHROPIC_API_KEY, auth token, or `ant auth login` profile).
    this.client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : new Anthropic();
  }
  get model() {
    return this.opts.model;
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<T> {
    return withRetry(async () => {
      const response = await this.client.beta.messages.parse({
        model: this.opts.model,
        max_tokens: req.maxTokens ?? 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        output_config: { effort: this.opts.effort ?? "low", format: betaZodOutputFormat(req.schema) },
      });
      if (response.stop_reason === "refusal") {
        throw new LLMOutputError(`model declined: ${response.stop_details?.category ?? "unspecified"}`);
      }
      if (response.stop_reason === "max_tokens") throw new LLMOutputError("model output hit max_tokens");
      if (!response.parsed_output) throw new LLMOutputError("model returned no parseable output");
      return response.parsed_output as T;
    }, 1, (err) => err instanceof LLMOutputError && !err.message.startsWith("model declined")); // the SDK already retries 429/5xx
  }
}
