/**
 * The SQLite schema (see docs/adr/0003). `IF NOT EXISTS` makes it safe to run
 * on every start: an empty file gets the tables, an existing one is untouched.
 * Later milestones add columns and tables (HTML, enrichment, chunks).
 */
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS directives (
    code       TEXT PRIMARY KEY,  -- Document code, e.g. H.13.10.1
    title      TEXT NOT NULL,
    type       TEXT NOT NULL,     -- Directive type: Instruction, Temporary Instruction or Message
    valid_from TEXT,              -- ISO date
    valid_to   TEXT               -- ISO date; NULL means no end (ADR 0001)
  );

  CREATE TABLE IF NOT EXISTS ingest_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    finished_at TEXT NOT NULL     -- ISO 8601 timestamp
  );
`;
