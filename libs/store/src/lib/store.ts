import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DirectiveType } from '@takam/shared';
import { SCHEMA } from './schema.js';

/**
 * Where the store lives when DB_PATH is not set, for both ingest and the API.
 * Relative to the folder they are started from: the repo root with npm run.
 */
export const DEFAULT_DB_PATH = 'data/takam.db';

/**
 * One Directive as ingest stores it. The API adds the fields that depend on
 * the day of the request (In force) or are derived from the code (the URL).
 */
export interface StoredDirective {
  code: string;
  title: string;
  type: DirectiveType;
  chapterPath: string[];
  edition: number;
  validFrom: string | null;
  validTo: string | null;
  html: string;
}

/** One row of the search log: what was searched, and how many results it got. */
export interface SearchLogEntry {
  query: string;
  /** true when the search showed only In-force Directives. */
  inForceOnly: boolean;
  resultCount: number;
  /** ISO 8601 timestamp. */
  searchedAt: string;
}

/** A directives row as SQLite returns it: chapter_path is still JSON text. */
type DirectiveRow = Omit<StoredDirective, 'chapterPath'> & {
  chapterPath: string;
};

/** The columns of `directives`, renamed to the field names of StoredDirective. */
const DIRECTIVE_COLUMNS = `code, title, type, chapter_path AS chapterPath, edition,
  valid_from AS validFrom, valid_to AS validTo, html`;

/** chapter_path is stored as JSON text; turn it back into an array. */
function toStoredDirective(row: DirectiveRow): StoredDirective {
  return { ...row, chapterPath: JSON.parse(row.chapterPath) };
}

/**
 * The SQLite store (ADR 0003): ingest writes to it, the API reads from it.
 * `path` is a file path, or ":memory:" for a throwaway database in tests.
 */
export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  /** Adds a Directive, or replaces the one with the same code. */
  saveDirective(directive: StoredDirective): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO directives
           (code, title, type, chapter_path, edition, valid_from, valid_to, html)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        directive.code,
        directive.title,
        directive.type,
        JSON.stringify(directive.chapterPath),
        directive.edition,
        directive.validFrom,
        directive.validTo,
        directive.html,
      );
  }

  /** The Directive with this Document code, or null if there is none. */
  findDirective(code: string): StoredDirective | null {
    const row = this.db
      .prepare(`SELECT ${DIRECTIVE_COLUMNS} FROM directives WHERE code = ?`)
      .get(code) as DirectiveRow | undefined;
    return row ? toStoredDirective(row) : null;
  }

  /** Every Directive in the store, in code order (the API indexes them all). */
  listDirectives(): StoredDirective[] {
    const rows = this.db
      .prepare(`SELECT ${DIRECTIVE_COLUMNS} FROM directives ORDER BY code`)
      .all() as DirectiveRow[];
    return rows.map(toStoredDirective);
  }

  /** How many Directives are in the store. */
  countDirectives(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM directives')
      .get() as { count: number };
    return row.count;
  }

  /** Notes that an ingest run finished at `finishedAt` (ISO 8601). */
  recordIngestRun(finishedAt: string): void {
    this.db
      .prepare('INSERT INTO ingest_runs (finished_at) VALUES (?)')
      .run(finishedAt);
  }

  /** When the last ingest finished (ISO 8601), or null if it never ran. */
  lastIngestFinishedAt(): string | null {
    const row = this.db
      .prepare('SELECT MAX(finished_at) AS finishedAt FROM ingest_runs')
      .get() as { finishedAt: string | null };
    return row.finishedAt;
  }

  /** Adds one search to the search log. */
  logSearch(entry: SearchLogEntry): void {
    this.db
      .prepare(
        `INSERT INTO search_log (query, in_force_only, result_count, searched_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        entry.query,
        entry.inForceOnly ? 1 : 0, // SQLite has no boolean type
        entry.resultCount,
        entry.searchedAt,
      );
  }

  /** The whole search log, oldest first. */
  searchLog(): SearchLogEntry[] {
    const rows = this.db
      .prepare(
        `SELECT query, in_force_only AS inForceOnly, result_count AS resultCount,
                searched_at AS searchedAt
         FROM search_log ORDER BY id`,
      )
      .all() as (Omit<SearchLogEntry, 'inForceOnly'> & {
      inForceOnly: number;
    })[];
    return rows.map((row) => ({ ...row, inForceOnly: row.inForceOnly === 1 }));
  }

  close(): void {
    this.db.close();
  }
}
