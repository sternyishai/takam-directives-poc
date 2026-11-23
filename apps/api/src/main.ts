import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';

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
