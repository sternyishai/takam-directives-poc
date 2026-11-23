import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app/app.module';

describe('GET /api/health', () => {
  let app: INestApplication;
  let baseUrl: string;
  const originalDbPath = process.env.DB_PATH;

  beforeAll(async () => {
    // An in-memory database is a fresh, empty store for every test run.
    process.env.DB_PATH = ':memory:';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0); // port 0: let the OS pick a free port
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    process.env.DB_PATH = originalDbPath;
  });

  it('reports 0 directives and no ingest against an empty store', async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      directives: 0,
      indexSize: 0,
      lastIngest: null,
    });
  });
});
