import { render, screen } from '@testing-library/react';
import type { HealthReport } from '@takam/shared';
import App from './app';

/** Stands in for the API: every fetch answers with this health report. */
function stubHealth(report: HealthReport) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(report))),
  );
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the number of directives the API reports, in Hebrew', async () => {
    stubHealth({ directives: 30, indexSize: 30, lastIngest: null });

    render(<App />);

    expect(await screen.findByText('במאגר 30 הוראות')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/health');
  });

  it('tells the user when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    render(<App />);

    expect(await screen.findByText('השרת אינו זמין')).toBeTruthy();
  });

  it('tells the user when the API answers with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ statusCode: 500 }), { status: 500 }),
      ),
    );

    render(<App />);

    expect(await screen.findByText('השרת אינו זמין')).toBeTruthy();
  });
});
