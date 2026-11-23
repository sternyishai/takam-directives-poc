#!/usr/bin/env tsx
// The line above lets the file run directly with tsx (TypeScript, no build step).
// The line below tells Nx to add a `serve` target that runs this file: `nx serve ingest`.
// @nx-target-name: serve
//
// The ingest CLI: `npm run ingest`. It ingests every Document code listed in
// apps/ingest/ingest.config.json into a new store (ingest.ts has the steps).
// It needs GOOGLE_API_KEY and LLM_MODEL for enrichment, read from .env.

import { chatModelFromEnv } from '@takam/llm';
import { DEFAULT_DB_PATH } from '@takam/store';
import { existsSync, readFileSync } from 'node:fs';
import { runIngest } from './ingest';
import {
  downloadFile,
  fetchDocumentList,
  fetchLatestEdition,
} from './takam-site';

// Node's own .env reader: it adds the file's variables to process.env, and
// a variable already set in the shell wins. Relative to the repo root.
if (existsSync('.env')) process.loadEnvFile('.env');

const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;
/** Relative to the repo root, where npm run starts. */
const CONFIG_PATH = 'apps/ingest/ingest.config.json';

async function main() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as {
    codes: string[];
  };

  const result = await runIngest(
    config.codes,
    DB_PATH,
    {
      fetchDocumentList,
      fetchLatestEdition,
      downloadFile,
    },
    chatModelFromEnv(),
  );

  // A non-zero exit code tells scripts (and CI) that the run failed and the
  // old store was kept.
  if (!result.replacedStore) process.exitCode = 1;
}

main();
