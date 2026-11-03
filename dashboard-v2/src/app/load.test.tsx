// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './App';
import { modelSel } from './store';
import { VIEWS } from './views';
import { store } from '../store';

afterEach(cleanup);

test('a view chunk loads on the first visit and fills the main content, the side list and the details', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const errs = VIEWS.find((v) => v.id === 'errors')!;
  errs.load = async () => ({ default: {
    Main: () => <p>the errors main</p>,
    side: () => [{ items: [{ id: 'abc123', d: 'bad', t: 'boom', m: [] }] }],
    right: () => <p>the errors details</p>,
  } });
  location.hash = '#errors/open';
  render(<App store={store} sel={modelSel} />);
  expect(await screen.findByText('the errors main')).toBeTruthy();
  expect(screen.getByText('boom')).toBeTruthy();
  expect(screen.getByText('the errors details')).toBeTruthy();
});
