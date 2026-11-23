import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';
import { existsSync } from 'node:fs';

// The chatbot's key and model (GOOGLE_API_KEY, LLM_MODEL), read with Node's
// own .env reader, as in ingest. A variable already set in the shell wins.
// Without them the API still starts, with the chatbot off.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app); // the /api prefix and the security header
  const port = process.env.PORT || 3000;
  await app.listen(port);

  // `nx serve api` waits for this signal to know the server is up. The variable
  // is only set when Nx starts the API; `node dist/main.js` skips this block.
  // The import is built at runtime so webpack does not try to bundle @nx/js.
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    const load = new Function('s', 'return import(s)') as (
      s: string,
    ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
    (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
  }

  Logger.log(`API running on http://localhost:${port}/api`);
}

bootstrap();
