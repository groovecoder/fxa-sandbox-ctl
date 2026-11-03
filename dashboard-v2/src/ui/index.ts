// C3, the small parts: props only. Each part renders nothing until W1-DS implements it.
import type { ReactNode } from 'react';

/** info means live, not neutral; merged is the purple pair. */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'merged' | 'dim';

/** A part with a tone also takes the word for it (rule 3), so a colour never stands alone. */
export type Toned<T extends Tone = Tone> = { tone?: T; label: string };

/** For a part where the word is in its body: a tone, when given, still needs its word. */
export type ToneOption<T extends Tone = Tone> = { tone?: undefined; label?: string } | { tone: T; label: string };

const stub = (): ReactNode => null;

/** A pill. label is its text. run draws the running dot, live pulses it, sq is the square form. */
export type TagProps = Toned & { run?: boolean; live?: boolean; sq?: boolean; title?: string; href?: string };
export const Tag: (props: TagProps) => ReactNode = stub;

/** A status dot. label is the screen reader word when no word is next to it. */
export type DotProps = Toned & { live?: boolean };
export const Dot: (props: DotProps) => ReactNode = stub;

/** A bar from 0 to 100. label names the bar for a screen reader. */
export type MeterProps = Toned & { pct: number | null };
export const Meter: (props: MeterProps) => ReactNode = stub;

/** sm is a small tile in a grid, flat is a card inside a card or a pane. */
export type CardProps = ToneOption<'warn' | 'bad'> & {
  children: ReactNode;
  sm?: boolean;
  flat?: boolean;
  href?: string;
  className?: string;
};
export const Card: (props: CardProps) => ReactNode = stub;

/** A label and value row; na marks a missing value. */
export type KvProps = { label: string; value: ReactNode; na?: boolean };
export const Kv: (props: KvProps) => ReactNode = stub;

export type EmptyBoxProps = { children: ReactNode };
export const EmptyBox: (props: EmptyBoxProps) => ReactNode = stub;

/** label is the tile's label and its tone word. A null value shows "?". */
export type StatTileProps = Toned & { value: ReactNode | null; sub?: ReactNode; href?: string };
export const StatTile: (props: StatTileProps) => ReactNode = stub;

/** A feed that failed: the text is "unknown", never 0, and reason goes in the title. */
export type UnknownProps = { reason?: string };
export const Unknown: (props: UnknownProps) => ReactNode = stub;

/** CI bars in fail, running, ok order, labelled "x passed, y failed, z running". */
export type CheckBarsProps = { ok: number | null; fail: number | null; running: number | null };
export const CheckBars: (props: CheckBarsProps) => ReactNode = stub;
