import type { Tone } from './index';

/** The text on background pair of each tone (rule 2). */
export const TONE: Record<Tone, string> = {
  ok: 'text-ok bg-okbg',
  warn: 'text-warn bg-warnbg',
  bad: 'text-bad bg-badbg',
  info: 'text-info bg-infobg',
  merged: 'text-purpletxt bg-purplebg',
  dim: 'text-dim bg-sunk',
};

/** The text colour of each tone, for a number or a word on the panel. */
export const TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  info: 'text-info',
  merged: 'text-purpletxt',
  dim: 'text-dim',
};

/** The solid fill of each tone, for a dot, a bar or a node. */
export const FILL: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  info: 'bg-info',
  merged: 'bg-purple',
  dim: 'bg-faint',
};

/** The same fill for an SVG mark or SVG text. */
export const SVG: Record<Tone, string> = {
  ok: 'fill-ok',
  warn: 'fill-warn',
  bad: 'fill-bad',
  info: 'fill-info',
  merged: 'fill-purple',
  dim: 'fill-faint',
};

/** A class list from words; false, null and undefined give nothing. */
export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
