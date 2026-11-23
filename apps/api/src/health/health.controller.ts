import { Controller, Get } from '@nestjs/common';
import type { HealthReport } from '@takam/shared';
import { StoreService } from '../store/store.service';

@Controller('health')
export class HealthController {
  constructor(private readonly store: StoreService) {}

  @Get()
  getHealth(): HealthReport {
    return {
      directives: this.store.countDirectives(),
      // The MiniSearch index arrives in milestone 4; until then nothing is indexed.
      indexSize: 0,
      lastIngest: this.store.lastIngestFinishedAt(),
    };
  }
}
