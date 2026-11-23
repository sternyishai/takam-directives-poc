import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { sanitizeDirectiveHtml } from '@takam/sanitize';
import {
  isInForce,
  officialPageUrl,
  todayInIsrael,
  type Directive,
} from '@takam/shared';
import { StoreService } from '../store/store.service';

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
      // Ingest already cleaned the HTML before storing it. Cleaning it again
      // here means the page never gets unsafe HTML, even from an old store or
      // a hand-edited one.
      html: sanitizeDirectiveHtml(record.html),
      // Computed from the dates on every request, so it changes at midnight
      // without a new ingest (ADR 0001).
      inForce: isInForce(record.validFrom, record.validTo, todayInIsrael()),
      officialUrl: officialPageUrl(record.code),
    };
  }
}
