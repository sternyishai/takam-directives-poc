// Words: how text is cut into words and how each word is normalized. The
// Directive search and the passage search use the same rules, so a word is
// matched the same way in both.

/**
 * Splits text into words. A word ends at a space or at punctuation, so
 * "שהייה, לינה" gives "שהייה" and "לינה". Dots and quotes inside a word are
 * kept, so a code like "13.10.1" and an abbreviation like צה"ל stay one word;
 * at the edges of a word they are dropped ("סוף." → "סוף", "\"מגדל\"" → "מגדל").
 */
export function splitWords(text: string): string[] {
  return text
    .split(/[\s,;:!?()[\]{}<>«»\-–—/]+/u)
    .map((word) => word.replace(/^["'״׳.]+|["'״׳.]+$/gu, ''))
    .filter(Boolean);
}

/**
 * The words a Document code is found by: the whole code and the code without
 * its prefix letters. "H.13.10.1" → "H.13.10.1" and "13.10.1", so a user who
 * types only the numbers still finds it, but "13.10.1" does not match
 * "HZ.13.10.1.1": a code is one word, matched whole.
 */
function codeWords(code: string): string[] {
  return [code, code.replace(/^[A-Z]+\./, '')];
}

/**
 * Turns a word into the form that is indexed and matched, so that the ways
 * Hebrew is really typed all give the same form:
 * - lower case: "H.13.10.1" and "h.13.10.1" match
 * - no niqqud: the vowel points (רֶכֶב) are marks on top of the letters, and
 *   `\p{Mn}` matches every such mark, so "רֶכֶב" becomes "רכב"
 * - no quotes: an abbreviation is typed with the Hebrew gershayim (אש״ל), with
 *   an ASCII quote (אש"ל) or with none (אשל), so ״ ׳ " ' are all dropped
 * - no Hebrew prefix letter: "ברכב" (in a car), "הרכב" (the car) and "לרכב"
 *   (to a car) all become "רכב". One letter of ה ב ל ו מ ש כ is stripped,
 *   only when at least 2 letters remain (the lookahead `(?=.{2})` checks
 *   that). It is checked on the word as typed, before ו/י go, so "ישיבת"
 *   (starts with י, not a prefix) keeps its ש.
 * - no ו or י: Hebrew is written with them ("גימלאות", full spelling) or
 *   without them ("גמלאות", short spelling), so they are ignored
 * - no final letters: ך ם ן ף ץ are how כ מ נ פ צ are written at the end of a
 *   word, so "תעריף" (rate) and "תעריפי" (rates of) have the same letters
 */
export function normalizeWord(word: string): string {
  const withoutMarks = word
    .toLowerCase()
    .replace(/\p{Mn}/gu, '')
    .replace(/["'״׳]/g, '');
  const withoutPrefix = withoutMarks.replace(/^[הבלומשכ](?=.{2})/u, '');
  return withoutPrefix
    .replace(/[וי]/g, '')
    .replace(/[ךםןףץ]/g, (letter) => REGULAR_FORM[letter]);
}

/** Each final letter, and the letter it is at the start or middle of a word. */
const REGULAR_FORM: Record<string, string> = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
};

/**
 * How many typos (edits: a letter added, removed or changed) a query word may
 * have, scaled to its length after normalizeWord: none up to 3 letters (too
 * many short words are one edit apart, "רכב" and "רכז"), one from 4 letters
 * ("רכבב" finds "רכב"), and at most two, from 8. A word with a digit is a Document code
 * or a number, and those are matched exactly: "13.10.1" must not find
 * "13.10.2".
 */
export function typosAllowed(word: string): number {
  if (/\d/.test(word)) return 0;
  return Math.min(2, Math.floor(word.length / 4));
}

/**
 * MiniSearch calls this for every field it indexes (with the field's name) and
 * for the query (with no name).
 */
export function tokenize(text: string, fieldName?: string): string[] {
  return fieldName === 'code' ? codeWords(text) : splitWords(text);
}
