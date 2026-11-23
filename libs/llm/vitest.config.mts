import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/llm',
  test: {
    name: 'llm',
    watch: false,
    globals: true,
    environment: 'node',
    // Enrichment is tested where ingest uses it (apps/ingest/src/ingest.spec.ts),
    // and the chat here, both with the fake model.
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
