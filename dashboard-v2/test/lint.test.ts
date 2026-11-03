import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: root });
const errors = async (code: string, file: string) =>
  (await eslint.lintText(code, { filePath: join(root, file) }))[0]!.messages.map((m) => m.message);

describe('the token lint', () => {
  it('fails on a hex value or an arbitrary value in src/', async () => {
    const hex = 'Use a token from theme.css, not a hex value.';
    expect(await errors("export const c = '#0060DF';\n", 'src/x.ts')).toEqual([hex]);
    expect(await errors('export const c = `fill: #fff`;\n', 'src/x.ts')).toEqual([hex]);
    expect(await errors('export const C = () => <i className="p-[3px]">#abc</i>;\n', 'src/x.tsx')).toEqual([
      'Use a token class, not an arbitrary value.',
      hex,
    ]);
    // The first lint loads the TypeScript parser: on a busy host that takes more than 5 s.
  }, 30_000);

  it('passes a route hash and the fox palettes', async () => {
    expect(await errors("export const r = '#overview';\n", 'src/x.ts')).toEqual([]);
    expect(await errors("export const c = '#0060DF';\n", 'src/teams/fox.ts')).toEqual([]);
  });

  it('fails on a shadcn token alias in src/', async () => {
    const msg = 'Use a project token, not a shadcn alias.';
    expect(await errors('export const C = () => <i className="bg-background text-muted-foreground" />;\n', 'src/x.tsx')).toEqual([msg]);
    expect(await errors("export const c = 'var(--muted-foreground)';\n", 'src/x.ts')).toEqual([msg]);
    expect(await errors("export const c = 'bg-panel text-dim border-line';\n", 'src/x.ts')).toEqual([]);
  });

  it('fails on an import through a path alias that tsconfig.json does not define', async () => {
    for (const from of ['@/components/ui/button', '@/lib/utils', '~/ui', '#/ui']) {
      const msg = `'${from}' import is restricted from being used by a pattern. Use a relative import: tsconfig.json defines no such path alias.`;
      expect(await errors(`import { x } from '${from}';\nexport const y = x;\n`, 'src/x.ts')).toEqual([msg]);
      expect(await errors(`export { x } from '${from}';\n`, 'src/ui/x.ts')).toEqual([msg]);
    }
    expect(await errors("import { Dialog } from 'radix-ui';\nimport { cx } from '../ui/tone';\nimport x from '@visx/sankey';\nexport const y = [Dialog, cx, x];\n", 'src/charts/x.ts')).toEqual([]);
  });

  it('finds no hex value in a stylesheet in src/ other than theme.css', () => {
    const css = readdirSync(join(root, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.css') && f !== join('styles', 'theme.css'));
    expect(css.filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(join(root, 'src', f), 'utf8')))).toEqual([]);
  });
});
