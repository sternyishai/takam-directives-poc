import { PassageSearch } from '@takam/search';
import { Store } from '@takam/store';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toSearchableChunks } from './searchable-chunks';

/**
 * The chatbot's retrieval over the committed store (data/takam.db): the
 * real chunks of the 30 Directives, indexed the way ChatService does.
 */
describe('retrieval over the committed store', () => {
  let passages: PassageSearch;

  beforeAll(() => {
    // A copy, so the test never touches the committed file.
    const folder = mkdtempSync(join(tmpdir(), 'takam-committed-'));
    const copy = join(folder, 'takam.db');
    copyFileSync(join(__dirname, '../../../../data/takam.db'), copy);
    const store = new Store(copy);
    passages = new PassageSearch(
      toSearchableChunks(store.listDirectives(), store.listChunks()),
    );
    store.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('gives the recuperation-pay Directives for "מה התעריף לקצובת הבראה?"', () => {
    const found = passages.search('מה התעריף לקצובת הבראה?', {
      today: '2026-11-24',
    });

    expect(found).toHaveLength(5);
    // The rates (HOD.13.3.1.1) and how they are paid (H.13.3.1), and nothing else.
    expect(new Set(found.map((passage) => passage.code))).toEqual(
      new Set(['H.13.3.1', 'HOD.13.3.1.1']),
    );
    // The amount itself, 511.6 ₪ a day in 2026, is in one of the passages.
    expect(found.some((passage) => passage.text.includes('511.6'))).toBe(true);
  });
});
