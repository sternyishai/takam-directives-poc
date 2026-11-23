import { DirectiveSearch } from '@takam/search';
import { Store, type StoredDirective } from '@takam/store';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toSearchable } from './searchable';

/**
 * The search over the committed store (data/takam.db), the real 30
 * Directives with their real enrichment. Neither Expired Directive has
 * keywords on the site; each must be found by a word that is only in the
 * summary the LLM wrote, not in its title, text, keywords or questions.
 */
describe('search over the committed store', () => {
  let directives: StoredDirective[];

  beforeAll(() => {
    // A copy, so the test never touches the committed file.
    const folder = mkdtempSync(join(tmpdir(), 'takam-committed-'));
    const copy = join(folder, 'takam.db');
    copyFileSync(join(__dirname, '../../../../data/takam.db'), copy);
    const store = new Store(copy);
    directives = store.listDirectives();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  });

  /** The codes a query finds, Expired Directives included. */
  function codesFor(all: StoredDirective[], query: string): string[] {
    return new DirectiveSearch(all.map(toSearchable))
      .search(query, { today: '2026-11-24', inForce: false })
      .map((result) => result.code);
  }

  /** The same Directives, with this one's summary removed. */
  function withoutSummary(code: string): StoredDirective[] {
    return directives.map((directive) =>
      directive.code === code && directive.enrichment
        ? { ...directive, enrichment: { ...directive.enrichment, summary: '' } }
        : directive,
    );
  }

  it.each([
    ['HZ.13.10.1.1', 'עלויות'], // costs
    ['HOD.13.5.1.1', 'ייעודיות'], // dedicated (guidelines)
  ])(
    'finds the Expired Directive %s by "%s", a word only its summary has',
    (code, word) => {
      expect(codesFor(directives, word)).toContain(code);
      // Proof that the summary is why: without it, the word does not find it.
      expect(codesFor(withoutSummary(code), word)).not.toContain(code);
    },
  );
});
