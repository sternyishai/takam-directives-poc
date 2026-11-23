import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [StoreModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService], // health reports the index size
})
export class SearchModule {}
