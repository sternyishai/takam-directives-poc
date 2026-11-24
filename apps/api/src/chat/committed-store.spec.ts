import { PassageSearch } from '@takam/search';
import { Store } from '@takam/store';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toSearchableChunks } from './searchable-chunks';

/**
 * A question and its vector, recorded once from Gemini (gemini-embedding-001,
 * RETRIEVAL_QUERY, 768 numbers), so the test needs no key or network.
 * Record it again if the embedding model or its settings change.
 */
const perDiemQuestion = JSON.parse(
  readFileSync(join(__dirname, 'testing/per-diem-question.json'), 'utf8'),
) as { question: string; embedding: number[] };

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
    // The top 5, as the chatbot keeps them.
    const found = passages
      .search('מה התעריף לקצובת הבראה?', '2026-11-24')
      .slice(0, 5);

    expect(found).toHaveLength(5);
    // The rates (HOD.13.3.1.1) and how they are paid (H.13.3.1), and nothing else.
    expect(new Set(found.map((passage) => passage.code))).toEqual(
      new Set(['H.13.3.1', 'HOD.13.3.1.1']),
    );
    // The amount itself, 511.6 ₪ a day in 2026, is in one of the passages.
    expect(found.some((passage) => passage.text.includes('511.6'))).toBe(true);
  });

  it('gives the per-diem rates abroad (HOD.13.10.2.2) for a question worded differently', () => {
    // "What daily sum is paid to an employee sent to New York?" The
    // Directive says "קצובת שהייה" (subsistence allowance) "בחוץ לארץ"
    // (abroad), and names the city in English: no word in common.
    const { question, embedding } = perDiemQuestion;
    const codesOf = (found: { code: string }[]) =>
      found.slice(0, 5).map((passage) => passage.code);

    const byWords = codesOf(passages.search(question, '2026-11-24'));
    const hybrid = codesOf(passages.search(question, '2026-11-24', embedding));

    expect(byWords).not.toContain('HOD.13.10.2.2');
    expect(hybrid).toContain('HOD.13.10.2.2');
  });
});
