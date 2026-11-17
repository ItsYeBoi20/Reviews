import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MindStudioProvider } from "./mindstudio.ts";
import { OpenAICompatibleProvider } from "./openai-compatible.ts";
import { RedditApiSource } from "../reddit/api-source.ts";

const schema = z.object({ answer: z.number() });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("OpenAICompatibleProvider", () => {
  it("sends a json_schema request and parses fenced JSON", async () => {
    const fetchImpl = vi.fn(async () => json({ choices: [{ message: { content: '```json\n{"answer": 42}\n```' } }] }));
    const p = new OpenAICompatibleProvider({ baseUrl: "http://localhost:1234/v1/", model: "local-model", fetchImpl });
    expect(await p.generateJson({ system: "s", user: "u", schema, schemaName: "x" })).toEqual({ answer: 42 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:1234/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.response_format.type).toBe("json_schema");
    expect(body.model).toBe("local-model");
  });
  it("retries when the model returns invalid JSON, and fails fast on 4xx", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ choices: [{ message: { content: "not json" } }] }))
      .mockResolvedValueOnce(json({ choices: [{ message: { content: '{"answer": 1}' } }] }));
    const p = new OpenAICompatibleProvider({ baseUrl: "http://x/v1", model: "m", fetchImpl });
    expect(await p.generateJson({ system: "s", user: "u", schema, schemaName: "x" })).toEqual({ answer: 1 });

    const bad = vi.fn(async () => json({ error: "bad" }, 400));
    const p2 = new OpenAICompatibleProvider({ baseUrl: "http://x/v1", model: "m", fetchImpl: bad });
    await expect(p2.generateJson({ system: "s", user: "u", schema, schemaName: "x" })).rejects.toThrow(/400/);
    expect(bad).toHaveBeenCalledTimes(1);
  });
});

describe("MindStudioProvider", () => {
  it("passes prompt as launch variables and parses a string result", async () => {
    const fetchImpl = vi.fn(async () => json({ result: '{"answer": 7}' }));
    const p = new MindStudioProvider({ apiKey: "k", appId: "app", runUrl: "https://ms/run", fetchImpl });
    expect(await p.generateJson({ system: "sys", user: "usr", schema, schemaName: "x" })).toEqual({ answer: 7 });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ appId: "app", variables: { system: "sys", prompt: "usr" } });
  });
});

describe("RedditApiSource", () => {
  it("authenticates once and maps search results", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("access_token")) return json({ access_token: "tok", expires_in: 3600 });
      return json({ kind: "Listing", data: { after: null, children: [{ kind: "t3", data: {
        name: "t3_abc", subreddit: "movies", title: "Official Discussion - X", permalink: "/r/movies/comments/abc/x/",
        score: 10, num_comments: 500, created_utc: 1_760_000_000, link_flair_text: "Discussion",
      } }] } }, 200, { "x-ratelimit-remaining": "99", "x-ratelimit-reset": "60" });
    });
    const r = new RedditApiSource({ clientId: "id", clientSecret: "secret", userAgent: "web:test:1.0 (by /u/tester)", fetchImpl: fetchImpl as typeof fetch });
    const threads = await r.searchThreads("movies", 'title:"X"', 10);
    await r.searchThreads("flicks", 'title:"X"', 10);
    expect(threads[0]).toMatchObject({ id: "t3_abc", numComments: 500, permalink: "https://www.reddit.com/r/movies/comments/abc/x/" });
    expect(fetchImpl.mock.calls.filter(([u]) => String(u).includes("access_token"))).toHaveLength(1);
  });
});
