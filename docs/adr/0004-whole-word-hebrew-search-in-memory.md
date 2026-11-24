# Whole-word Hebrew search in memory; a search engine only past about 5,000 Directives

The site matches parts of words, so "רכב" (car) finds a budget glossary through "הרכב התקציב" (the composition of the budget), and it has no tolerance for typos or spelling variants. We match **whole words only**, after normalizing every word the same way in the index and in the query (`normalizeWord`):
- niqqud and quotes are removed
- one prefix letter (ה ב ל ו מ ש כ) is stripped
- ו and י are dropped, so full and short spelling match
- final letters become regular letters

A typo is allowed by the word's length (`typosAllowed`: none up to 3 letters, one from 4, two from 8), and never in a word with a digit, so `13.10.1` never finds `13.10.2`. The index is MiniSearch, in the API's memory, built from the store when the API starts.

The cost is accepted. Different words can become the same form (`ביטוח` insurance and `בטוח` safe both become `טח`), and typing part of a word ("נסיע") finds nothing.

## Considered options

- **Prefix or substring matching, like the site:** rejected. It is what brings back the "רכב" trap.
- **Fuzzy matching in Postgres (`pg_trgm`, full-text search):** rejected. Postgres has no Hebrew dictionary, and trigram similarity counts shared three-letter pieces, not edits. On 3–4 letter Hebrew words, which are often one letter apart (`רכב` car, `רכז` coordinator), it either misses a typo or matches the wrong word.
- **A search engine (OpenSearch) now:** not yet. Measured with `npm run bench:search`, all of Takam (about 550 Directives) takes 5 ms per search and 16 MB per API pod. Past about 5,000 Directives it takes 45 ms and 125 MB per pod, growing with the size, and then OpenSearch is the next step (production HLD, section 7). Its `fuzziness: "AUTO:4,8"` is the same rule as `typosAllowed`. The Hebrew rules stay in `normalizeWord`: ingest indexes the normalized words, and the API normalizes the query the same way.
