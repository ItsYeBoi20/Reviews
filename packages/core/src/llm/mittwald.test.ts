import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MITTWALD_BASE_URL, MITTWALD_DEFAULT_MODEL, createAnalyzer } from "../config.ts";
import { OpenAICompatibleProvider } from "./openai-compatible.ts";

const schema = z.object({ answer: z.number() });
const ok = (content: string, finish = "stop") =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status: 200 });
const bodyOf = (call: unknown) => JSON.parse(String((call as [string, RequestInit])[1].body));

describe("mittwald provider preset", () => {
  it("requires an mStudio API key", () => {
    expect(() => createAnalyzer({ LLM_PROVIDER: "mittwald" })).toThrow(/MITTWALD_API_KEY/);
  });

  it("targets mittwald AI Hosting with gpt-oss-120b by default", () => {
    const a = createAnalyzer({ LLM_PROVIDER: "mittwald", MITTWALD_API_KEY: "k" });
    expect(a.provider).toBe("mittwald");
    expect(a.model).toBe(MITTWALD_DEFAULT_MODEL);
    expect(MITTWALD_BASE_URL).toBe("https://llm.aihosting.mittwald.de/v1");
    expect(createAnalyzer({ LLM_PROVIDER: "mittwald", MITTWALD_API_KEY: "k", MITTWALD_MODEL: "Ministral-3-14B-Instruct-2512" }).model)
      .toBe("Ministral-3-14B-Instruct-2512");
  });

  it("sends bearer auth, the model, and reasoning effort when configured", async () => {
    const fetchImpl = vi.fn(async () => ok('{"answer": 3}'));
    const p = new OpenAICompatibleProvider({
      name: "mittwald", baseUrl: MITTWALD_BASE_URL, apiKey: "secret", model: "gpt-oss-120b",
      extraBody: { reasoning_effort: "low" }, fetchImpl,
    });
    expect(await p.generateJson({ system: "s", user: "u", schema, schemaName: "x" })).toEqual({ answer: 3 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://llm.aihosting.mittwald.de/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(bodyOf(fetchImpl.mock.calls[0])).toMatchObject({ model: "gpt-oss-120b", reasoning_effort: "low" });
  });
});

describe("JSON mode fallback", () => {
  it("steps down from json_schema to json_object when the server rejects response_format, and remembers it", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"response_format type json_schema is not supported"}', { status: 400 }))
      .mockResolvedValueOnce(ok('{"answer": 1}'))
      .mockResolvedValueOnce(ok('{"answer": 2}'));
    const p = new OpenAICompatibleProvider({ baseUrl: "http://x/v1", model: "m", fetchImpl });
    expect(await p.generateJson({ system: "s", user: "u", schema, schemaName: "x" })).toEqual({ answer: 1 });
    expect(p.currentJsonMode).toBe("json_object");
    await p.generateJson({ system: "s", user: "u", schema, schemaName: "x" });
    expect(fetchImpl.mock.calls.map((c) => bodyOf(c).response_format?.type)).toEqual(["json_schema", "json_object", "json_object"]);
  });

  it("does not mask unrelated 400s", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":"model not found"}', { status: 400 }));
    const p = new OpenAICompatibleProvider({ baseUrl: "http://x/v1", model: "nope", fetchImpl });
    await expect(p.generateJson({ system: "s", user: "u", schema, schemaName: "x" })).rejects.toThrow(/model not found/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(p.currentJsonMode).toBe("json_schema");
  });

  it("treats a truncated reasoning-model answer as retryable", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok("", "length")).mockResolvedValueOnce(ok('{"answer": 5}'));
    const p = new OpenAICompatibleProvider({ baseUrl: "http://x/v1", model: "m", fetchImpl });
    expect(await p.generateJson({ system: "s", user: "u", schema, schemaName: "x" })).toEqual({ answer: 5 });
  });
});
