import { expect, it } from 'vitest';
import type { BeltProps, TrackerProps } from '../charts';
import type { CardProps, DotProps, TagProps } from './index';

// npm run typecheck fails when a tone stops needing its word: each @ts-expect-error then has no error.
it('needs a label with every tone', () => {
  // @ts-expect-error a tag with a tone and no word
  const tag: TagProps = { tone: 'bad' };
  // @ts-expect-error a dot with a tone and no word
  const dot: DotProps = { tone: 'info', live: true };
  // @ts-expect-error a card with a tone and no word
  const card: CardProps = { tone: 'warn', children: null };
  // @ts-expect-error a belt with a tone and no word
  const belt: BeltProps = { tone: 'ok', stops: ['a'], at: 0 };
  // @ts-expect-error a run with a tone and no word
  const runs: TrackerProps = { label: 'Last runs', items: [{ tone: 'bad' }] };
  const plain: CardProps = { children: null };
  expect([tag, dot, card, belt, runs, plain]).toHaveLength(6);
});
