import { Controller, Get, Query } from '@nestjs/common';
import { DEFAULT_LIMIT } from '@takam/search';
import { todayInIsrael, type SearchResult } from '@takam/shared';
import { StoreService } from '../store/store.service';
import { SearchService } from './search.service';

/** The largest `limit` a caller may ask for. */
const MAX_LIMIT = 50;

/**
 * `limit` from the URL as a whole number from 1 to MAX_LIMIT. Anything
 * missing or not a number gives the default.
 */
function parseLimit(limit: unknown): number {
  const number = Number.parseInt(String(limit), 10);
  if (Number.isNaN(number)) return DEFAULT_LIMIT;
  return Math.min(Math.max(number, 1), MAX_LIMIT);
}

@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly store: StoreService,
  ) {}

  /**
   * GET /api/search?q=רכב&inForce=true&limit=20 → the ranked results.
   * inForce is true unless it is exactly "false". Every search is logged.
   */
  @Get()
  find(
    @Query('q') q: unknown,
    @Query('inForce') inForce: unknown,
    @Query('limit') limit: unknown,
  ): SearchResult[] {
    // A repeated parameter (?q=a&q=b) arrives as an array: treat it as empty.
    const query = typeof q === 'string' ? q.trim() : '';
    const inForceOnly = inForce !== 'false';
    const results = this.search.index.search(query, {
      today: todayInIsrael(),
      inForce: inForceOnly,
      limit: parseLimit(limit),
    });
    this.store.logSearch({
      query,
      inForceOnly,
      resultCount: results.length,
      searchedAt: new Date().toISOString(),
    });
    return results;
  }
}
