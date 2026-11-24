import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { ChatController } from './chat.controller';
import { chatModelProvider } from './chat-model';
import { ChatService } from './chat.service';
import { embeddingModelProvider } from './embedding-model';

@Module({
  imports: [StoreModule],
  controllers: [ChatController],
  providers: [ChatService, chatModelProvider, embeddingModelProvider],
})
export class ChatModule {}
