# Handoff: grilling session for the Takam Directives POC

Use this file to start the grilling session (`/grill-with-docs`, or `/grilling` if that skill is not installed).
The goal of that session is to settle the stack, scope and data subset, and record each decision as an ADR.

## Read first
- `CLAUDE.md`: the author is learning React and must be able to explain every line. Keep code simple, and record decisions.
- `docs/assignment.md`: the brief (4–6 hours; Parts A, B and C; a video of up to 3 minutes).
- `docs/site-research.md`: the site's JSON API.
- `docs/ux-findings.md`: UX gaps on the live site, with evidence you can reproduce. This is the basis for the problem statement.

## The problem
Employees can't reliably **find** the directive that applies to them, can't **read** it without downloading a Word file, and can't **trust** that it's still in force.

Key evidence (details in `docs/ux-findings.md`):
- Search covers metadata only. Phrases inside a directive's file return 0 results.
- It matches substrings, so "רכב" (car) matches "הרכב התקציב" (budget composition).
- One typo or a spelling variant gives 0 results ("גימלאות" vs "גמלאות").
- Results are a tree with no ranking and no snippets.
- Reading a directive means downloading a `.docx`.
- Expired documents are not marked in the result rows, and the validity filter defaults to "all".
- The metadata is thin: 696 of 1,127 records have no keywords, and tags are empty.

## Decisions already made
- **No lock-in to one LLM vendor.** The app calls our own `LlmClient` interface. There is one adapter per provider, plus a fake adapter for tests, and config chooses the provider. We don't use any provider's built-in citations feature.
- **Enrichment runs offline at ingest, not at search time.** Its output is committed as JSON, so search runs with no API key.
- **The search results table does not change while the user types.** Only the quick-search dropdown updates live.

## Must have (core POC)
- **Ingest script, run offline:** download a small set of directives (e.g. one chapter) through the site's API.
- **Security gate on every file:**
  - check the real file type (magic bytes) and the size
  - convert the `.docx` to HTML without running anything inside the file (e.g. mammoth)
  - sanitize the HTML
  - serve only the converted output, never the original file
- **LLM enrichment:** one call per directive returns `{ summary, keywords[], questions[] }`. The output is checked against a schema (e.g. zod), with one retry if it doesn't match.
- **Search without AI:**
  - Hebrew normalization: ״ vs ", vowel letters ו/י, one-letter prefixes ה/ב/ל/ו/מ/ש
  - typo-tolerant fuzzy matching
  - whole-word matching
  - searches over title, keywords, headings from the file, summary and questions
- **Quick-search dropdown:** while typing (about 150ms after the user pauses), show the top 3 matches with number, title and validity badge. Clicking a match opens its viewer. Enter or the search icon shows the full table. Both views use the same `search()` function.
- **Full results as a flat ranked list:** each result shows its chapter path (e.g. 13 › 13.10 › 13.10.1), a snippet showing why it matched, and a "לא בתוקף" (not in force) badge.
- **Directive viewer in the browser:** no download.
- **Validity first:** the filter defaults to "in force", and expired documents are clearly marked everywhere.
- **Tests:**
  - Hebrew normalization
  - typos and spelling variants
  - the "רכב" false positive
  - expired documents
  - security-gate rejections (wrong file type, oversized file, dangerous HTML)

## Stretch
- **RAG chatbot for "how do I…?" questions:**
  1. Our own search finds the top 3–5 directives.
  2. The LLM gets numbered passages `[1]..[n]` and must cite by number.
  3. Code checks that every cited number exists and turns it into a link to the viewer.
- It answers only from the sources, says so when they don't cover the question, and flags any expired directive it cites.

## Out of scope (explained in the README)
- Fixing the existing site's chapter tree and mobile layout.
- Comparing versions of a directive.
- Embeddings and a vector database (the production upgrade for retrieval).
- Virus scanning (a production step for the security gate).

## Deliverables beyond code
- **Architecture diagram in Excalidraw** (use the `excalidraw-skill` skill). Show the components in each layer:
  - **UI:** search box with the quick dropdown, results list, directive viewer, chatbot panel
  - **Backend:** search API, directive API, chat API, `LlmClient` and its adapters
  - **Data / DB:** the enriched index, converted HTML, and whatever store the grilling chooses
  - **Ingest pipeline:** fetch from the Takam API, security gate, convert, enrich
  
  Export it as PNG/SVG into `docs/` and embed it in the README.
- **Video (up to 3 minutes)** for the submission. The `anidoodle` skill can make an animated explainer of the problem and the architecture. The brief asks to show the solution *in action*, so pair that with a screen recording of the real app (e.g. `playwright-cli video-start`). Decide the split during planning.

## Open questions for the grilling
1. **Stack:** React + Vite on the frontend? Node (Express) or Python (FastAPI) on the backend? Or no backend for search at all?
2. **Storage:** a JSON file loaded into memory, or SQLite? Is a DB needed at this data size?
3. **Data subset:** which chapter, and how many directives? Chapter 13 has the travel and salary examples.
4. **Fuzzy search:** a library (e.g. Fuse.js) or a hand-written scorer? It has to be explainable either way.
5. **Quick-search dropdown:** a headless library (e.g. Downshift) or minimal hand-written keyboard support?
6. **LLM provider** for the demo and for enrichment. Does a local model (Ollama) handle Hebrew well enough?
7. **RAG:** core or stretch, given 4–6 hours?
8. **Language:** Hebrew-only RTL UI?
9. **Part C answers:** deployment, how to verify it worked, and one failure scenario. Sketch them now, so the design supports them.
