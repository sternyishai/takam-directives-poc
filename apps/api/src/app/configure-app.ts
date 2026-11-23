import type { INestApplication } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The Content-Security-Policy header tells the browser what a response may
 * load or run. The API only ever sends JSON, so it may load nothing
 * (`default-src 'none'`) and no other site may show it in a frame
 * (`frame-ancestors 'none'`). If HTML from the API were ever opened as a
 * page, the browser would refuse to run any script in it.
 */
const CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'";

/** Adds the header to every response, before any route runs (errors included). */
function contentSecurityPolicy(
  _request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
): void {
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  next();
}

/**
 * The setup shared by main.ts and the e2e tests, so the tests run the API
 * exactly as it runs for real.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api'); // every route starts with /api, e.g. /api/health
  app.use(contentSecurityPolicy);
}
