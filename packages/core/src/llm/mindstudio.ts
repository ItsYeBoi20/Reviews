import { z } from "zod";
import { HttpError, LLMOutputError, parseJsonText, withRetry, type JsonRequest, type LLMProvider } from "./types.ts";

export interface MindStudioOptions {
  apiKey: string;
  appId: string;
  workflow?: string;
  runUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Runs a MindStudio agent through its developer API.
 *
 * MindStudio executes agents you build in its editor rather than exposing a
 * raw completion endpoint, so the agent must be set up to accept three launch
 * variables (system, prompt, json_schema), pass them to a Generate Text block,
 * and return the model's JSON as its output. docs/PLAN.md has the setup steps.
 *
 * Endpoint path and request/response shape are taken from MindStudio's public
 * API reference; verify them against your workspace before relying on this.
 */
export class MindStudioProvider implements LLMProvider {
  readonly name = "mindstudio";
  constructor(private readonly opts: MindStudioOptions) {
    if (!opts.apiKey || !opts.appId) throw new Error("MINDSTUDIO_API_KEY and MINDSTUDIO_APP_ID are required for LLM_PROVIDER=mindstudio");
  }
  get model() {
    return `mindstudio:${this.opts.appId}${this.opts.workflow ? `/${this.opts.workflow}` : ""}`;
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<T> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    return withRetry(async () => {
      const res = await doFetch(this.opts.runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.opts.apiKey}` },
        body: JSON.stringify({
          appId: this.opts.appId,
          ...(this.opts.workflow ? { workflow: this.opts.workflow } : {}),
          variables: {
            system: req.system,
            prompt: req.user,
            json_schema: JSON.stringify(z.toJSONSchema(req.schema)),
          },
        }),
      });
      if (!res.ok) throw new HttpError(res.status, `MindStudio request failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { result?: unknown; output?: unknown };
      const result = json.result ?? json.output;
      if (result == null) throw new LLMOutputError("MindStudio response had no result");
      return typeof result === "string" ? parseJsonText(result, req.schema) : parseJsonText(JSON.stringify(result), req.schema);
    });
  }
}
