# store

The SQLite store (ADR 0003): the schema and the `Store` class. Ingest writes to it and the API reads from it. Node only (it uses `node:sqlite`).

It has no tests of its own: the API e2e tests (`apps/api/src/directives/directives.spec.ts`) exercise it through HTTP.
