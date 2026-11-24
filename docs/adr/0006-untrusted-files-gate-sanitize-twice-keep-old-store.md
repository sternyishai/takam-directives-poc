# Untrusted files: a gate before conversion, HTML sanitized twice, and the old store kept when a run goes wrong

Every Word file comes from an outside site, and the viewer puts its HTML into the page (`dangerouslySetInnerHTML`). So we treat each file as hostile, at three points:
1. **The gate,** before any parser opens the file. It checks the cheapest things first: under 2 MB, the zip magic bytes (with a reason of its own when the file is the site's HTML page), a zip that opens and has `word/document.xml`, fewer than 200 entries, and under 20 MB once expanded. The expanded size is counted by expanding each entry as a stream and stopping at 20 MB. It does not trust the sizes the zip states, because a zip bomb can lie about them.
2. **The HTML is sanitized twice,** with an allowlist (sanitize-html): once by ingest before it is stored, and again by the API before it is sent. Only headings, paragraphs, lists, tables, `strong`, `em` and `http(s)` links survive. Images are dropped. The API also sends a strict CSP header.
3. **The old store stays live when a run goes wrong.** Ingest builds a new store beside the old one and swaps it in only if at most 20% of the files were rejected (and at most 20% of the enrichments failed). Below that limit, a rejected file is logged and skipped, so one changed Directive doesn't block the other 29.

## Considered options

- **Sanitizing only once,** in ingest or in the API: rejected. Cleaning in ingest keeps the stored HTML, and the chunks built from it, clean. Cleaning in the API protects the browser even from a store that was filled before a sanitizer fix, or edited by hand. The cost is a few milliseconds per request.
- **Failing the whole run on any rejected file:** rejected. The site changes one Directive at a time. But when every file is rejected (the site's firewall answers with its HTML challenge page), the run fails and keeps yesterday's store. That is the failure scenario in the production HLD, section 6.
- **Trusting the zip's own sizes for the zip-bomb check:** rejected, as above.
- **A virus scan:** not in the POC. In production it is one more check in the gate, before conversion (ClamAV, production HLD, section 2).
