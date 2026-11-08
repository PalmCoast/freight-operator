import { pool, runMigrations, seed } from "./packages/db/src/index";

export default async function setup(): Promise<void> {
  process.env.OPERATOR_FORCE_MOCK = "1";
  delete process.env.OPENAI_API_KEY;
  process.env.DATABASE_URL ??=
    "postgres://freight:freight@localhost:5432/freight";
  try {
    await runMigrations();
    await seed();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Database setup failed. Start Postgres (\`docker compose up -d\`) then run \`pnpm db:migrate && pnpm db:seed\`. ${message}`,
      { cause: error },
    );
  } finally {
    await pool.end();
  }
}
