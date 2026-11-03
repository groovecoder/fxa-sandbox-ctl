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
  });

  it('passes a route hash and the fox palettes', async () => {
    expect(await errors("export const r = '#overview';\n", 'src/x.ts')).toEqual([]);
    expect(await errors("export const c = '#0060DF';\n", 'src/teams/fox.ts')).toEqual([]);
  });

  it('finds no hex value in a stylesheet in src/ other than theme.css', () => {
    const css = readdirSync(join(root, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.css') && f !== join('styles', 'theme.css'));
    expect(css.filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(join(root, 'src', f), 'utf8')))).toEqual([]);
  });
});
