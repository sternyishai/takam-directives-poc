#!/usr/bin/env tsx
// `npm run export`: writes every Directive in the store to its own readable
// JSON file, data/export/<code>.json, so what ingest stored (including the
// LLM enrichment) can be shown without opening SQLite. The store stays the
// only source the app reads; these files are a copy for people to look at.

import { DEFAULT_DB_PATH, Store } from '@takam/store';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;
/** Relative to the repo root, where npm run starts. */
const EXPORT_FOLDER = 'data/export';

const store = new Store(DB_PATH);
const directives = store.listDirectives();
store.close();

// Emptied first, so a Directive that left the store does not leave a file behind.
rmSync(EXPORT_FOLDER, { recursive: true, force: true });
mkdirSync(EXPORT_FOLDER, { recursive: true });

for (const directive of directives) {
  // The HTML goes last: it is long, and the fields above it (the
  // enrichment included) are what a reader looks for first.
  const { html, ...fields } = directive;
  // Indented by 2 spaces so it reads well; Hebrew is written as is, not escaped.
  const json = JSON.stringify({ ...fields, html }, null, 2);
  writeFileSync(join(EXPORT_FOLDER, `${directive.code}.json`), `${json}\n`);
}
console.log(`${directives.length} Directives written to ${EXPORT_FOLDER}/`);
