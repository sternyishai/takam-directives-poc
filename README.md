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
| `npm run ingest -- <codes…>` | downloads, checks and converts the given Directives into the store |
| `npm run lint` | ESLint on every project |
| `npm run format:check` | Prettier: fails if any code file is not formatted (`npm run format` fixes them) |
| `npm run typecheck` | TypeScript on every project |
| `npm test` | every test project (Vitest for the libs, web and ingest; Jest for the API) |
| `npm run build` | builds every project |

`curl http://localhost:3000/api/health` returns `{"directives":0,"indexSize":0,"lastIngest":null}` against an empty store.
The API opens `data/takam.db` (set `DB_PATH` to use another file). If the file does not exist, the API creates it with an empty schema.
If the API runs on another port (`PORT=3456 npm run api`), start the web app with `API_URL=http://localhost:3456 npm run web` so its `/api` proxy finds it.

### Fill the store and read a Directive
```bash
npm run ingest -- H.13.10.1     # one or more Document codes; needs network access to the Takam site
npm run dev
```
Then open http://localhost:4200/directive/H.13.10.1. The page shows the Directive's code, title, type, chapter path, edition, validity dates, a link to its page on the Takam site, and its text.
An expired Directive (try `HZ.13.10.1.1`) gets a red "הוראה זו אינה בתוקף" (this Directive is not in force) banner.

For each code, ingest does the following:
1. Finds the Document in the site's Document list.
2. Takes its highest Edition and downloads that Edition's Word file.
3. Puts the file through the security gate.
4. Converts it with Mammoth.
5. Writes it to `data/takam.db`.

It prints `✓` or `✗ <reason>` for each code and exits with code 1 if any code failed.
The raw files are kept in `data/raw/`, which is gitignored and never served.
`GET /api/directives/:code` returns the stored Directive, or 404 for an unknown code.

### Layout
| Project | What it is |
|---|---|
| `apps/web` | React + Vite, Hebrew and right-to-left (`<html lang="he" dir="rtl">`) |
| `apps/api` | NestJS: `GET /api/health` and `GET /api/directives/:code` |
| `apps/ingest` | Node CLI that fills the store: Takam site client, security gate, Mammoth conversion |
| `libs/search` | Hebrew normalization and MiniSearch (milestone 2) |
| `libs/llm` | LangChain models, enrichment, chat (milestone 6) |
| `libs/shared` | types shared by the API and the web app (`HealthReport`, `Directive`), plus `isInForce` and `officialPageUrl` |
| `libs/store` | the SQLite schema and the `Store` class: ingest writes to it, the API reads from it |

### Decisions made while building
- **Nx with npm workspaces.** Each app and lib is an npm workspace package (`@takam/web`, `@takam/shared` and so on), and Nx infers the `lint`, `test`, `typecheck` and `build` targets from the config files. `nx sync` keeps the TypeScript project references in step.
- **Health is tested over real HTTP.** The API test starts the whole Nest app on a random port with an in-memory SQLite database (`DB_PATH=:memory:`) and calls it with `fetch`, so it checks the route, the module wiring and the schema together.
- **The web test fakes only `fetch`.** The component is rendered for real; only the network call to the API is replaced.
- **The schema is created on startup** with `CREATE TABLE IF NOT EXISTS`, so a missing or empty DB file is never an error. Later milestones add columns and tables.
- **`data/takam.db` is not committed yet.** ADR 0003 commits it once ingest fills it with the 30-Directive subset (issue #5). Until then, `.gitignore` keeps it out, and you fill it yourself with `npm run ingest`. The schema gained columns in this step and `CREATE TABLE IF NOT EXISTS` does not change an existing table, so delete an older `data/takam.db` before running ingest.
- **A fourth library, `libs/store`.** Ingest writes the store and the API reads it, so the schema and the SQL live in one place that both import. It is Node-only (`node:sqlite`), which is why it is not in `libs/shared`: the web app imports `libs/shared`. In the API, `StoreService` is just `Store` made into a Nest provider.
- **In force is computed by the API on each request**, from the dates and today's date in Israel (ADR 0001). The store keeps only the dates, so a Directive turns expired at midnight without a new ingest. `isInForce` compares ISO date strings, which sort the same way as dates. Both ends are inclusive, and a missing valid-to means no end.
- **The security gate checks the cheapest things first:**
  1. the size (under 2 MB)
  2. the zip magic bytes `PK\x03\x04`, with a separate reason when the file is the site's HTML page
  3. that the zip opens and contains `word/document.xml`

  The zip-bomb limits (entry count, expanded size) come with the full subset in issue #5.
- **Ingest writes straight into the live store for now.** The plan says ingest exits non-zero if more than 20% of files are rejected, and the old DB stays live. That rule needs the full subset and an atomic swap of the DB file, so it comes in issue #5. Until then, any failed code gives exit code 1.
- **The validity dates come from the Edition ingest converts** (`rtn_validfrom__c` / `rtn_validto__c`), not from the Document list. The text and the dates then always belong to the same Edition. For the latest Edition the two sources hold the same dates. All 1,247 dates on the site are UTC midnight (`…T00:00:00.000Z`), so ingest keeps the first 10 characters as the ISO date.
- **The download URL ends with the Document code** (`…/DownloadDocument/{contentVersionId}/{code}`). The last segment is only a file name, but an empty one makes the site answer with its HTML page.
- **Ingest names itself in the User-Agent header** (`takam-poc-ingest/0.1`). The site's firewall (Sucuri) answers 403 to Node's default User-Agent, `node`.
- **Messages without Chapters use their parent's.** 140 of the site's 547 Directives (mostly `HOD.…` Messages) have no Chapter fields, only a `parentdocument`. Ingest walks up to the parent to build the chapter path.
- **Images are dropped.** Mammoth is given an image converter that writes an empty `src` instead of embedding the picture, and those `<img>` tags are then removed. The text is what matters, and images would bloat the store.
- **The viewer inserts the converted HTML with `dangerouslySetInnerHTML`.** For now this is Mammoth's output as is. Mammoth escapes the document's text, but links are copied through. Issue #4 adds the Hebrew heading style map, a sanitizer allowlist in ingest and a strict CSP header in the API.
- **The official link is `https://takam.mof.gov.il/document/{code}`.** This is the site's own Angular route, `document/:id`, which loads a Document by its code.
- **The router (`BrowserRouter`) wraps `App` in `main.tsx`**, so the tests can render `App` inside a `MemoryRouter` at any URL.
- **`indexSize` is 0 for now.** The MiniSearch index is built in milestone 4.
- **Vitest runs once, not in watch mode** (`testMode: "run"` in `nx.json`), so `npm test` finishes.

### Tests and CI
`npm test` runs every test project:
- **Unit tests (Vitest):**
  - `isInForce` and the other `libs/*` code
  - the ingest security gate
  - the web pages, rendered for real with only `fetch` faked
- **Integration tests (Jest, `apps/api`):** each one starts the whole Nest app on a random port, on an in-memory or temporary SQLite file, and calls it with `fetch`.

No test needs the network or an API key.

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on every push to `main`. It installs with `npm ci` on Node 24, then runs these steps in order, and stops at the first one that fails:
1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

Run the same commands locally before pushing.
Prettier checks code and config only. The Markdown docs are hand-written and kept as written (`.prettierignore`).

## Part C: Engineering thinking and production readiness
1. Engineering decisions and quality: _TBD_
2. Deployment and operations: _TBD_
