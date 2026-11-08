# Lane desk

A small freight desk where an operator turns a broker's email into a quote, then **stops** until a human approves it.

> Need a quote, dry van, Chicago IL to Dallas TX, 42,000 lbs, pickup Tuesday.

The operator parses that, looks up a lane rate, checks a carrier, drafts an all-in quote, and waits. Every step is stored with its inputs, reasoning, and outcome. Nothing is marked sent until someone on the desk approves, rejects, or edits the number. An edit is saved as a new expert example and can be retrieved later.

This is a learning repo: one workflow, end to end, in TypeScript, with no external workflow product and no API key required. The eval suite is the release gate.

![Run timeline](docs/screenshots/runs-timeline.png)

![Approval queue](docs/screenshots/approval-queue.png)

## Architecture

```mermaid
flowchart LR
  Web["Next.js desk"] --> API["tRPC"]
  API --> Engine["Operator engine"]
  Worker["Worker"] --> Engine
  Engine --> Runs[("runs, steps, decisions")]
  Engine --> Model{"OPENAI_API_KEY set?"}
  Model -->|no| Mock["Deterministic mock"]
  Model -->|yes| Live["OpenAI via AI SDK"]
  Engine --> Tools["Zod tools"]
  Tools --> PG[("Postgres + pgvector")]
  Engine --> Gate["Approval pause"]
  Gate --> Web
  Web -->|"approve / reject / edit"| Engine
```

The web app and the worker call the same `advanceRun` function. Submit advances the run inline so the desk updates immediately. The worker is the crash-recovery loop: it claims rows that are still `pending` or `running` and finishes them. Replacing that loop with Temporal or Inngest is described in [the walkthrough](docs/WALKTHROUGH.md).

## Quickstart

You need Node 22+, pnpm 10, and Docker.

```bash
docker compose up -d
pnpm i
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Open http://localhost:3000. Paste a rate request or use one of the sample chips. The default database URL is `postgres://freight:freight@localhost:5432/freight`, so you do not need a `.env` file for local development. Copy `.env.example` only if you want to point elsewhere or turn on a real model.

`pnpm dev` starts the desk and the worker together.

## Tests and the eval gate

Postgres has to be up (the same `docker compose` database). No API key is read. Tests and `pnpm eval` force the mock even if `OPENAI_API_KEY` is set in your shell.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm eval
pnpm test:e2e   # Playwright; installs a browser on first run
```

`pnpm eval` replays 10 historical requests, each with the all-in a human expert quoted, and prints a scorecard. A case passes when the parse matches, the quote is within 10% of the expert, and the run is sitting in `waiting_approval` with nothing marked sent. The process exits non-zero if any case misses. That is the release gate. Current run:

```text
Parse accuracy:          10/10
Quotes within 10%:       10/10
Approval gate respected: 10/10
PASS
```

GitHub Actions runs the same commands against a `pgvector/pgvector:pg16` service.

## What is where

| Path | Role |
| --- | --- |
| `packages/schema` | Zod contracts shared by the model, the database boundary, tRPC, and the desk |
| `packages/db` | Drizzle schema, SQL migration, seed, hashing embedder |
| `packages/operator` | Tools, mock model, durable step runner |
| `apps/web` | Next.js desk and the tRPC route |
| `apps/worker` | Polls Postgres and advances runnable runs |
| `evals` | Fixture set and scorecard |
| `e2e` | One browser pass through submit, approve, reject, and edit |
| `docs/WALKTHROUGH.md` | Why each layer is shaped this way, and what breaks in production |
| `docs/INTERVIEW-NOTES.md` | Questions worth being able to answer, plus extensions |

Screenshots are regenerated with the dev server up and `pnpm exec tsx scripts/capture-screenshots.ts`.

## A real model

Leave `OPENAI_API_KEY` unset and the operator uses the deterministic mock. Set it, and optionally `OPENAI_MODEL` (default `gpt-4o-mini`), and the same tool schemas are sent to OpenAI through the Vercel AI SDK. The price still comes from the rate card. The model does not get to invent it.
