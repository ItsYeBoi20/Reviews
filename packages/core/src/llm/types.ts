import type { z } from "zod";

export interface JsonRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens?: number;
}

/**
 * The only thing the consensus pipeline needs from a model: "given these
 * instructions, return JSON matching this schema". Keeping the surface this
 * small is what makes the provider swappable.
 */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generateJson<T>(req: JsonRequest<T>): Promise<T>;
}

export class LLMOutputError extends Error {
  constructor(message: string, readonly raw?: string) {
    super(message);
  }
}

/** Parses model text that should be JSON, tolerating ```json fences. */
export function parseJsonText<T>(text: string, schema: z.ZodType<T>): T {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(stripped);
  } catch {
    throw new LLMOutputError("model did not return valid JSON", text.slice(0, 500));
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new LLMOutputError(`model JSON failed validation: ${parsed.error.message}`, text.slice(0, 500));
  return parsed.data;
}

function defaultRetryable(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  return err instanceof LLMOutputError || status === undefined || status === 429 || status >= 500;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  retries = 2,
  isRetryable: (err: unknown) => boolean = defaultRetryable,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
