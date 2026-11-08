import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool, waitForDatabase, db } from "./client";

export async function runMigrations(): Promise<void> {
  await waitForDatabase();
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../drizzle",
  );
  await migrate(db, { migrationsFolder });
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (invokedDirectly) {
  runMigrations()
    .then(async () => {
      console.log("migrations applied");
      await pool.end();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}
