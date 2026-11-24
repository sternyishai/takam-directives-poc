# Build plan: Takam Directives POC

The result of the grilling session on 2026-11-23. Terms are in `GLOSSARY.md`, and the decisions with real trade-offs are in `docs/adr/`.
Work through the milestones in order. Each one ends with something that runs and is tested.

## Problem (for README Part A)
Employees can't reliably **find** the directive that applies to them, can't **read** it without downloading a Word file, and can't **trust** that it's still in force.
The evidence is in `docs/ux-findings.md`:
- search covers metadata only and matches substrings
- it has no typo tolerance
- results are an unranked tree
- reading a directive means downloading a `.docx`
- expired documents are unmarked (and the API's `isvalid` flag is inverted)
- the metadata is thin

## Stack and layout (Nx monorepo, TypeScript)
```
apps/web        React + Vite, Hebrew RTL, React Router
apps/api        NestJS: search, directives, chat, health
apps/ingest     Node CLI: fetch → security gate → convert → chunk → enrich → embed → SQLite
libs/search     Hebrew normalization + MiniSearch wrapper (pure TS)
libs/llm        LangChain models (Gemini + fake), enrichment chain, chat LangGraph, citation checker
libs/shared     types: Directive, SearchResult, ChatAnswer, Citation
data/takam.db   the only store (committed); data/raw/ is gitignored and never served
```
- LLM: Gemini via `@langchain/google-genai`.
- Config: `.env` holds `GOOGLE_API_KEY`, `LLM_MODEL` and `EMBEDDING_MODEL`. `.env.example` is committed.
- Tests: Vitest for libs and web, Jest for api (the Nx defaults).

## Data subset: 30 directives (in `apps/ingest/ingest.config.json`)
| Group | Codes | Demo / test purpose |
|---|---|---|
| Travel abroad | H.13.10.1, H.13.10.2, H.13.10.3, HOD.13.10.2.2 | Ranking similar titles; per-diem rates expire on 2026-12-31 (boundary) |
| Expired | HZ.13.10.1.1, HOD.13.5.1.1 | Hidden by default, red badge, chatbot warning; both have no keywords |
| "רכב" (car) | H.1.1.1 (trap), H.13.4.1, H.13.4.2, HOD.13.4.1.1, HOD.13.4.1.2 | Whole-word match: real car directives rank above the "הרכב התקציב" trap |
| "גמלאות" (pensions) | H.13.0.0, H.13.7.12 | "גימלאות" (variant spelling) must find both |
| Salary payments | H.13.1.1, H.13.1.2, H.13.1.3, H.13.1.4, H.13.1.5, H.13.1.6, H.13.1.10 | Neighbouring documents that search has to rank |
| Allowances | H.13.3.1, HOD.13.3.1.1, H.13.3.2, HOD.13.0.0.14 | Common chatbot questions (recuperation pay, clothing, vacation days) |
| Variety | H.13.2.1, H.13.2.2, H.13.7.1, H.13.8.1, H.13.12.1, H.13.13.1 | Spread across chapter 13 |

## Rules settled in the grilling
- **Directive** means an Instruction, Temporary Instruction or Message. Forms, tenders and attachments are out of scope.
- **In force** is computed from the dates, inclusive, with a null end date meaning no end. The API's `isvalid` is never used (ADR 0001).
- **Downloading a file:**
  1. `api/DocumentVersion/{sfid}` → the highest edition → `rtn_contentversionid__c`.
  2. `api/DocumentSF/DownloadDocument/{contentVersionId}/{code}`. The second segment must not be empty, or the site returns HTML.
- **Security gate.** Reject the file unless all of these hold:
  - the size is under 2 MB
  - the magic bytes are `PK` and the zip has `word/document.xml`
  - the zip has fewer than 200 entries and expands to under 20 MB

  Then:
  - Mammoth converts it with a Hebrew style map (`heading 1` / `נספח - כותרת` / `כות_1` → h2, and so on; see the README for the styles found in the real files) and drops images.
  - sanitize-html applies a tag allowlist.
  - The API sends a strict CSP header.
  - Ingest exits non-zero if more than 20% of files are rejected, and the old DB stays live.
- **Chunks:**
  - split at title paragraphs, capped at about 1,200 characters
  - a one-paragraph overlap only inside sections that are split by size
  - every chunk starts with a context line `code · title › section`
- **Enrichment:** one call per directive returns `{ summary, keywords[], questions[] }` through `withStructuredOutput(zod)`, with one retry. The output is in Hebrew.
- **Search:**
  - MiniSearch over title and code, then headings, then the enrichment (keywords, summary and questions), with weights in that order. Issue #9 put all of the enrichment below the headings, which are the Directive's own text.
  - Hebrew normalization: ״/" → ", ignore ו/י, strip one-letter prefixes ה/ב/ל/ו/מ/ש/כ
  - fuzzy matching on whole words
  - the default filter is "in force"
- **Chat** is a LangGraph: retrieve (MiniSearch over the chunks plus the chunks closest by embedding cosine, merged, top 5 passages; issue #11) → generate (`[n]` citations) → checkCitations. On a bad citation it retries once, then answers "לא מצאתי תשובה בהוראות" (I didn't find an answer in the directives). Each citation links to `/directive/:code`, and expired citations are flagged (ADR 0002).

## API and pages
- **API:**
  - `GET /api/search?q=&inForce=true&limit=` returns `{code, title, type, chapterPath, inForce, validTo, snippet, score}[]`. The dropdown uses `limit=3`.
  - `GET /api/directives/:code` returns the metadata, summary, sanitized HTML and the official site URL.
  - `POST /api/chat {question}` returns `{answer, citations: [{n, code, title, inForce}], found}`.
  - `GET /api/health` returns `{directives, indexSize, lastIngest}`.
- **Pages:**
  - `/`: the search box with the quick dropdown (fires about 150 ms after typing stops), the in-force filter, a flat ranked results list, and the chat panel
  - `/directive/:code`: the viewer, with the summary at the top, the HTML, a red banner if expired, and a "המקור באתר תכ"ם" (source on the Takam site) link

## Milestones (build order)
1. **Scaffold:** the Nx workspace, three apps, three libs, `.env.example`, lint and test running. A clean `.env` with only the three variables.
2. **libs/search:** the normalizer and search, written test-first with fixtures (the typo, רכב, גמלאות/גימלאות and expired cases). No network needed.
3. **apps/ingest, fetch + gate + convert:** download the 30 files. Tests for gate rejections (not a zip, HTML page, oversized, zip bomb, `<script>`/`onerror` stripped). Write the directives and their HTML to SQLite.
4. **apps/api:** search, directives and health on top of SQLite and MiniSearch, with one e2e test (`רכב` doesn't put 1.1.1 first).
5. **apps/web:** the search box and dropdown, the results list, the viewer and the filter. Hebrew RTL.
6. **libs/llm + ingest enrichment and embeddings:** first check the model names against the key. Commit the DB. Tests with the fake model.
7. **Chat:** the LangGraph, the citation checker (tests: an unknown `[n]`, no citations, an expired citation) and the chat panel.
8. **Docs and diagrams** (part of the submission, see "Deliverables"):
   - **The diagrams** (Excalidraw, exported as PNG into `docs/diagrams/`, with the `.excalidraw` source kept next to each). Each one is listed under Deliverables.
   - **`docs/production-hld.md`:** the production high-level design, covering:
     - **runtime:** API and web as containers on the organization's platform (OpenShift/Kubernetes), ingest as a nightly CronJob with an atomic DB swap, Postgres + pgvector, an object store for the HTML
     - **security:** SSO, secrets from a vault, a virus scan in the gate, network egress limited to the Takam site and the LLM endpoint
     - **CI/CD:** `nx affected -t lint test build`, image build, deploy
     - **how to verify a deployment:** `/health`, a smoke query, the readiness probe
     - **observability and alerts:** ingest rejection rate, rate of 0-result searches, chat errors, LLM latency and cost
     - **failure scenario and how to roll back:** the Sucuri challenge page means every file is rejected → ingest fails → the old DB stays live → an alert fires
     - **scale:** all chapters, incremental ingest keyed by edition number, LLM cost limits
   - **The README:**
     - Part A (problem, solution, design, plus the POC diagram)
     - Part B (install, run, test)
     - Part C (short answers that link to the HLD)
9. **Video** (only after the prototype works): 30 s of the live site failing, about 110 s of our app, 40 s of the architecture.
10. **Hebrew ADRs:** after everything else, write a Hebrew version of each ADR in `docs/adr/he/`.

## Deliverables (what gets submitted)
| # | Deliverable | Where |
|---|---|---|
| 1 | Source code and sample data (`data/takam.db`), plus `.env.example` | repo |
| 2 | README: problem, solution, architecture, install and run, tests, Part C | `README.md` |
| 3 | Production HLD | `docs/production-hld.md` |
| 4 | Diagram: POC architecture (UI / API / data / ingest, and the components in each) | `docs/diagrams/poc-architecture.png` |
| 5 | Diagram: production architecture (the HLD's target state) | `docs/diagrams/production-architecture.png` |
| 6 | Diagram: ingest pipeline (fetch → gate → convert → chunk → enrich → embed → SQLite, and the points where a file is rejected) | `docs/diagrams/ingest-pipeline.png` |
| 7 | Diagram: the chat flow as a LangGraph (retrieve → generate → checkCitations, with the retry and fallback) | `docs/diagrams/chat-flow.png` |
| 8 | Decision records in English, plus Hebrew versions | `docs/adr/`, `docs/adr/he/` |
| 9 | Video, up to 3 minutes | link in the README |

## Not done (explained in the README)
- section deep links
- streaming and chat history
- attachments, forms and tenders
- comparing editions
- fixing the site's tree and mobile layout
- virus scanning
- vector DB
- full accessibility for the dropdown
- other chapters
