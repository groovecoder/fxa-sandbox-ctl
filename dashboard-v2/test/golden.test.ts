import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as model from '../src/model';

const fixtures = new URL('../../skills/fxa-ctl-dev/', import.meta.url);
const golden = new URL('./golden/', import.meta.url);
const names = readdirSync(fixtures).filter((f) => /^page-fixture.*\.json$/.test(f));

test('each v1 page fixture has a golden file with a result for every C2 selector', () => {
  expect(names.length).toBeGreaterThan(0);
  const selectors = Object.keys(model).filter((k) => typeof model[k as keyof typeof model] === 'function');
  for (const n of names) {
    const g = JSON.parse(readFileSync(new URL(n, golden), 'utf8'));
    expect(g.tz, n).toBe('UTC');
    expect(Object.keys(g), n).toEqual(expect.arrayContaining(['now', ...selectors]));
  }
});
