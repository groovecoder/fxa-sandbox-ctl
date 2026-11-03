import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // server.py serves the build at /v2, and the asset URLs must resolve from /v2 and /v2/.
  base: '/v2/',
  build: { outDir: 'dist', emptyOutDir: true },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'] },
});
