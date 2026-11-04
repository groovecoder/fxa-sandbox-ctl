// C3, the charts: the props here, the charts in the files next to it.
import type { ReactNode } from 'react';
import type { Tone, Toned } from '../ui';

/** Series colours in fixed order; never the status tones. */
export type ChartColor = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'chart-muted';

/** The full data behind a chart, for its "Show as table" disclosure. */
export type ChartTable = { head: string[]; rows: (string | number)[][] };

/** summary is the role=img label: one sentence with the totals and the peak. */
export type ChartA11y = { title: string; summary: string; table: ChartTable };

/** The shared frame: title, the chart with its summary, and the table under it. */
export type ChartFrameProps = ChartA11y & { children: ReactNode; note?: ReactNode };

/** A KPI. A null value shows "?". delta is the change with its word, for example "up 12%". */
export type KpiCardProps = {
  label: string;
  value: number | null;
  format?: (n: number) => string;
  delta?: Toned & { tone: Tone };
  spark?: (number | null)[];
  href?: string;
};

export type BarListItem = { name: string; value: number; href?: string };
/** label is the screen reader summary of the list. */
export type BarListProps = { label: string; items: BarListItem[]; format?: (n: number) => string; color?: ChartColor };

/** A sparkline; a null value is a gap, not 0. */
export type SparkProps = { label: string; values: (number | null)[]; color?: ChartColor };

/** One block per run, oldest first; each block has its word in the tooltip. */
export type TrackerProps = { label: string; items: (Toned & { tone: Tone; href?: string })[] };

/** Times are epoch seconds. A bar part past cap draws in bad. */
export type GanttBar = Toned & { start: number; end: number };
export type GanttMark = { at: number; label: string };
export type GanttRow = { id: string; label: string; bars: GanttBar[]; marks?: GanttMark[]; cap?: number; tone?: Tone };
/** now moves the now line; a live bar ends at now. lines are the full-height lines, such as the idle pause. */
export type GanttProps = ChartA11y & {
  rows: GanttRow[];
  start: number;
  end: number;
  now?: number;
  lines?: GanttMark[];
  selected?: string;
  onSelect?: (id: string) => void;
};

export type SankeyNode = { id: string; label: string };
/** Link width is value. */
export type SankeyLink = { source: string; target: string; value: number };
export type SankeyProps = ChartA11y & { nodes: SankeyNode[]; links: SankeyLink[]; onNode?: (id: string) => void };

/** A cell has a count on the sunk to chart-1 ramp, or a tone; label is its word for the tooltip and the table. */
export type HeatmapCell = { row: number; col: number; value: number | null; tone?: Tone; label: string };
export type HeatmapProps = ChartA11y & {
  rows: string[];
  cols: string[];
  cells: HeatmapCell[];
  onCell?: (cell: HeatmapCell) => void;
};

/** One dot per point and a tick at the median, per group. */
export type StripGroup = { label: string; points: { value: number; label: string; href?: string }[]; median?: number };
export type StripPlotProps = ChartA11y & { groups: StripGroup[]; unit: string };

/** The belt track: label is the status word; the screen reader text is "Stop N of M, <stop>". */
export type BeltProps = Toned & { stops: readonly string[]; at: number; live?: boolean };

export type TerminalState = 'running' | 'waiting on you' | 'connecting…' | 'output unavailable';
/** Append-only lines in a 200-line window; the cursor blinks only while running. */
export type TerminalProps = { title: string; lines: string[]; state: TerminalState };

export { ChartFrame } from './frame';
export { KpiCard, BarList, Spark, Tracker } from './tremor';
export { Gantt } from './gantt';
export { Sankey } from './lazy';
export { Heatmap } from './heatmap';
export { StripPlot } from './strip';
export { Belt } from './belt';
export { Terminal } from './terminal';
