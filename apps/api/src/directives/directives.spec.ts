import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Directive } from '@takam/shared';
import { Store, type StoredDirective } from '@takam/store';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';

/**
 * Three Directives: one with no end date, one that ended in 2020, and one whose
 * stored HTML is unsafe (as in a store filled before the sanitizer existed).
 */
const travel: StoredDirective = {
  code: 'H.13.10.1',
  title: 'טיסות ושירותים נלווים לנסיעות בתפקיד לחוץ לארץ',
  type: 'Instruction',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.10 נסיעות בתפקיד לחוץ לארץ'],
  edition: 15,
  validFrom: '2026-01-11',
  validTo: null,
  // HTML as ingest stores it: converted and already sanitized.
  html: '<h2>מבוא</h2><p>נוהל הזמנת טיסה</p>',
};
const expired: StoredDirective = {
  ...travel,
  code: 'HZ.13.10.1.1',
  title: 'הוראה שפג תוקפה',
  type: 'Temporary Instruction',
  validFrom: '2019-01-01',
  validTo: '2020-12-31',
};
const unsafe: StoredDirective = {
  ...travel,
  code: 'H.13.10.2',
  html:
    '<h2>מבוא</h2><script>alert(1)</script>' +
    '<p onerror="alert(2)">טקסט</p>' +
    '<p><a href="javascript:alert(3)">לחצו</a></p>',
};

describe('GET /api/directives/:code', () => {
  let app: INestApplication;
  let baseUrl: string;
  let folder: string;
  const originalDbPath = process.env.DB_PATH;

  beforeAll(async () => {
    // Fill a store in a temporary file, the way ingest would, then start the
    // whole API on top of it.
    folder = mkdtempSync(join(tmpdir(), 'takam-api-'));
    process.env.DB_PATH = join(folder, 'takam.db');
    const seed = new Store(process.env.DB_PATH);
    seed.saveDirective(travel);
    seed.saveDirective(expired);
    seed.saveDirective(unsafe);
    seed.close();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0); // port 0: let the OS pick a free port
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    process.env.DB_PATH = originalDbPath;
  });

  it('returns the Directive with its HTML, In force and official page', async () => {
    const response = await fetch(`${baseUrl}/api/directives/H.13.10.1`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...travel,
      inForce: true,
      officialUrl: 'https://takam.mof.gov.il/document/H.13.10.1',
    });
  });

  it('marks an expired Directive as not in force', async () => {
    const response = await fetch(`${baseUrl}/api/directives/HZ.13.10.1.1`);

    const directive = (await response.json()) as Directive;
    expect(directive.inForce).toBe(false);
  });

  it('sends only sanitized HTML, even when the stored HTML is unsafe', async () => {
    const response = await fetch(`${baseUrl}/api/directives/H.13.10.2`);

    const directive = (await response.json()) as Directive;
    expect(directive.html).toBe('<h2>מבוא</h2><p>טקסט</p><p>לחצו</p>');
  });

  it('answers 404 for an unknown code', async () => {
    const response = await fetch(`${baseUrl}/api/directives/H.99.99.99`);

    expect(response.status).toBe(404);
  });

  // The header must be on every response, so check a found code and an error.
  it.each(['H.13.10.1', 'H.99.99.99'])(
    'sends a strict Content-Security-Policy header (%s)',
    async (code) => {
      const response = await fetch(`${baseUrl}/api/directives/${code}`);

      expect(response.headers.get('content-security-policy')).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
    },
  );
});
