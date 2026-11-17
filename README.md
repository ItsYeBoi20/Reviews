# Verdict

A review site for movies, TV and games. Each title gets two scores: a **Reddit consensus** (an AI reads public Reddit discussion, and the score is computed in code from its labels) and a **user score** from members' own reviews.

The plan, architecture, scoring math, API reference, cost estimates and risks are in **[docs/PLAN.md](docs/PLAN.md)**.

## Stack

- `apps/web`: Next.js 16 frontend (SSR)
- `apps/api`: Fastify REST API (auth, titles, reviews, consensus)
- `apps/worker`: pg-boss background jobs (scheduled Reddit analysis, retention purge, catalog sync)
- `packages/core`: Reddit client, AI provider adapters, consensus pipeline and scoring
- `packages/db`: Drizzle schema and migrations (Postgres 16)

## Run it locally

Requires Node 22.12+, pnpm 10 and Postgres 16. Docker Compose is the easiest way to get Postgres.

```bash
pnpm install
docker compose up -d postgres     # or point DATABASE_URL at any Postgres 16
cp .env.example .env
pnpm db:seed                      # migrations + fictional titles, demo users, reviews, consensus
pnpm dev                          # api :4000, worker, web http://localhost:3000
```

Demo accounts: `reeltalk@verdict.local`, `admin@verdict.local` and others, all with password `verdict-demo-pass`.

Out of the box everything runs offline:

- `REDDIT_SOURCE=fixtures` generates synthetic threads for the 10 fictional seed titles.
- `LLM_PROVIDER=mock` uses a deterministic lexicon analyzer.

Pages built from fixtures are labeled "Sample data".

## Going live

| Setting | Values |
|---|---|
| `REDDIT_SOURCE` | `api`, with `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` and a real `REDDIT_USER_AGENT` |
| `LLM_PROVIDER` | `mindstudio`, `openai-compatible` (LM Studio, Ollama, Mistral...), or `anthropic` |
| Catalog | `TMDB_API_TOKEN` (movies/TV), `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` (IGDB games) |

Read the Reddit compliance section of the plan before using real Reddit data commercially.

Useful commands:

```bash
pnpm consensus:run <slug>                     # run the pipeline for one title now
pnpm test                                     # unit tests
TEST_DATABASE_URL=postgres://.../verdict_test pnpm test   # plus API integration tests (wipes that DB)
pnpm typecheck
pnpm db:generate                              # new migration after editing packages/db/src/schema.ts
```
