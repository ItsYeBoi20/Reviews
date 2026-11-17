import type { FastifyInstance, FastifyReply } from "fastify";
import { eq, sql } from "drizzle-orm";
import { hashPassword, hashSessionToken, newSessionToken, verifyPassword } from "@verdict/core";
import { schema, type Db } from "@verdict/db";
import { loginInput, registerInput } from "@verdict/shared";
import { HttpError, noContent, parse, unauthorized } from "../http.ts";
import { toUserPublic } from "../mappers.ts";

export const SESSION_COOKIE = "verdict_session";
const SESSION_DAYS = 30;

export interface AuthOptions {
  db: Db;
  cookieSecure: boolean;
}

/** Resolves the session cookie into request.user on every request. */
export async function sessionHook(app: FastifyInstance, { db }: AuthOptions) {
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const rows = await db
      .select({ user: schema.users })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(sql`${schema.sessions.tokenHash} = ${hashSessionToken(token)} and ${schema.sessions.expiresAt} > now()`)
      .limit(1);
    req.user = rows[0] ? toUserPublic(rows[0].user) : null;
  });
}

export async function authRoutes(app: FastifyInstance, { db, cookieSecure }: AuthOptions) {
  async function startSession(reply: FastifyReply, userId: string) {
    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await db.insert(schema.sessions).values({ tokenHash, userId, expiresAt });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: cookieSecure, path: "/", expires: expiresAt,
    });
  }

  const authLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/auth/register", authLimit, async (req, reply) => {
    const input = parse(registerInput, req.body);
    const taken = await db.select({ id: schema.users.id }).from(schema.users)
      .where(sql`${schema.users.email} = ${input.email} or lower(${schema.users.username}) = lower(${input.username})`).limit(1);
    if (taken.length) throw new HttpError(409, "conflict", "email or username already in use");
    const [user] = await db.insert(schema.users).values({
      email: input.email, username: input.username, displayName: input.username,
      passwordHash: await hashPassword(input.password),
    }).returning();
    await startSession(reply, user!.id);
    return reply.code(201).send(toUserPublic(user!));
  });

  app.post("/auth/login", authLimit, async (req, reply) => {
    const input = parse(loginInput, req.body);
    const user = await db.query.users.findFirst({ where: eq(schema.users.email, input.email) });
    // Verify against a dummy hash when the user is missing so timing doesn't reveal which emails exist.
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, "invalid_credentials", "email or password is incorrect");
    await startSession(reply, user.id);
    return toUserPublic(user);
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashSessionToken(token)));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return noContent(reply);
  });

  app.get("/auth/me", async (req) => {
    if (!req.user) throw unauthorized();
    return req.user;
  });
}

const DUMMY_HASH = await hashPassword("timing-equalizer-not-a-real-password");
