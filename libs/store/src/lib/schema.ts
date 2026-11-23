/**
 * The SQLite schema (see docs/adr/0003). `IF NOT EXISTS` makes it safe to run
 * on every start: an empty file gets the tables, an existing one is untouched.
 * Later milestones add columns and tables (enrichment, chunks).
 */
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS directives (
    code         TEXT PRIMARY KEY,  -- Document code, e.g. H.13.10.1
    title        TEXT NOT NULL,
    type         TEXT NOT NULL,     -- Directive type: Instruction, Temporary Instruction or Message
    chapter_path TEXT NOT NULL,     -- JSON array of Chapter labels, top level first
    edition      INTEGER NOT NULL,  -- the Edition number the HTML was converted from
    valid_from   TEXT,              -- ISO date
    valid_to     TEXT,              -- ISO date; NULL means no end (ADR 0001)
    html         TEXT NOT NULL      -- the text, converted from the Word file
  );

  CREATE TABLE IF NOT EXISTS ingest_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    finished_at TEXT NOT NULL     -- ISO 8601 timestamp
  );
`;
