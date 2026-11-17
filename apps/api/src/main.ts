import { createDb } from "@verdict/db";
import { buildServer } from "./server.ts";

const { db } = createDb();
const app = await buildServer({
  db,
  logger: true,
  cookieSecure: process.env.COOKIE_SECURE === "true",
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
});
await app.listen({ port: Number(process.env.API_PORT ?? 4000), host: "0.0.0.0" });
