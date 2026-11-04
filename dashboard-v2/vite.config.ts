import { gzipSync } from 'node:zlib';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The first view budget: the entry and one view chunk, with all their static imports, in KB of gzip JS.
const FIRST_VIEW_KB = 250;

// The build fails when a view as the first view breaks the budget, or when Visx loads before a Sankey shows.
function budget(): Plugin {
  return {
    name: 'v2-budget',
    apply: 'build',
    generateBundle(_, bundle) {
      const js = new Map(Object.values(bundle).flatMap((c) => (c.type === 'chunk' ? [[c.fileName, c] as const] : [])));
      const kb = (f: string) => gzipSync(js.get(f)!.code).length / 1024;
      const tree = (f: string, seen = new Set<string>()) => {
        if (!seen.has(f)) {
          seen.add(f);
          js.get(f)!.imports.forEach((i) => tree(i, seen));
        }
        return seen;
      };
      const entry = [...js.values()].find((c) => c.isEntry)!.fileName;
      const bad: string[] = [];
      for (const c of js.values()) {
        const view = /\/src\/views\/([^/]+)\/index\.tsx$/.exec(c.facadeModuleId ?? '')?.[1];
        if (!view) continue;
        const files = tree(c.fileName, tree(entry));
        const total = [...files].reduce((n, f) => n + kb(f), 0);
        this.info(`first view ${view}: ${total.toFixed(1)} KB gzip JS (budget ${FIRST_VIEW_KB})`);
        if (total > FIRST_VIEW_KB) bad.push(`${view} as the first view is ${total.toFixed(1)} KB gzip JS, over the ${FIRST_VIEW_KB} KB budget`);
        const visx = [...files].filter((f) => js.get(f)!.moduleIds.some((m) => m.includes('/node_modules/@visx/')));
        if (visx.length) bad.push(`${view} loads Visx before a Sankey shows (${visx.join(', ')}): import Sankey from src/charts, which loads it lazily`);
      }
      if (bad.length) this.error(bad.join('\n'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), budget()],
  // server.py serves the build at /v2, and the asset URLs must resolve from /v2 and /v2/.
  base: '/v2/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The charts barrel has no side effects, so a view gets only the charts that it imports (Recharts stays out of Errors).
    rolldownOptions: { treeshake: { moduleSideEffects: (id: string) => (id.endsWith('/src/charts/index.ts') ? false : undefined) } },
  },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'] },
});
