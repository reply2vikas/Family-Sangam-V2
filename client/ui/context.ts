// What every screen-building function receives: the current plan plus the actions it may take.
// app.ts builds it; the screens only read it and call its functions.

import type { CashCalendar, Fix, Plan, PlannedEvent, Season } from '../../shared/types.ts';
import type { Progress, VendorProgress } from '../../shared/progress.ts';
import type { ChangeResult, IdeasResult } from '../../server/tasks.ts';
import type { MessageResult, QuoteResult } from '../../server/writing.ts';
import type { MessageBody, QuoteBody } from '../../server/requests.ts';

export interface Ctx {
  season: Season;
  plan: Plan;
  today: string;
  progress: Progress;
  ideaCache: Record<string, IdeasResult>;
  cal: CashCalendar;
  fixes: Fix[];
  /** Show a status message (announced to screen readers). */
  say(message: string, bad?: boolean): void;
  applyFix(fix: Fix): void;
  /** Validate and save a new season, keeping the old one for undo. */
  commit(season: Season, note: string): void;
  requestChange(text: string): Promise<ChangeResult>;
  fetchIdeas(ev: PlannedEvent, city: string, vibe: string): Promise<IdeasResult>;
  ask<T>(path: string, body: unknown): Promise<T>;
  readQuote(body: QuoteBody): Promise<QuoteResult>;
  draftMessage(body: MessageBody): Promise<MessageResult>;
  copy(text: string): Promise<void>;
  /** Set (or clear, with null) the family's own amount for one budget line. */
  setOverride(eventId: string, lineId: string | null, value: number | null): void;
  toggleTask(key: string): void;
  setVendor(key: string, patch: Partial<VendorProgress>): void;
}

/** The message from anything thrown, for showing to the person. */
export const errorText = (err: unknown): string => (err instanceof Error ? err.message : 'Something went wrong.');
