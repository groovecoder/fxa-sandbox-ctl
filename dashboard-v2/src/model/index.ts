// C2, the selector names and signatures. W1-DATA ports each from dashboard/index.html, tests it
// against test/golden/, and refines the result types below without a change to the signatures.
import type { Session, Store } from '../store/types';

type Row = Record<string, unknown>;
export type Snapshot = Row;
export type Card = Row;
export type Ticket = Row;
export type BoardItem = Row;
export type LaneRow = Row;
export type BeltGroups = Row;
export type FloorRow = Row;
export type OvFloor = Row;
export type SbRow = Row;
export type Instance = Row;
export type StatsRow = Row;
export type PrRow = Row;
export type ReviewRow = Row;
export type SkippedTicket = Row;
export type Team = Row;
export type Verdict = { label: string; tone: string };
export type Badge = { n: number | string; tone: string; label: string };
export type Needs = { total: number; sandbox: number; by: Record<string, number>; unknown: boolean };
export type Health = { level: '' | 'dead' | 'warn' | 'paused'; word: string; title: string };
export type Alert = { tone: 'bad' | 'warn'; subject: string; what: string; fix?: string };
export type CostPerMerged = { mergedIn: PrRow[]; spentIn: number };

const notDone = (): never => {
  throw new Error('not done');
};

export const pipeSnap: (s: Store) => Snapshot | null = notDone;
export const merged: (s: Store) => { cards: Card[]; waiting: Ticket[] } = notDone;
export const boardItems: (s: Store) => BoardItem[] = notDone;
export const classify: (s: Store, item: BoardItem) => string = notDone;
export const laneRows: (s: Store) => LaneRow[] = notDone;
export const beltGroups: (s: Store) => BeltGroups = notDone;
export const beltCount: (g: BeltGroups) => number | null = notDone;
export const floorRows: (s: Store) => FloorRow[] = notDone;
export const ovFloor: (s: Store) => OvFloor = notDone;
export const ovNeeds: (s: Store) => Needs = notDone;
export const sbRows: (s: Store) => SbRow[] = notDone;
export const sbBadge: (s: Store) => Badge = notDone;
export const strays: (s: Store) => Instance[] = notDone;
// [lo, hi) in epoch ms of local days; hi is Infinity for an open range.
export const statsBounds: (range: string, now: number, custom?: { from: string; to: string }) => [number, number] = notDone;
export const answerRows: (s: Store) => StatsRow[] = notDone;
export const sessHeads: (sessions: Session[]) => Session[] = notDone;
export const chainOf: (session: Session, sessions: Session[]) => Session[] = notDone;
export const sessStatus: (s: Store, session: Session) => [string, string] = notDone;
export const sessUsd: (s: Store, session: Session) => number | null = notDone;
export const isWaitingOnHuman: (row: ReviewRow) => boolean = notDone;
export const verdictTag: (row: ReviewRow) => Verdict | null = notDone;
export const queueWaits: (s: Store) => SkippedTicket[] = notDone;
export const skipGroups: (ks: SkippedTicket[]) => [string, SkippedTicket[]][] = notDone;
export const teamNeeds: (s: Store, team: Team) => boolean = notDone;
export const teamBadge: (s: Store, teams: Team[]) => '' | 'warn' | 'bad' = notDone;
export const teamErrs: (s: Store) => Record<string, number> | null = notDone;
export const costPerMerged: (lo: number, hi: number, prs: PrRow[], rows: StatsRow[]) => CostPerMerged = notDone;
export const health: (s: Store) => Health = notDone;
export const alerts: (s: Store) => Alert[] = notDone;
