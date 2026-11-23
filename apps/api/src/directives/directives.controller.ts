import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { isInForce, officialPageUrl, type Directive } from '@takam/shared';
import { StoreService } from '../store/store.service';

/**
 * Today's date in Israel as an ISO date ("2026-11-23"). The site's dates are
 * Israeli calendar days, so "today" must be too, whatever the server's time zone.
 * The "en-CA" locale is used only because it formats dates as YYYY-MM-DD.
 */
function todayInIsrael(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
  }).format(new Date());
}

@Controller('directives')
export class DirectivesController {
  constructor(private readonly store: StoreService) {}

  /** GET /api/directives/H.13.10.1 → the Directive, or 404 if the code is unknown. */
  @Get(':code')
  getDirective(@Param('code') code: string): Directive {
    const record = this.store.findDirective(code);
    if (!record) {
      throw new NotFoundException(`No Directive with code ${code}`);
    }
    return {
      ...record,
      // Computed from the dates on every request, so it changes at midnight
      // without a new ingest (ADR 0001).
      inForce: isInForce(record.validFrom, record.validTo, todayInIsrael()),
      officialUrl: officialPageUrl(record.code),
    };
  }
}
