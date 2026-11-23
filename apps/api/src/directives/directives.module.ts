import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { DirectivesController } from './directives.controller';

@Module({
  imports: [StoreModule],
  controllers: [DirectivesController],
})
export class DirectivesModule {}
