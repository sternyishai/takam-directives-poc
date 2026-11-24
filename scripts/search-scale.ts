// How the in-memory search would cope with production sizes (issue #34).
// Run with `npm run bench:search`. It reads a copy of data/takam.db and
// changes nothing.
//
// The 30 stored Directives are copied until there are as many as production
// might hold. Each copy gets 40 made-up words that no other copy has, so the
// vocabulary grows with the number of Directives, as it would with real
// text. Fuzzy matching costs more the more distinct words there are.
// The chunks are copied the same way, with their real 768-number vectors.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DirectiveSearch,
  PassageSearch,
  type SearchableChunk,
} from '@takam/search';
import { Store } from '@takam/store';
import { toSearchable } from '../apps/api/src/search/searchable';

const TODAY = '2026-11-24';
const QUERIES = [
  'גימלאות', // the full spelling of גמלאות
  'רכבב', // one letter too many
  'נסיעות לחול',
  'קצובת הבראה',
  '13.10.1',
  'תשלום שכר',
];
const LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';

// A fixed seed, so every run makes the same words.
let seed = 1;
function random(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

function madeUpWord(): string {
  const length = 4 + Math.floor(random() * 5);
  let word = '';
  for (let i = 0; i < length; i++) {
    word += LETTERS[Math.floor(random() * LETTERS.length)];
  }
  return word;
}

/** Megabytes of heap in use, after a garbage collection when one is allowed. */
function heapMb(): number {
  (globalThis as { gc?: () => void }).gc?.();
  return process.memoryUsage().heapUsed / 1e6;
}

const folder = mkdtempSync(join(tmpdir(), 'search-scale-'));
const dbPath = join(folder, 'takam.db');
copyFileSync('data/takam.db', dbPath);
const store = new Store(dbPath);
const directives = store.listDirectives().map(toSearchable);
const chunks = store.listChunks();

console.log('Directive search (GET /api/search)');
for (const count of [30, 550, 5_000, 50_000]) {
  const before = heapMb();
  const copies = Array.from({ length: count }, (_, i) => {
    const directive = directives[i % directives.length];
    const words = Array.from({ length: 40 }, madeUpWord).join(' ');
    return {
      ...directive,
      code: i < directives.length ? directive.code : `${directive.code}.${i}`,
      headings: [...directive.headings, words],
    };
  });
  let start = performance.now();
  const index = new DirectiveSearch(copies);
  const buildMs = performance.now() - start;
  const indexMb = heapMb() - before;

  const rounds = 20;
  start = performance.now();
  for (let round = 0; round < rounds; round++) {
    for (const query of QUERIES) {
      index.search(query, { today: TODAY, inForce: false });
    }
  }
  const queryMs = (performance.now() - start) / (rounds * QUERIES.length);
  console.log(
    `  ${count} Directives: build ${Math.round(buildMs)} ms, ` +
      `about ${Math.round(indexMb)} MB, one search ${queryMs.toFixed(1)} ms`,
  );
}

console.log('Passage search for the chat (keywords + vectors)');
const question = chunks[0].embedding ?? [];
for (const count of [376, 7_000, 50_000]) {
  const before = heapMb();
  const copies: SearchableChunk[] = Array.from({ length: count }, (_, i) => {
    const chunk = chunks[i % chunks.length];
    return { ...chunk, title: '', validFrom: null, validTo: null };
  });
  const passages = new PassageSearch(copies);
  const indexMb = heapMb() - before;

  const rounds = 10;
  const start = performance.now();
  for (let round = 0; round < rounds; round++) {
    passages.search('מה התעריף לקצובת הבראה?', TODAY, question);
  }
  const queryMs = (performance.now() - start) / rounds;
  console.log(
    `  ${count} chunks: about ${Math.round(indexMb)} MB, ` +
      `one retrieval ${queryMs.toFixed(1)} ms`,
  );
}

rmSync(folder, { recursive: true });
