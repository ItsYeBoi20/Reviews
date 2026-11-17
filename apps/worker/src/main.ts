import { PgBoss } from "pg-boss";
import { createDb } from "@verdict/db";
import { registerJobs } from "./jobs.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const { db, pool } = createDb(url);
const boss = new PgBoss(url);
boss.on("error", (err) => console.error("pg-boss error", err));

await boss.start();
await registerJobs(boss, db);
console.log("worker running");

const shutdown = async () => {
  await boss.stop();
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
