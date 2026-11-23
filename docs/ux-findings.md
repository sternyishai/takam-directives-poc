# UX findings on the live site (2026-11-23)

Gathered by driving https://takam.mof.gov.il/ with Playwright and checking the `api/Document` data.
Each finding has evidence you can reproduce.

## 1. Search only covers metadata, not the directive text
- Phrases that are section headings inside directive 1.1.1 ("טייס אוטומטי", "דפי מעבר", "תקציב גמיש") return **0 results**.
- The directive text exists only in the downloadable file, so a user has to already know which directive to open.

## 2. Search matches substrings, so it returns false positives
- "רכב" (car) returns 62 results and opens 1.1.1 "מונחון לביאור מושגי התקציב" first.
- It matched because the keywords contain "הרכב התקציב" (the *composition* of the budget).

## 3. No tolerance for typos or Hebrew spelling variants
| Query | Results |
|---|---|
| גמלאות | 8 |
| גימלאות (full spelling, also correct) | 0 |
| רכב | 62 |
| רכבב (one extra letter) | 0 |
| אש"ל | 2 |
| אשל | 1 |
| ש״ש (Hebrew gershayim) | 0 |

## 4. Results are a tree, not a ranked list
- A search shows the chapter tree filtered to matches, with no ranking and no snippet that shows *why* a result matched.
- With 62 results the user has to open them one by one.
- "הרחבת רשימה" (expand list) shows 458 rows in one scroll and squeezes the detail panel into a narrow column.

## 5. Reading a directive means downloading a Word file
- Clicking "קובץ הוראה" downloads `H.1.1.1.docx`. Nothing is shown in the browser.
- That is awkward on a phone and impossible to link to a specific section.

## 6. Mobile layout is broken
- At 390px wide the page overflows sideways, and the tree and filters are cut off.

## 7. Expired documents are not marked where users look
- The validity filter ("תוקף") defaults to "הכל" (all), so expired and current documents are mixed together.
- Tree rows show no validity status. The only signal is a small icon next to the title in the detail panel.
- 53 documents have a `datevalidto` in the past (17 Messages, 6 Temporary Instructions, tenders, forms).
- Example: HZ.13.10.1.1 "נסיעות בתפקיד לחו''ל בתקופת קורונה" expired on 2022-06-01. It is not shown on its parent page (H.13.10.1) at all.
- The parent has 15 editions, listed only as date ranges ("מהדורות קודמות"), with no way to see what changed.

## 8. Thin metadata limits any metadata-based fix
- 696 of 1,127 records have no `keywords` (78 of 418 Instructions).
- In 260 of 418 Instructions, `description` is just the code (e.g. "1.1.1").
- `api/Tag` is empty, and the "תגיות" (tags) filter has nothing in it.
- So better search has to use the file content, not just better matching on metadata.

## 9. Expired documents show a green "valid" check icon
- Message 16.5.1 "אספקת שירותי ניטור וניתוח מידע פומבי" (edition 8) shows a green check next to its title.
- The same panel says "בתוקף: לא" (not in force), valid 30/06/2025 to 17/07/2025.
- The API's `isvalid` field is also inverted (`true` on the 53 expired documents), see `docs/adr/0001-validity-computed-from-dates.md`.
