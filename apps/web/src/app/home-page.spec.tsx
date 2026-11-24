import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { HealthReport } from '@takam/shared';
import App from './app';

/** Opens the app at its home page, "/". */
function openHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
}

/**
 * Stands in for the API: /api/health answers this report, and the table's
 * /api/search answers no Directives.
 */
function stubHealth(report: HealthReport) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.startsWith('/api/search')
        ? new Response('[]')
        : new Response(JSON.stringify(report)),
    ),
  );
}

describe('The home page (/)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the number of directives the API reports, in Hebrew', async () => {
    stubHealth({ directives: 30, indexSize: 30, lastIngest: null });

    openHome();

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

    openHome();

    // Twice: the store's count and the table both say so.
    expect(await screen.findAllByText('השרת אינו זמין')).toHaveLength(2);
  });

  it('tells the user when the API answers with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ statusCode: 500 }), { status: 500 }),
      ),
    );

    openHome();

    // Twice: the store's count and the table both say so.
    expect(await screen.findAllByText('השרת אינו זמין')).toHaveLength(2);
  });
});
