import { afterAll } from "vitest";
import { pool } from "./packages/db/src/client";

// The suite must pass with no API key. A developer key in the environment
// must not turn unit tests into live model calls.
delete process.env.OPENAI_API_KEY;
process.env.OPERATOR_FORCE_MOCK = "1";
process.env.DATABASE_URL ??=
  "postgres://freight:freight@localhost:5432/freight";

afterAll(async () => {
  await pool.end();
});
