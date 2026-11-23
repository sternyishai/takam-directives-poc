import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DirectiveType, Enrichment } from '@takam/shared';
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
  /** The LLM's summary, keywords and questions; null when enrichment failed. */
  enrichment: Enrichment | null;
  /** Why enrichment failed, or null when it did not. */
  enrichmentError: string | null;
}

/** One chunk of a Directive's text, as the chatbot's retrieval searches it. */
export interface StoredChunk {
  /** Document code of the Directive the chunk is from. */
  code: string;
  /** The chunk, starting with its context line "code · title › section". */
  text: string;
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

/**
 * A directives row as SQLite returns it: the arrays are still JSON text, and
 * the enrichment is three separate columns.
 */
type DirectiveRow = Omit<StoredDirective, 'chapterPath' | 'enrichment'> & {
  chapterPath: string;
  summary: string | null;
  keywords: string | null;
  questions: string | null;
};

/** The columns of `directives`, renamed to the field names of StoredDirective. */
const DIRECTIVE_COLUMNS = `code, title, type, chapter_path AS chapterPath, edition,
  valid_from AS validFrom, valid_to AS validTo, html,
  summary, keywords, questions, enrichment_error AS enrichmentError`;

/** Turns a row back into a StoredDirective: JSON text into arrays, and the three enrichment columns into one object. */
function toStoredDirective(row: DirectiveRow): StoredDirective {
  const { summary, keywords, questions, ...rest } = row;
  return {
    ...rest,
    chapterPath: JSON.parse(row.chapterPath),
    // All three are saved together, so a summary means the others are there.
    enrichment:
      summary === null
        ? null
        : {
            summary,
            keywords: JSON.parse(keywords as string),
            questions: JSON.parse(questions as string),
          },
  };
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
           (code, title, type, chapter_path, edition, valid_from, valid_to, html,
            summary, keywords, questions, enrichment_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        directive.enrichment?.summary ?? null,
        directive.enrichment
          ? JSON.stringify(directive.enrichment.keywords)
          : null,
        directive.enrichment
          ? JSON.stringify(directive.enrichment.questions)
          : null,
        directive.enrichmentError,
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

  /** Replaces the chunks of the Directive with this code, in their order. */
  saveChunks(code: string, texts: string[]): void {
    this.db.prepare('DELETE FROM chunks WHERE code = ?').run(code);
    const insert = this.db.prepare(
      'INSERT INTO chunks (code, position, text) VALUES (?, ?, ?)',
    );
    texts.forEach((text, position) => insert.run(code, position, text));
  }

  /** Every chunk in the store, each Directive's in order (the API indexes them all). */
  listChunks(): StoredChunk[] {
    // `unknown` first: TypeScript can't see that a row of two text columns
    // is a StoredChunk, so it refuses the direct cast.
    return this.db
      .prepare('SELECT code, text FROM chunks ORDER BY code, position')
      .all() as unknown as StoredChunk[];
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
