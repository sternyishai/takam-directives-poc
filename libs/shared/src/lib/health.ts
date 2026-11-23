/** What GET /api/health returns: a quick look at the store and the search index. */
export interface HealthReport {
  /** How many Directives are in the store. */
  directives: number;
  /** How many Directives the in-memory search index holds. */
  indexSize: number;
  /** When the last ingest finished (ISO 8601), or null if ingest never ran. */
  lastIngest: string | null;
}
