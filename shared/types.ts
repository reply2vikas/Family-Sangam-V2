// Shared domain types. The compiler checks them everywhere (`npm run typecheck`);
// values that cross a trust boundary are still validated at runtime by schema.ts and zod.

export type EventType = 'wedding' | 'birthday' | 'community';

/** Money the family expects to receive, in whole rupees. */
export interface Income {
  id: string;
  label: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  amount: number;
}

export interface CelebrationEvent {
  id: string;
  type: EventType;
  name: string;
  /** ISO date */
  date: string;
  guests: number;
  /** whole rupees */
  budget: number;
  /** Amounts the family typed over, by budget line id. */
  overrides?: Record<string, number>;
}

/** Small patches merged into the season by the "ways to close the gap" fixes. */
export interface Adjust {
  /** Payment id to the later ISO date it is paid on. */
  shifted: Record<string, string>;
  /** Budget line keys ("eventId:lineId") that are skipped. */
  trimmed: string[];
  /** Event ids whose contingency reserve is held back. */
  reserve: string[];
}

export interface Season {
  name: string;
  startDate: string;
  startBalance: number;
  incomes: Income[];
  events: CelebrationEvent[];
  adjust?: Adjust;
  /** Percent added to every budget by the "Vendor prices rise" scenario. */
  priceUpPct?: number;
}

export interface BudgetLine {
  /** "eventId:lineId" */
  key: string;
  id: string;
  label: string;
  /** A must-have: never cut by a fix. */
  must: boolean;
  vendor: string | null;
  /** The contingency line. */
  reserve: boolean;
  perGuest: boolean;
  amount: number;
  /** "you" when the family typed the amount. */
  source: 'estimate' | 'you';
  trimmed: boolean;
}

export interface Payment {
  id: string;
  eventId: string;
  lineKey: string;
  label: string;
  kind: 'advance' | 'balance';
  amount: number;
  /** When it is paid now. */
  date: string;
  /** The date before any fix moved it. */
  original: string;
  earliest: string;
  /** The last date a fix may move it to. */
  latest: string;
  refundableUntil: string | null;
  /** Due before the season starts. */
  overdue: boolean;
}

export interface Task {
  key: string;
  id: string;
  eventId: string;
  label: string;
  due: string;
  /** Keys of tasks that must be finished first. */
  after: string[];
}

export interface TaskStatus extends Task {
  finished: boolean;
  late: boolean;
  waitingOn: string[];
  atRisk: boolean;
}

export interface PlannedEvent extends CelebrationEvent {
  lines: BudgetLine[];
  payments: Payment[];
  tasks: Task[];
  perGuest: number;
  savedByTrim: number;
}

export interface Plan {
  events: PlannedEvent[];
  payments: Payment[];
}

export interface DayBalance {
  date: string;
  balance: number;
}

export interface CashCalendar {
  days: DayBalance[];
  /** The worst day of the season. */
  lowest: DayBalance;
  /** The first day the balance goes below zero, or null. */
  shortfall: DayBalance | null;
  /** Extra cash the worst day would have needed. */
  needed: number;
}

export type FixType = 'move' | 'reserve' | 'trim';

export interface FixCandidate {
  type: FixType;
  patch: Partial<Adjust>;
  label: string;
  detail: string;
}

export interface Fix extends FixCandidate {
  id: string;
  /** Closes the gap by itself. */
  resolved: boolean;
  shortfallAfter: string | null;
  lowestAfter: number;
  /** How much the worst day improves. */
  gain: number;
}
