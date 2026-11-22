# Site research notes (2026-11-23)

The site is an Angular single-page app. The HTML has no content, and all data comes from a JSON API on the same origin.
No authentication is needed. The records come from Salesforce (synced through Heroku Connect, as the `sfid` and `_hc_*` fields show).

## Endpoints (base: https://takam.mof.gov.il/)
| Endpoint | Returns |
|---|---|
| `GET api/Chapter` | Chapter tree, with `rtn_parentchapter__c`, `rtn_codetext__c` (e.g. "8.0") and `rtn_chaptertype__c` |
| `GET api/Document` | All documents in one response (~1,127 records, ~875 KB) |
| `GET api/Document/{id}` | One document |
| `GET api/Document/DocumentCodeText/{code}` | Document by code |
| `GET api/DocumentVersion/{docSfid}` | Version history: number, validfrom/validto, status, `rtn_contentversionid__c` (the file) |
| `GET api/DocumentVersion/DocumentAttached/{id}` | Attached files |
| `GET api/DocumentVersion/RelatedDocumentId/{id}` | Related documents |
| `GET api/document/DocumentUpdate/` | "Updates Summary" document |
| `GET api/DocumentSF/DownloadDocument/{a}/{b}` | File download (the PDF/DOCX content) |
| `GET api/Tag` | Empty |

## Document types (counts)
Instruction 418, Form 243, Attached File 203, Message 120, Tender Notice 76,
Tender Details 33, Tender Maintenance 24, Temporary Instruction 9, Updates Summary 1.

## Document fields
`namecode` (e.g. "13.0.0"), `name`, `firstnamechapter`/`secondnamechapter`, `documenttype`,
`datevalidfrom`/`datevalidto`, `versionnumber`, `keywords`, `tags`, `description`, `parentdocument`, `reference`.

## Early observations
- The directive text is in downloadable files, not in the API metadata. Full-text search would mean downloading and parsing those files.
- Versions exist (`versionnumber`, validity dates), but there is no visible diff between versions.
- The `Tag` endpoint is empty, and many `keywords` fields are null, so there is little metadata to search on.
