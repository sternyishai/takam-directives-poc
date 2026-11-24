# The chatbot retrieves by words and by vectors, taking turns

The chatbot answers only from Passages that retrieval gives it (RAG), so retrieval decides what it can answer.
- **The chunks:** ingest cuts each Directive at its headings, at most about 1,200 characters, never inside a paragraph, with one paragraph of overlap where a long section is split. Each chunk starts with the context line `code · title › section`, so a Passage makes sense on its own and a question also matches its Directive's title and section.
- **Retrieval:** two lists. One is the chunks that match the question's words (MiniSearch, with the same Hebrew rules as search, ADR 0004). The other is the 5 chunks whose vectors are closest to the question's (Gemini embeddings with 768 numbers, compared by cosine similarity in plain TypeScript).
- **The merge:** the lists take turns (the best word match, then the closest vector, and so on), skipping a chunk already taken, and the model gets the top 5.

## Considered options

- **Words only:** rejected. A question worded differently from the Directive ("how much do I get a day abroad?" against "קצובת שהייה") shares no word with it and finds nothing.
- **Vectors only:** rejected. A Document code, a number or an exact term ("13.10.1", "אש"ל") is matched better by words, and the chatbot must still work in part when the embedding call is not configured.
- **Merging by score (weighted sum, or reciprocal rank fusion):** rejected for now. A MiniSearch score and a cosine are on different scales, and weights would need tuning against questions we don't have yet. Taking turns needs no tuning and is easy to explain. The cost: each method always gets a share of the 5 places, even when the other one is clearly better for a question.
- **A vector database:** not needed. 376 chunks are compared in well under a millisecond, and 7,000 in about 15 ms (production HLD, section 7). In production the vectors move to Postgres with pgvector so that the pods share one copy (ADR 0003).
- **Model or provider retrieval features (built-in citations, file search):** rejected for the same reason as in ADR 0002: our code decides which Passages the model sees and checks every Citation, so changing the vendor does not change what the answers can cite.
