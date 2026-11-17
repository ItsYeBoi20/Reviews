import { sql } from "drizzle-orm";
import { schema, type Db } from "@verdict/db";
import { slugify, type CatalogTitle } from "./types.ts";

/**
 * Inserts or refreshes catalog titles, matching on the external id
 * (tmdb or igdb) so renamed titles keep their reviews and history.
 */
export async function upsertCatalogTitles(db: Db, items: CatalogTitle[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const item of items) {
    if (!item.name) continue;
    const [source, id] = Object.entries(item.externalIds)[0] ?? [];
    if (!source) continue;
    const existing = await db.select({ id: schema.titles.id }).from(schema.titles)
      .where(sql`${schema.titles.kind} = ${item.kind} and ${schema.titles.externalIds}->>${source} = ${String(id)}`)
      .limit(1);
    const values = {
      name: item.name, year: item.year, releaseDate: item.releaseDate, synopsis: item.synopsis,
      posterUrl: item.posterUrl, backdropUrl: item.backdropUrl, genres: item.genres, platforms: item.platforms,
      creators: item.creators, runtimeMinutes: item.runtimeMinutes, popularity: item.popularity, updatedAt: new Date(),
    };
    if (existing[0]) {
      await db.update(schema.titles).set(values).where(sql`${schema.titles.id} = ${existing[0].id}`);
      updated++;
    } else {
      // Same name + year across kinds (a film and its game) or remakes: fall back to suffixed slugs.
      const base = slugify(item.name, item.year);
      for (const slug of [base, `${base}-${item.kind}`, `${base}-${source}-${id}`]) {
        const rows = await db.insert(schema.titles)
          .values({ ...values, kind: item.kind, slug, externalIds: item.externalIds })
          .onConflictDoNothing({ target: schema.titles.slug })
          .returning({ id: schema.titles.id });
        if (rows.length) {
          inserted++;
          break;
        }
      }
    }
  }
  return { inserted, updated };
}
