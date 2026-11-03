import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const v1 = readFileSync(new URL('../../../dashboard/index.html', import.meta.url), 'utf8');
const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

// The body of the first rule that opens with this selector; token blocks hold no nested braces.
function block(css: string, selector: string): string {
  const at = css.indexOf(selector + ' {');
  if (at < 0) throw new Error(`no "${selector}" block`);
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
}

function vars(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

const v1Light = vars(block(v1, ':root'));
const v1Dark = vars(block(v1, ':root[data-theme="dark"]'));
const light = vars(block(theme, ':root'));
const dark = vars(block(theme, ':root[data-theme="dark"]'));
const fallback = vars(block(theme, ':root:not([data-theme])'));

describe('theme.css', () => {
  it('has every v1 light token with the v1 value, plus the three terminal dots', () => {
    expect(Object.keys(v1Light).length).toBeGreaterThan(50);
    const { 'tty-dot-1': d1, 'tty-dot-2': d2, 'tty-dot-3': d3, ...rest } = light;
    expect(rest).toEqual(v1Light);
    const line = v1.split('\n').find((l) => l.includes('.tty .bar i {')) ?? '';
    expect([d1, d2, d3]).toEqual([...line.matchAll(/background:(#[0-9a-fA-F]{6})/g)].map((m) => m[1]));
  });

  it('has every v1 dark token with the v1 value', () => {
    expect(Object.keys(v1Dark).length).toBeGreaterThan(20);
    expect(dark).toEqual(v1Dark);
    expect(vars(block(v1, ':root:not([data-theme="light"])'))).toEqual(v1Dark);
  });

  it('keeps the no-script dark fallback equal to the data-theme dark block', () => {
    expect(fallback).toEqual(dark);
  });

  it('maps each Tailwind key to a token that exists', () => {
    const refs = [...block(theme, '@theme inline reference').matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(60);
    expect(refs.filter((r) => !(r in light))).toEqual([]);
  });
});
