import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { StoreModule } from '../store/store.module';
import { HealthController } from './health.controller';

@Module({
  imports: [StoreModule, SearchModule],
  controllers: [HealthController],
})
export class HealthModule {}
