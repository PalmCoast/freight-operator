import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://freight:freight@localhost:5432/freight";

const globalForDb = globalThis as unknown as { freightPool?: Pool };

export const pool =
  globalForDb.freightPool ??
  new Pool({
    connectionString: DATABASE_URL,
    max: 10,
  });

// Keep one pool across Next.js hot reloads. Tests get a fresh pool per file
// so closing it at the end of a file does not poison the next file.
if (process.env.NODE_ENV === "development") {
  globalForDb.freightPool = pool;
}

export const db = drizzle(pool, { schema });

export async function waitForDatabase(attempts = 20): Promise<void> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const message = last instanceof Error ? last.message : String(last);
  throw new Error(
    `Postgres is not reachable at ${DATABASE_URL}. Start it with \`docker compose up -d\` and retry. ${message}`,
  );
}
