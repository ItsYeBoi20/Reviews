import { z } from "zod";
import { HttpError, LLMOutputError, parseJsonText, withRetry, type JsonRequest, type LLMProvider } from "./types.ts";

/**
 * How the response is constrained to JSON:
 * - json_schema: server-side constrained decoding against the schema (best)
 * - json_object: server guarantees valid JSON, schema only in the prompt
 * - prompt: schema only in the prompt
 * Output is validated with zod in every mode.
 */
export type JsonMode = "json_schema" | "json_object" | "prompt";

export interface OpenAICompatibleOptions {
  baseUrl: string; // e.g. https://llm.aihosting.mittwald.de/v1 or http://localhost:1234/v1 (LM Studio)
  apiKey?: string;
  model: string;
  /** Label stored on consensus snapshots, e.g. "mittwald". */
  name?: string;
  jsonMode?: JsonMode;
  /** Extra request fields the server understands, e.g. { reasoning_effort: "low" } for gpt-oss. */
  extraBody?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

const DOWNGRADE: Record<JsonMode, JsonMode | null> = { json_schema: "json_object", json_object: "prompt", prompt: null };
const FORMAT_ERROR = /response_format|json_schema|json_object|structured|guided/i;

/**
 * Any server that speaks the OpenAI chat-completions dialect: mittwald AI
 * Hosting, LM Studio, Ollama, vLLM, Mistral, OpenRouter, etc.
 *
 * Starts with json_schema structured output. If the server rejects the
 * response_format with a 400, it steps down to json_object, then to
 * prompt-only, and remembers the working mode for later calls.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private jsonMode: JsonMode;

  constructor(private readonly opts: OpenAICompatibleOptions) {
    if (!opts.baseUrl || !opts.model) throw new Error("LLM_BASE_URL and LLM_MODEL are required for LLM_PROVIDER=openai-compatible");
    this.name = opts.name ?? "openai-compatible";
    this.jsonMode = opts.jsonMode ?? "json_schema";
  }
  get model() {
    return this.opts.model;
  }
  get currentJsonMode() {
    return this.jsonMode;
  }

  private request(req: JsonRequest<unknown>, jsonSchema: unknown, mode: JsonMode) {
    const doFetch = this.opts.fetchImpl ?? fetch;
    const responseFormat =
      mode === "json_schema" ? { response_format: { type: "json_schema", json_schema: { name: req.schemaName, schema: jsonSchema, strict: true } } }
      : mode === "json_object" ? { response_format: { type: "json_object" } }
      : {};
    return doFetch(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        ...this.opts.extraBody,
        model: this.opts.model,
        max_tokens: req.maxTokens ?? 8000,
        messages: [
          { role: "system", content: `${req.system}\n\nRespond with JSON only, matching this JSON Schema:\n${JSON.stringify(jsonSchema)}` },
          { role: "user", content: req.user },
        ],
        ...responseFormat,
      }),
    });
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<T> {
    const jsonSchema = z.toJSONSchema(req.schema);
    return withRetry(async () => {
      for (;;) {
        const res = await this.request(req as JsonRequest<unknown>, jsonSchema, this.jsonMode);
        if (!res.ok) {
          const text = (await res.text()).slice(0, 500);
          const next = DOWNGRADE[this.jsonMode];
          if (res.status === 400 && next && FORMAT_ERROR.test(text)) {
            this.jsonMode = next;
            continue;
          }
          throw new HttpError(res.status, `LLM request failed: ${res.status} ${text.slice(0, 300)}`);
        }
        const json = (await res.json()) as { choices?: { message?: { content?: string | null }; finish_reason?: string }[] };
        const choice = json.choices?.[0];
        if (choice?.finish_reason === "length") throw new LLMOutputError("model output hit max_tokens");
        return parseJsonText(choice?.message?.content ?? "", req.schema);
      }
    });
  }
}
