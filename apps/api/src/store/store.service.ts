import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from './schema';

/**
 * Where the store lives when DB_PATH is not set. The path is relative to the
 * folder the API is started from: the repo root with `npm run api`.
 */
const DEFAULT_DB_PATH = 'data/takam.db';

/** Opens the SQLite store once, when the API starts, and closes it on shutdown. */
@Injectable()
export class StoreService implements OnModuleDestroy {
  private readonly db: DatabaseSync;

  constructor() {
    const path = process.env.DB_PATH ?? DEFAULT_DB_PATH;
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  /** How many Directives are in the store. */
  countDirectives(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM directives')
      .get() as { count: number };
    return row.count;
  }

  /** When the last ingest finished (ISO 8601), or null if it never ran. */
  lastIngestFinishedAt(): string | null {
    const row = this.db
      .prepare('SELECT MAX(finished_at) AS finishedAt FROM ingest_runs')
      .get() as { finishedAt: string | null };
    return row.finishedAt;
  }

  onModuleDestroy() {
    this.db.close();
  }
}
