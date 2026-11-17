import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { UserPublic } from "@verdict/shared";

export class HttpError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
  }
}

export const notFound = (what = "resource") => new HttpError(404, "not_found", `${what} not found`);
export const unauthorized = () => new HttpError(401, "unauthorized", "sign in required");
export const forbidden = (msg = "not allowed") => new HttpError(403, "forbidden", msg);

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const res = schema.safeParse(value);
  if (!res.success) {
    const err = new HttpError(400, "validation_error", res.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    (err as HttpError & { details: unknown }).details = z.flattenError(res.error);
    throw err;
  }
  return res.data;
}

export function requireUser(req: FastifyRequest): UserPublic {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireAdmin(req: FastifyRequest): UserPublic {
  const user = requireUser(req);
  if (user.role !== "admin") throw forbidden("admin only");
  return user;
}

export function noContent(reply: FastifyReply) {
  return reply.code(204).send();
}

declare module "fastify" {
  interface FastifyRequest {
    user: UserPublic | null;
  }
}
