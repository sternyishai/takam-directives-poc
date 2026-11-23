#!/usr/bin/env tsx
// The line above lets the file run directly with tsx (TypeScript, no build step).
// The line below tells Nx to add a `serve` target that runs this file: `nx serve ingest`.
// @nx-target-name: serve
//
// The ingest CLI: `npm run ingest`. It ingests every Document code listed in
// apps/ingest/ingest.config.json into a new store (ingest.ts has the steps).
// Chunking, enrichment and embeddings come in later milestones (docs/plan.md).

import { DEFAULT_DB_PATH } from '@takam/store';
import { readFileSync } from 'node:fs';
import { runIngest } from './ingest';
import {
  downloadFile,
  fetchDocumentList,
  fetchLatestEdition,
} from './takam-site';

const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;
/** Relative to the repo root, where npm run starts. */
const CONFIG_PATH = 'apps/ingest/ingest.config.json';

async function main() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as {
    codes: string[];
  };

  const result = await runIngest(config.codes, DB_PATH, {
    fetchDocumentList,
    fetchLatestEdition,
    downloadFile,
  });

  // A non-zero exit code tells scripts (and CI) that the run failed and the
  // old store was kept.
  if (!result.replacedStore) process.exitCode = 1;
}

main();
