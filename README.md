# Takam Directives POC

Take-home assignment built around the Takam Directives website: https://takam.mof.gov.il/

> Work in progress. These sections will be filled in as the work goes on.

## Part A: Problem and solution
- **Problem:** _TBD_
- **Solution:** _TBD_
- **Technical design:** _TBD_

## Part B: POC

### Install and run
You need Node.js 24 or newer (the store uses Node's built-in `node:sqlite`) and npm.

```bash
npm install
cp .env.example .env    # then put your Gemini key in GOOGLE_API_KEY (search works without it)
npm run dev             # the API on http://localhost:3000/api and the web app on http://localhost:4200
```

Open http://localhost:4200. The page shows how many directives are in the store.
With an empty store it says "במאגר 0 הוראות". You can also run one side only:

| Command | What it does |
|---|---|
| `npm run web` | the web app (Vite dev server, port 4200; `/api` is proxied to port 3000) |
| `npm run api` | the NestJS API (port 3000, or `PORT`) |
| `npm run lint` | ESLint on every project |
| `npm run typecheck` | TypeScript on every project |
| `npm test` | every test project (Vitest for the libs, web and ingest; Jest for the API) |
| `npm run build` | builds every project |

`curl http://localhost:3000/api/health` returns `{"directives":0,"indexSize":0,"lastIngest":null}` against an empty store.
The API opens `data/takam.db` (set `DB_PATH` to use another file). If the file does not exist, the API creates it with an empty schema.

### Layout
| Project | What it is |
|---|---|
| `apps/web` | React + Vite, Hebrew and right-to-left (`<html lang="he" dir="rtl">`) |
| `apps/api` | NestJS: `GET /api/health` for now |
| `apps/ingest` | Node CLI that fills the store (from milestone 3) |
| `libs/search` | Hebrew normalization and MiniSearch (milestone 2) |
| `libs/llm` | LangChain models, enrichment, chat (milestone 6) |
| `libs/shared` | types shared by the API and the web app, e.g. `HealthReport` |

### Decisions made while building
- **Nx with npm workspaces.** Each app and lib is an npm workspace package (`@takam/web`, `@takam/shared` and so on), and Nx infers the `lint`, `test`, `typecheck` and `build` targets from the config files. `nx sync` keeps the TypeScript project references in step.
- **Health is tested over real HTTP.** The API test starts the whole Nest app on a random port with an in-memory SQLite database (`DB_PATH=:memory:`) and calls it with `fetch`, so it checks the route, the module wiring and the schema together.
- **The web test fakes only `fetch`.** The component is rendered for real; only the network call to the API is replaced.
- **The schema is created on startup** with `CREATE TABLE IF NOT EXISTS`, so a missing or empty DB file is never an error. Later milestones add columns and tables.
- **`data/takam.db` is not committed yet.** ADR 0003 commits it once ingest fills it (milestone 3). Until then, `.gitignore` keeps out the empty file the API creates on its first run. The schema lives in `apps/api/src/store/schema.ts` for now and moves to a place ingest can share when ingest starts writing.
- **`indexSize` is 0 for now.** The MiniSearch index is built in milestone 4.
- **Vitest runs once, not in watch mode** (`testMode: "run"` in `nx.json`), so `npm test` finishes.

### Tests
_TBD (milestone 8)_

## Part C: Engineering thinking and production readiness
1. Engineering decisions and quality: _TBD_
2. Deployment and operations: _TBD_
