import { Module } from '@nestjs/common';
import { DirectivesModule } from '../directives/directives.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [HealthModule, DirectivesModule],
})
export class AppModule {}
