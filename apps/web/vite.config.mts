/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  // The path the site is served under. Locally it is the root, "/". The
  // GitHub Pages build (.github/workflows/pages.yml) sets BASE_PATH to
  // "/takam-directives-poc/", because Pages serves the repo there.
  base: process.env.BASE_PATH ?? '/',
  cacheDir: '../../node_modules/.vite/apps/web',
  server: {
    port: 4200,
    host: 'localhost',
    // In development, send /api calls to the NestJS API so the page and the
    // API share one origin (no CORS setup needed). Set API_URL if the API
    // runs somewhere else, e.g. API_URL=http://localhost:4000 with PORT=4000.
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:3456',
    },
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [react(), nxReadySignal()],
  build: {
    outDir: './dist',
    emptyOutDir: true,
  },
  test: {
    name: 'web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
