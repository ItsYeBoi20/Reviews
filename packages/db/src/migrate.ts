import { fileURLToPath } from "node:url";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(url?: string) {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: path.join(here, "../migrations") });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runMigrations();
  console.log("migrations applied");
}
