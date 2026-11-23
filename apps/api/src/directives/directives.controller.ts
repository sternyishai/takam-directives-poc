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
    // `fields` is everything in the record except the two enrichment fields
    // taken out by name. The keywords and questions are only for search, so
    // only the summary is sent, and the error is only for whoever runs ingest.
    // ESLint flags `enrichmentError` as unused; taking it out is the point.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { enrichment, enrichmentError, ...fields } = record;
    return {
      ...fields,
      // null when enrichment failed: the page then shows no summary.
      summary: enrichment?.summary ?? null,
      // Ingest already cleaned the HTML before storing it. Cleaning it again
      // here means the page never gets unsafe HTML, even from an old store or
      // a hand-edited one.
      html: sanitizeDirectiveHtml(fields.html),
      // Computed from the dates on every request, so it changes at midnight
      // without a new ingest (ADR 0001).
      inForce: isInForce(record.validFrom, record.validTo, todayInIsrael()),
      officialUrl: officialPageUrl(record.code),
    };
  }
}
