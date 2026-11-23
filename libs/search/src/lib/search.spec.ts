import { DirectiveSearch, type SearchableDirective } from './search.js';

// Fixtures modelled on the real Directives in data/takam.db (titles and
// headings copied or shortened). Dates are chosen for the validity tests.
const directive = (
  fields: Partial<SearchableDirective> & Pick<SearchableDirective, 'code'>,
): SearchableDirective => ({
  title: '',
  type: 'Instruction',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות'],
  validFrom: '2020-01-01',
  validTo: null,
  headings: [],
  excerpt: '',
  ...fields,
});

/** The trap: "הרכב התקציב" means the composition of the budget, not a car. */
const budgetTerms = directive({
  code: 'H.1.1.1',
  title: 'מונחון לביאור מושגי התקציב',
  chapterPath: ['1 תקציב'],
  headings: ['שלבי הכנת ואישור התקציב', 'הרכב התקציב', 'מבנה התקציב'],
  excerpt: 'תקציב המדינה נקבע ומבוצע על בסיס חוקים',
});
const carInsurance = directive({
  code: 'HOD.13.4.1.2',
  title: 'ביטוח רכב לעובדי מדינה לשנת 2027 - בעלי רכב שירות או אחר',
  type: 'Message',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.4 נסיעות בתפקיד בארץ'],
  validTo: '2027-12-31',
  headings: ['מבוא', 'השתתפות בביטוח הרכב', 'תשלום הביטוח'],
  excerpt: 'במכרז שערך אגף החשב הכללי לביטוח רכבם של עובדי המדינה',
});
const carExpenses = directive({
  code: 'H.13.4.1',
  title: 'החזר הוצאות נסיעה בתפקיד ברכב פרטי',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.4 נסיעות בתפקיד בארץ'],
  headings: ['מבוא', 'רמת ניידות והחזר הוצאות רכב'],
});
const flights = directive({
  code: 'H.13.10.1',
  title: 'טיסות ושירותים נלווים לנסיעות בתפקיד לחוץ לארץ',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.10 נסיעות בתפקיד לחוץ לארץ'],
  headings: ['מבוא', 'הנחיות לביצוע'],
  excerpt: 'הזמנת שירותי נסיעות לחוץ לארץ תבוצע באמצעות סוכנות הנסיעות',
});
const perDiem = directive({
  code: 'H.13.10.2',
  title: 'נסיעות בתפקיד - קצובות שהייה, לינה והחזרי הוצאות בחוץ לארץ',
  chapterPath: flights.chapterPath,
});
/** Expired in 2022. */
const covidFlights = directive({
  code: 'HZ.13.10.1.1',
  title: "נסיעות בתפקיד לחו''ל בתקופת קורונה",
  type: 'Temporary Instruction',
  chapterPath: flights.chapterPath,
  validTo: '2022-06-01',
});
/** In force up to and including 2026-12-31. */
const perDiemRates = directive({
  code: 'HOD.13.10.2.2',
  title: 'תעריפי קצובות שהייה ולינה בחוץ לארץ',
  type: 'Message',
  chapterPath: flights.chapterPath,
  validTo: '2026-12-31',
});
/** Not in force yet: starts in 2027. */
const futureRates = directive({
  code: 'HOD.13.3.1.1',
  title: 'תעריפי קצובת הבראה',
  type: 'Message',
  validFrom: '2027-01-01',
});

const index = new DirectiveSearch([
  budgetTerms,
  carInsurance,
  carExpenses,
  flights,
  perDiem,
  covidFlights,
  perDiemRates,
  futureRates,
]);

const TODAY = '2026-11-23';

/** The codes of the results, in rank order. */
function codesFor(
  query: string,
  options: { inForce?: boolean; today?: string } = {},
) {
  return index
    .search(query, { today: TODAY, ...options })
    .map((result) => result.code);
}

describe('DirectiveSearch', () => {
  it('ranks the real car Directives above the "הרכב התקציב" trap for "רכב"', () => {
    const codes = codesFor('רכב');

    expect(codes).toContain('HOD.13.4.1.2');
    expect(codes).toContain('H.13.4.1');
    // The trap may appear once prefixes are stripped (issue #7), but never
    // above a real car Directive.
    const trap = codes.indexOf('H.1.1.1');
    if (trap !== -1) {
      expect(codes.indexOf('HOD.13.4.1.2')).toBeLessThan(trap);
      expect(codes.indexOf('H.13.4.1')).toBeLessThan(trap);
    }
  });

  it('matches whole words only: part of a word finds nothing', () => {
    // "נסיע" is the start of "נסיעות" (trips), which many titles contain.
    expect(codesFor('נסיע')).toEqual([]);
  });

  it('finds a Directive by its code, with or without the prefix', () => {
    expect(codesFor('13.10.1')).toEqual(['H.13.10.1']);
    expect(codesFor('H.13.10.1')).toEqual(['H.13.10.1']);
  });

  describe('validity', () => {
    it('hides Expired Directives by default', () => {
      expect(codesFor('בתפקיד')).not.toContain('HZ.13.10.1.1');
    });

    it('includes Expired Directives on request, below the In-force ones', () => {
      const results = index.search('בתפקיד', { today: TODAY, inForce: false });

      expect(results.map((r) => r.code)).toContain('HZ.13.10.1.1');
      // Validity first: every In-force result comes before every expired one.
      const firstExpired = results.findIndex((r) => !r.inForce);
      expect(results.slice(firstExpired).every((r) => !r.inForce)).toBe(true);
      expect(results.at(-1)).toMatchObject({
        code: 'HZ.13.10.1.1',
        inForce: false,
      });
    });

    it('counts the valid-to date itself as In force (inclusive)', () => {
      expect(codesFor('קצובות', { today: '2026-12-31' })).toContain(
        'HOD.13.10.2.2',
      );
      expect(codesFor('קצובות', { today: '2027-01-01' })).not.toContain(
        'HOD.13.10.2.2',
      );
    });

    it('keeps a Directive with no valid-to date In force', () => {
      expect(codesFor('קצובות', { today: '2099-01-01' })).toContain(
        'H.13.10.2',
      );
    });

    it('hides a Directive whose valid-from date is still to come', () => {
      expect(codesFor('הבראה')).toEqual([]);
      expect(codesFor('הבראה', { today: '2027-01-01' })).toEqual([
        'HOD.13.3.1.1',
      ]);
    });
  });

  it('returns everything the results page shows', () => {
    const [first] = index.search('תשלום', { today: TODAY });

    expect(first).toEqual({
      code: 'HOD.13.4.1.2',
      title: 'ביטוח רכב לעובדי מדינה לשנת 2027 - בעלי רכב שירות או אחר',
      type: 'Message',
      chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.4 נסיעות בתפקיד בארץ'],
      inForce: true,
      validTo: '2027-12-31',
      // The heading that matched explains why this Directive was found.
      snippet: 'תשלום הביטוח',
      score: expect.any(Number),
    });
  });

  it('uses the opening of the text as the snippet when no heading matched', () => {
    const [first] = index.search('טיסות', { today: TODAY });

    expect(first.snippet).toBe(
      'הזמנת שירותי נסיעות לחוץ לארץ תבוצע באמצעות סוכנות הנסיעות',
    );
  });

  it('ranks a match in the title above a match in a heading only', () => {
    // "רכב" is in the title of HOD.13.4.1.2 but only in a heading of H.13.4.1.
    expect(codesFor('רכב').slice(0, 2)).toEqual(['HOD.13.4.1.2', 'H.13.4.1']);
  });

  it('returns at most `limit` results', () => {
    expect(index.search('בתפקיד', { today: TODAY, limit: 2 })).toHaveLength(2);
  });

  it.each(['', '   '])('returns nothing for an empty query (%j)', (query) => {
    expect(codesFor(query, { inForce: false })).toEqual([]);
  });
});
