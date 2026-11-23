import { Module } from '@nestjs/common';
import { DirectivesModule } from '../directives/directives.module';
import { HealthModule } from '../health/health.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [HealthModule, DirectivesModule, SearchModule],
})
export class AppModule {}
