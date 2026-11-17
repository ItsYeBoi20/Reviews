import { z } from "zod";
import { HttpError, parseJsonText, withRetry, type JsonRequest, type LLMProvider } from "./types.ts";

export interface OpenAICompatibleOptions {
  baseUrl: string; // e.g. http://localhost:1234/v1 (LM Studio)
  apiKey?: string;
  model: string;
  fetchImpl?: typeof fetch;
}

/**
 * Any server that speaks the OpenAI chat-completions dialect: LM Studio,
 * Ollama, vLLM, Mistral, OpenRouter, Together, etc. Uses json_schema
 * structured output; local servers that don't support it still get the
 * schema in the prompt and the response is validated either way.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai-compatible";
  constructor(private readonly opts: OpenAICompatibleOptions) {
    if (!opts.baseUrl || !opts.model) throw new Error("LLM_BASE_URL and LLM_MODEL are required for LLM_PROVIDER=openai-compatible");
  }
  get model() {
    return this.opts.model;
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<T> {
    const jsonSchema = z.toJSONSchema(req.schema);
    const doFetch = this.opts.fetchImpl ?? fetch;
    return withRetry(async () => {
      const res = await doFetch(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.opts.model,
          max_tokens: req.maxTokens ?? 8000,
          messages: [
            { role: "system", content: `${req.system}\n\nRespond with JSON only, matching this JSON Schema:\n${JSON.stringify(jsonSchema)}` },
            { role: "user", content: req.user },
          ],
          response_format: { type: "json_schema", json_schema: { name: req.schemaName, schema: jsonSchema, strict: true } },
        }),
      });
      if (!res.ok) throw new HttpError(res.status, `LLM request failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return parseJsonText(json.choices?.[0]?.message?.content ?? "", req.schema);
    });
  }
}
