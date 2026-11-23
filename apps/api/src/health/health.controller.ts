import { Controller, Get } from '@nestjs/common';
import type { HealthReport } from '@takam/shared';
import { SearchService } from '../search/search.service';
import { StoreService } from '../store/store.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly store: StoreService,
    private readonly search: SearchService,
  ) {}

  @Get()
  getHealth(): HealthReport {
    return {
      directives: this.store.countDirectives(),
      indexSize: this.search.index.size,
      lastIngest: this.store.lastIngestFinishedAt(),
    };
  }
}
