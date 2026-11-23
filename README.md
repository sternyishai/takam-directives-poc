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
| `npm run ingest` | downloads, checks, converts and enriches the 30 Directives in `apps/ingest/ingest.config.json` into a new store (needs `GOOGLE_API_KEY`) |
| `npm run export` | writes each Directive in the store, enrichment included, to `data/export/<code>.json`, to read without SQLite |
| `npm run lint` | ESLint on every project |
| `npm run format:check` | Prettier: fails if any code file is not formatted (`npm run format` fixes them) |
| `npm run typecheck` | TypeScript on every project |
| `npm test` | every test project (Vitest for the libs, web and ingest; Jest for the API) |
| `npm run build` | builds every project |

`curl http://localhost:3000/api/health` returns `{"directives":30,"indexSize":30,"lastIngest":"…"}` against the committed store.
The API opens `data/takam.db` (set `DB_PATH` to use another file). If the file does not exist, the API creates it with an empty schema.
If the API runs on another port (`PORT=3456 npm run api`), start the web app with `API_URL=http://localhost:3456 npm run web` so its `/api` proxy finds it.

### Search
```bash
npm run dev
```
Open http://localhost:4200, type a word or a Document code (`נסיעות`, `13.10.1`) and press "חיפוש" (search). The results are a flat list, best match first. Each result shows:
- its chapter path as numbers (`13 › 13.10 › 13.10.1`)
- its Directive type
- a snippet (the heading that matched, or else the Directive's summary)
- a red "לא בתוקף" (not in force) badge if it is not in force

Only In-force Directives are shown until you tick "הצג גם הוראות שאינן בתוקף" (show Directives that are not in force too).

While you type, a dropdown under the box shows the top 3 matches, each with its Document code, title and a green "בתוקף" (in force) or red "לא בתוקף" badge. The arrow keys move the selection, Enter opens the selected Directive, and Escape closes the dropdown. Clicking an entry opens it too. Enter with nothing selected, or the "חיפוש" button, shows the full results.
The API is `GET /api/search?q=…&inForce=true&limit=20`. `inForce` is true unless it is `false`, and `limit` is 1 to 50. Every search adds a row to the `search_log` table: the query, the filter, the number of results and the time.

### Read a Directive
The store (`data/takam.db`) is committed with the 30 Directives in it, so this needs no network:
```bash
npm run dev
```
Then open http://localhost:4200/directive/H.13.10.1. The page shows the Directive's code, title, type, a short summary (marked as written by a language model), its chapter path, edition, validity dates, a link to its page on the Takam site, and its text.
An expired Directive (try `HZ.13.10.1.1`) gets a red "הוראה זו אינה בתוקף" (this Directive is not in force) banner.

### Refill the store
```bash
npm run ingest     # needs network access to the Takam site and GOOGLE_API_KEY in .env
```
Ingest reads the Document codes from `apps/ingest/ingest.config.json` (the 30 in `docs/plan.md`). It finds each one by its Document code (`documentcodetext`), so Temporary Instructions (`HZ.…`) and Messages (`HOD.…`) are found the same way as Instructions.
For each code, ingest does the following:
1. Finds the Document in the site's Document list.
2. Takes its highest Edition and downloads that Edition's Word file.
3. Puts the file through the security gate.
4. Converts it with Mammoth.
5. Enriches it: one Gemini call returns a Hebrew summary, keywords and likely questions (see "Enrichment" below).
6. Writes it to a new store, `data/takam.db.tmp`.

It prints `✓` or `✗ <reason>` for each code, and a line for each enrichment failure. Then:
- If at most 20% of the files were rejected and at most 20% of the enrichments failed, it records the time of the run and moves the new store over `data/takam.db`.
- Otherwise it deletes the new store, keeps the old one, and exits with code 1.
The raw files are kept in `data/raw/`, which is gitignored and never served.
`GET /api/directives/:code` returns the stored Directive, or 404 for an unknown code.

### Layout
| Project | What it is |
|---|---|
| `apps/web` | React + Vite, Hebrew and right-to-left (`<html lang="he" dir="rtl">`) |
| `apps/api` | NestJS: `GET /api/health`, `GET /api/search` and `GET /api/directives/:code` |
| `apps/ingest` | Node CLI that fills the store: Takam site client, security gate, Mammoth conversion |
| `libs/search` | `DirectiveSearch`: MiniSearch over the title, Document code, headings and enrichment, with Hebrew normalization and typo tolerance |
| `libs/llm` | LangChain chat models (Gemini, and the fake one for tests) and enrichment; chat comes in milestone 7 |
| `libs/shared` | types shared by the API and the web app (`HealthReport`, `Directive`, `SearchResult`), plus `isInForce`, `todayInIsrael` and `officialPageUrl` |
| `libs/store` | the SQLite schema and the `Store` class: ingest writes to it, the API reads from it |

### Decisions made while building
- **Nx with npm workspaces.** Each app and lib is an npm workspace package (`@takam/web`, `@takam/shared` and so on), and Nx infers the `lint`, `test`, `typecheck` and `build` targets from the config files. `nx sync` keeps the TypeScript project references in step.
- **Health is tested over real HTTP.** The API test starts the whole Nest app on a random port with an in-memory SQLite database (`DB_PATH=:memory:`) and calls it with `fetch`, so it checks the route, the module wiring and the schema together.
- **The web test fakes only `fetch`.** The component is rendered for real; only the network call to the API is replaced.
- **The schema is created on startup** with `CREATE TABLE IF NOT EXISTS`, so a missing or empty DB file is never an error. Later milestones add columns and tables.
- **`data/takam.db` is committed** (ADR 0003), so a clean clone runs the viewer and the tests with no network. Each ingest run builds a whole new store, so a schema change only needs a new run.
- **A fourth library, `libs/store`.** Ingest writes the store and the API reads it, so the schema and the SQL live in one place that both import. It is Node-only (`node:sqlite`), which is why it is not in `libs/shared`: the web app imports `libs/shared`. In the API, `StoreService` is just `Store` made into a Nest provider.
- **In force is computed by the API on each request**, from the dates and today's date in Israel (ADR 0001). The store keeps only the dates, so a Directive turns expired at midnight without a new ingest. `isInForce` compares ISO date strings, which sort the same way as dates. Both ends are inclusive, and a missing valid-to means no end.
- **The security gate checks the cheapest things first:**
  1. the size (under 2 MB)
  2. the zip magic bytes `PK\x03\x04`, with a separate reason when the file is the site's HTML page
  3. that the zip opens and contains `word/document.xml`
  4. that it is not a zip bomb: fewer than 200 entries (the real files have about 30) and under 20 MB once expanded

  For the expanded size, the gate does not trust the sizes the zip states for its entries, because a zip bomb can lie there. It expands every entry as a stream and counts the bytes, stopping at 20 MB, so a bomb never fills the memory.
- **Ingest builds a new store and swaps it in.** It writes to `data/takam.db.tmp` and, only if at most 20% of the files were rejected, renames it to `data/takam.db`. A rename within one folder is atomic, so the API never opens a half-written file, and a failed run (say the site's firewall answers every download with its HTML page) leaves the previous store in place. A few rejected files are logged but don't fail the run: one changed Directive shouldn't block the other 29. An API that is already running keeps reading the old file until it restarts.
- **`runIngest` takes the site as a parameter.** `main.ts` passes the real site client (`takam-site.ts`), and the tests pass a fake one that serves tiny Word files or the site's HTML page. That way the 20% rule and the swap are tested without the network.
- **The validity dates come from the Edition ingest converts** (`rtn_validfrom__c` / `rtn_validto__c`), not from the Document list. The text and the dates then always belong to the same Edition. For the latest Edition the two sources hold the same dates. All 1,247 dates on the site are UTC midnight (`…T00:00:00.000Z`), so ingest keeps the first 10 characters as the ISO date.
- **The download URL ends with the Document code** (`…/DownloadDocument/{contentVersionId}/{code}`). The last segment is only a file name, but an empty one makes the site answer with its HTML page.
- **Ingest names itself in the User-Agent header** (`takam-poc-ingest/0.1`). The site's firewall (Sucuri) answers 403 to Node's default User-Agent, `node`.
- **Messages without Chapters use their parent's.** 140 of the site's 547 Directives (mostly `HOD.…` Messages) have no Chapter fields, only a `parentdocument`. Ingest walks up to the parent to build the chapter path.
- **Images are dropped.** Mammoth is given an image converter that writes an empty `src` instead of embedding the picture, and the sanitizer then removes the `<img>` tags. The text is what matters, and images would bloat the store.
- **The heading style map was built from the real files, not from the plan's guess.** The plan expected `כותרת רמה 1` in the custom-style Directives. The actual Word files use:
  - the Instructions (H.13.10.1, HZ.13.10.1.1): Word's standard `heading 1`, plus a custom `נספח - כותרת` for appendix titles
  - H.1.1.1: custom numbered styles `כות_1`, `כות_1.1` and `כות_1.1.1`. Without a mapping, Mammoth shows these as list items, because Word numbers them like a list.

  Every top-level heading becomes `h2`, because the page's own `h1` is the Directive's title, and the levels below move down one. Word's table of contents (`toc 1-3`, `תוכן_עניינים`) is dropped: its page numbers mean nothing on the web. A mapping is only added for a style seen in a real file. After the full subset was ingested, the other 28 files were checked for styles Mammoth doesn't know. None of them is a heading: they are numbered clauses (`סעיף רמה 2`…`6`, `תת סעיף`), definitions (`הגדרות`), appendix descriptions (`נספח - תיאור`) and table captions (`כותרת טבלת נספחים`). Mammoth shows them as plain paragraphs, which is right, so no mapping was added.
- **The HTML is sanitized twice: by ingest before it is stored, and by the API before it is sent.** The sanitizer (`libs/sanitize`, with sanitize-html) is an allowlist: `h2`–`h4`, `p`, `br`, lists, tables (with `colspan`/`rowspan`), `strong`, `em` and `a`. Nothing else survives, including `style` and every `on…` attribute. A removed tag keeps its text, except `<script>` and `<style>`, which go with their content. Only links to `http(s)` addresses stay links. Any other link (a `javascript:` link, or a footnote link like `#footnote-1`, which can't work once the ids are removed) is reduced to its text.
  - Those other links are removed with `exclusiveFilter` returning `'excludeTag'` (drop the tag, keep the text). They used to be renamed to `<span>` in `transformTags` and then dropped, but sanitize-html 2.18 then closes the next element with `</span>` (e.g. `<h2>נספח א</span>`). That broke the nesting in 28 of the 30 stored Directives, mostly after Word's empty bookmark links (`<a id="…"></a>`). The store was re-ingested after the fix, and only the tags changed: the text of all 30 is the same.
  - Why twice: the viewer inserts the HTML with `dangerouslySetInnerHTML`, so the API must never send unsafe HTML, even from a store that was filled before the sanitizer existed or was edited by hand. Cleaning in ingest keeps the stored HTML (and the chunks built from it later) clean, and cleaning in the API is the last check before the browser. The cost is a few milliseconds per request.
  - It is a library, not a file in ingest, because both apps call it.
  - sanitize-html's HTML parser (htmlparser2) ships only as an ES module. Node 24 loads it fine, but Jest can't, so `apps/api/jest.config.cts` tells Jest to transform those packages (`transformIgnorePatterns`).
- **The API sends `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` on every response**, errors included. The API only sends JSON, so it may load nothing, and no site may frame it. The header is set in `configureApp` (`apps/api/src/app/configure-app.ts`), which `main.ts` and the e2e tests share, so the tests run the same setup as the real server. The page's own CSP belongs to whatever serves the built web app (see the production HLD).
- **The official link is `https://takam.mof.gov.il/document/{code}`.** This is the site's own Angular route, `document/:id`, which loads a Document by its code.
- **The router (`BrowserRouter`) wraps `App` in `main.tsx`**, so the tests can render `App` inside a `MemoryRouter` at any URL.
- **Search matches whole words only.** MiniSearch is used without prefix matching, so "רכב" (car) does not match the inside of a longer word, and "נסיע" finds nothing. Words are split at spaces and punctuation, but a dot or a quote inside a word is kept, so `13.10.1` and `צה"ל` each stay one word.
- **Every word is normalized the same way in the index and in the query** (`normalizeWord` in `libs/search`), so the ways Hebrew is really typed all match. In this order:
  1. lower case
  2. niqqud (vowel points) removed: `רֶכֶב` → `רכב`. The regular expression `\p{Mn}` matches every mark that sits on a letter.
  3. quotes removed: `אש״ל` (gershayim), `אש"ל` (ASCII quote) and `אשל` all become `אשל`. The plan said to turn ״ into `"`; removing all quotes does that and also matches the abbreviation typed with no quote, which is how many people type on a phone.
  4. one Hebrew prefix letter (ה ב ל ו מ ש כ) stripped if at least 2 letters remain: `ברכב`, `הרכב` and `לרכב` become `רכב`. Only one, so `והרכב` (and the car) stays `הרכב`.
  5. ו and י removed: `גימלאות` (full spelling) and `גמלאות` (short spelling) both become `גמלאת`. This comes after the prefix step on purpose. Removing ו/י first made a leading י expose the next letter as a "prefix", so `ישראל` became `ראל` and `ישיבת` (meeting of) matched `בת` (daughter).
  - The cost: different words can become the same form. `ביטוח` (insurance) and `בטוח` (safe) both become `טח`, and the trap `הרכב התקציב` (the composition of the budget) now matches "רכב". The title weight keeps the real car Directives above it.
- **Typos are tolerated, scaled to the word's length** (`typosAllowed`): no typo up to 3 letters, one from 4 letters, and at most two, from 8, counted after normalization. The cost: a 4-letter word one letter longer than a real word matches it, so `רכבת` (train) finds `רכב` (car), below the exact matches. Short Hebrew words are often one letter apart (`רכב` car, `רכז` coordinator), so they must match exactly. A word with a digit (a Document code or a number) is always matched exactly, so `13.10.1` never finds `13.10.2`. A typo match counts 0.2 of an exact one (MiniSearch's default is 0.45). With 0.45, "תשלום" ranked a Directive whose title has "תשלומים" (one edit away) above the one with "תשלום" in a heading.
- **Document codes are indexed as two words:** the whole code and the code without its letters (`H.13.10.1` → `h.13.10.1`, `13.10.1`). Typing `13.10.1` finds `H.13.10.1` and not `HZ.13.10.1.1`, because a code is matched as a whole.
- **Field weights:** a word in the title or the code counts three times as much as a word in a heading. The title says what a Directive is about, while a heading can mention a word in passing. The enrichment counts less than a heading: keywords 0.7, summary and questions 0.5 each (see "Enrichment").
- **Validity first.** The filter defaults to In force. When expired Directives are included, every In-force result still comes before every expired one, so an old rule never ranks above a current one. A Directive whose valid-from date is still to come (HOD.13.4.1.2 starts on 2027-01-01) is not In force either, so it gets the same red badge.
- **`search()` takes today's date as an argument** (`{ today }`) instead of reading the clock, so the tests can check the inclusive valid-to boundary on any day. The API passes `todayInIsrael()`, which moved from the directives controller to `libs/shared` so both controllers use it.
- **The snippet is the first heading that contains a matched word**, or else the Directive's summary. The first 200 characters of the text are used only when enrichment failed. The opening of a Directive is often boilerplate ("על פי פקודת…"), while the summary says what the Directive is about.
- **The API builds the index from the store once, when it starts** (`SearchService`). It pulls the heading text out of the sanitized HTML with a regular expression. That is safe here because the sanitizer leaves only bare tags such as `<h2>`. A heading stops at its closing tag or at the next block tag, as a guard against a heading that is never closed (as H.13.12.1's was before issue #20). `indexSize` in `/api/health` is the number of Directives in the index.
- **The search log lives in the store**, as the plan says, so running the API against `data/takam.db` adds rows to the committed file. Run it with `DB_PATH` pointing at a copy if you don't want that. Each ingest builds a new store, so ingest also clears the log.
- **The quick-search dropdown is hand-written, with no combobox library.** It calls the same endpoint as the full results, with the same filter and `limit=3`. The API cuts one ranking to the limit, so the dropdown always shows the first 3 of the full results, in the same order. On the real data, "נסיעות" gives H.13.10.3, H.13.10.1 and H.13.10.2 in both.
  - It searches 150 ms after typing stops. Each keystroke restarts a `setTimeout` in a `useEffect`, and the effect's cleanup clears the previous one, so a fast typist sends one request, not one per letter. A late answer to an older query is ignored, as in the full results.
  - Typing opens it, and Escape or a submit closes it. Escape calls `preventDefault`, because in a `type="search"` box the browser would also empty the box.
  - The selected entry is an index (`-1` for none) kept in state. Enter on a selected entry calls `navigate` and `preventDefault`, so the form is not submitted. With nothing selected, Enter is left to the form.
  - It does not close when the box loses focus. Closing on blur hides the entry before a click on it lands (blur comes first), and the plan leaves full dropdown accessibility out of scope.
  - If the dropdown's request fails, it stays empty: it is only a shortcut, and the full results report the error.
  - The matches are kept with the query they are for, and shown only while that query is still in the box. Without that, the previous text's matches would stay on screen until the new ones arrive, and ArrowDown + Enter could open a Directive that doesn't match what is typed.
  - The cost: every pause in typing is a search, so the dropdown's requests are in `search_log` too, with partial words such as "נסיע". They can be told apart only by their timing.
- **The results list changes only when a search is submitted.** Typing in the box only updates the dropdown, not the list. Ticking the filter re-runs the last submitted query, not the text now in the box.
- **On the real data, "רכב" now finds H.13.4.1 ("ברכב פרטי") first.** Before prefixes were stripped it found nothing: the only Directive with the word on its own (HOD.13.4.1.2) is not in force until 2027. The trap H.1.1.1 comes second, below the title match.
- **Enrichment** (`libs/llm`, issue #9). Ingest makes one Gemini call per Directive. The call returns `{ summary, keywords[], questions[] }` in Hebrew and goes through LangChain's `withStructuredOutput` with a zod schema (ADR 0002).
  - **Every reply is checked against the zod schema in our code**, not only by the model's own parser. The schema requires a non-empty summary, 1–15 keywords and 1–10 questions, each with at least one Hebrew letter. LangChain's fake model in the tests does not check its replies, and a `refine` (the Hebrew check) is never sent to the model, so only zod can run it.
  - **One retry.** A reply that does not match, or a call that throws (a network error, or a reply that is not JSON), is tried once more. If the second try also fails, the Directive is still stored, with `enrichment_error` set and no enrichment: it can still be found by its title, code and headings, and read.
  - **Enrichment failures have their own 20% rule.** A failed enrichment is not a rejected file, but if more than 20% of them fail, the LLM is down or the key has run out, and the new store would be worse than the old one. Then ingest keeps the old store and exits with code 1, as it does for rejected files. One or two failures are logged and the run goes on.
  - **The model gets the code, the title and up to 20,000 characters of the plain text** (the HTML with its tags removed by `htmlToText`, which moved from the API to `libs/sanitize` so ingest can use it too). Most Directives are shorter. For the longest ones, the opening already says what they are about, and the limit keeps their cost close to the rest. The instructions and the field descriptions are in Hebrew, so the model answers in Hebrew.
  - **temperature 0**, so a re-run gives (nearly) the same enrichment.
  - **The model names were checked against the key** on 2026-11-24: `gemini-3.6-flash` answers `generateContent` and `gemini-embedding-001` answers `embedContent` (3,072 dimensions), so `.env.example` keeps them. One real call takes about 8 seconds, and the full run of 30 enriched all 30 with no failures.
  - **The enrichment is stored as columns of `directives`** (`summary`, `keywords`, `questions` as JSON, `enrichment_error`), and `Store` returns them as one `enrichment` object or `null`. That way a Directive has all three parts or none.
  - **The API sends only the summary** (`summary` in `GET /api/directives/:code`, `null` when enrichment failed). The keywords and questions are only for search.
  - **The viewer shows the summary at the top**, under the title, in a box labelled "תקציר" (summary) with the note "נכתב על ידי מודל שפה. הנוסח המחייב הוא נוסח ההוראה." (written by a language model; the Directive's own wording is what binds). There is no box when enrichment failed.
  - **The plan put keywords above headings in the weights; this issue put all of the enrichment below them.** We follow the issue: the headings are the Directive's own text, while the enrichment is the model's reading of it.
  - **What it fixed on the real data:** neither Expired Directive has keywords on the site. Now `עלויות` (costs) finds HZ.13.10.1.1 and `ייעודיות` (dedicated) finds HOD.13.5.1.1. Each word is only in the Directive's summary, not in its title, text, keywords or questions. `apps/api/src/search/committed-store.spec.ts` checks this on the committed store, and also checks that the word stops finding the Directive once its summary is removed. Finding the words took a test, not a text search: a word can look absent but still match after normalization or as a typo (`להתקנה` did).
  - **`libs/llm` has no tests of its own** (`passWithNoTests` in its Vitest config). Enrichment is tested where ingest uses it, with the fake model, which is the seam the issue named. A second set of tests on the lib would test the same behaviour twice.
  - **`data/export/` holds one JSON file per Directive** (`npm run export`), with every stored field and the HTML last, so the enrichment can be shown without opening SQLite. The files are a committed copy for people to read; the app reads only `data/takam.db`. Run the export again after each ingest.
  - **`.env` is read by ingest with Node's own `process.loadEnvFile`**, so there is no dotenv dependency. A variable already set in the shell wins.
- **Vitest runs once, not in watch mode** (`testMode: "run"` in `nx.json`), so `npm test` finishes.

### Tests and CI
`npm test` runs every test project:
- **Unit tests (Vitest):**
  - `isInForce` and the other `libs/*` code
  - the ingest security gate
  - the ingest conversion: the heading style map, on tiny Word files built in the test
  - the sanitizer in `libs/sanitize` (`<script>`, `onerror`, `javascript:` links)
  - search (`libs/search`): whole words, the "רכב" trap, code lookup, Hebrew spellings (full/short, prefixes, quotes, niqqud), typos, the in-force default, the inclusive valid-to boundary, a future valid-from, snippets, the limit, an empty query, and the enrichment (both Expired Directives found by a summary word, enrichment ranked below headings)
  - ingest with LangChain's fake chat model: an invalid first reply followed by a valid retry is accepted, two bad replies (one not JSON, one not Hebrew) are stored as an enrichment failure, and more than 20% failures keep the old store
  - the web pages, rendered for real with only `fetch` faked
- **Integration tests (Jest, `apps/api`):** each one starts the whole Nest app on a random port, on an in-memory or temporary SQLite file, and calls it with `fetch`. They also check the CSP header, that unsafe HTML in the store is sent sanitized, that "רכב" does not put the trap H.1.1.1 first, and that every search writes a row to the search log. One more test reads a copy of the committed store and checks that both Expired Directives are found by a word only their summary has.

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
