#!/usr/bin/env tsx
// The line above lets the file run directly with tsx (TypeScript, no build step).
// The line below tells Nx to add a `serve` target that runs this file: `nx serve ingest`.
// @nx-target-name: serve
//
// The ingest CLI. For now: fetch → security gate → convert → SQLite, for the
// Document codes given on the command line, e.g.
//   npm run ingest -- H.13.10.1
// Chunking, enrichment and embeddings come in later milestones (docs/plan.md).

import { DIRECTIVE_TYPES, type DirectiveType } from '@takam/shared';
import { DEFAULT_DB_PATH, Store } from '@takam/store';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertToHtml } from './convert';
import { checkFile } from './gate';
import {
  chapterPathOf,
  downloadFile,
  fetchDocumentList,
  fetchLatestEdition,
  toIsoDate,
  type SiteDocument,
} from './takam-site';

const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;
/** Raw downloads are kept here for debugging; gitignored and never served. */
const RAW_FOLDER = 'data/raw';

function isDirectiveType(type: string): type is DirectiveType {
  return (DIRECTIVE_TYPES as readonly string[]).includes(type);
}

/** Ingests one Directive into the store. Throws an Error with the reason if it can't. */
async function ingestDirective(
  code: string,
  documents: SiteDocument[],
  store: Store,
): Promise<void> {
  const document = documents.find((d) => d.documentcodetext === code);
  if (!document) {
    throw new Error('no Document with this code on the site');
  }
  const type = document.documenttype;
  if (!isDirectiveType(type)) {
    throw new Error(`a ${type}, not a Directive`);
  }

  const edition = await fetchLatestEdition(document.sfid);
  const file = await downloadFile(edition.rtn_contentversionid__c, code);

  const gate = await checkFile(file);
  if (!gate.ok) {
    throw new Error(`rejected by the gate: ${gate.reason}`);
  }
  mkdirSync(RAW_FOLDER, { recursive: true });
  writeFileSync(join(RAW_FOLDER, `${code}.docx`), file);

  store.saveDirective({
    code,
    title: document.name,
    type,
    chapterPath: chapterPathOf(document, documents),
    edition: edition.rtn_versionnumber__c,
    validFrom: toIsoDate(edition.rtn_validfrom__c),
    validTo: toIsoDate(edition.rtn_validto__c),
    html: await convertToHtml(file),
  });
}

async function main() {
  const codes = process.argv.slice(2);
  if (codes.length === 0) {
    console.error('Usage: npm run ingest -- <Document code> [more codes…]');
    process.exit(2);
  }

  const store = new Store(DB_PATH);
  const documents = await fetchDocumentList();
  let failures = 0;

  for (const code of codes) {
    try {
      await ingestDirective(code, documents, store);
      console.log(`✓ ${code}`);
    } catch (error) {
      failures++;
      console.error(`✗ ${code}: ${(error as Error).message}`);
    }
  }

  store.recordIngestRun(new Date().toISOString());
  store.close();
  console.log(
    `${codes.length - failures} of ${codes.length} stored in ${DB_PATH}`,
  );
  // A non-zero exit code tells scripts (and CI) that something was rejected.
  if (failures > 0) process.exitCode = 1;
}

main();
