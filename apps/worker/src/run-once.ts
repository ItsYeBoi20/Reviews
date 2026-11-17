// Runs the consensus pipeline for one title synchronously, outside the queue.
// Usage: pnpm consensus:run <slug>
import { createAnalyzer, createRedditSource, runConsensus } from "@verdict/core";
import { createDb } from "@verdict/db";
import { titleIdBySlug } from "./jobs.ts";

const slug = process.argv[2];
if (!slug) {
  console.error("usage: pnpm consensus:run <title-slug>");
  process.exit(1);
}
const { db, pool } = createDb();
try {
  const id = await titleIdBySlug(db, slug);
  if (!id) throw new Error(`no title with slug ${slug}`);
  const result = await runConsensus(id, {
    db, reddit: createRedditSource(), analyzer: createAnalyzer(),
    log: (m, e) => console.log(m, e ?? ""),
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
