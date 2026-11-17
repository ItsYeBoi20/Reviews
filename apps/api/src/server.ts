import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { Db } from "@verdict/db";
import { HttpError } from "./http.ts";
import { authRoutes, sessionHook } from "./routes/auth.ts";
import { reviewRoutes } from "./routes/reviews.ts";
import { titleRoutes } from "./routes/titles.ts";
import { userRoutes } from "./routes/users.ts";

export interface ServerOptions {
  db: Db;
  cookieSecure?: boolean;
  /** Origins allowed to send state-changing requests (CSRF guard). */
  allowedOrigins?: string[];
  logger?: boolean;
  rateLimit?: boolean;
}

export async function buildServer(opts: ServerOptions) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 64 * 1024 });
  const allowed = new Set(opts.allowedOrigins ?? []);

  await app.register(cookie);
  await app.register(rateLimit, {
    global: true, max: 300, timeWindow: "1 minute",
    enableDraftSpec: true,
    keyGenerator: (req) => req.user?.id ?? req.ip,
    ...(opts.rateLimit === false ? { allowList: () => true } : {}),
  });

  // CSRF: SameSite=Lax cookies already block cross-site POSTs in modern browsers;
  // this rejects state-changing requests from foreign origins as a second layer.
  app.addHook("onRequest", async (req) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    const origin = req.headers.origin;
    if (origin && allowed.size && !allowed.has(origin)) throw new HttpError(403, "bad_origin", "cross-origin request rejected");
  });

  await sessionHook(app, { db: opts.db, cookieSecure: !!opts.cookieSecure });

  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: (err as { details?: unknown }).details });
    }
    if (err.statusCode === 429) return reply.code(429).send({ error: "rate_limited", message: err.message });
    if (err.validation || err.statusCode === 400 || err.statusCode === 415) {
      return reply.code(err.statusCode ?? 400).send({ error: "bad_request", message: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: "internal", message: "something went wrong" });
  });

  app.get("/health", async () => ({ ok: true }));
  await app.register(authRoutes, { db: opts.db, cookieSecure: !!opts.cookieSecure });
  await app.register(titleRoutes, { db: opts.db });
  await app.register(reviewRoutes, { db: opts.db });
  await app.register(userRoutes, { db: opts.db });
  return app;
}
