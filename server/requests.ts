// The shape of each API request body, checked with zod before any route code runs.
// These schemas check types and sizes only; the routes then check meaning (a known event
// type, a valid date) so they can give a specific, friendly message.

import { z } from 'zod';

const text = (max: number) => z.string().max(max);
const whole = z.number().int();

/** The season travels as plain JSON; shared/schema.ts normalizeSeason cleans it fully. */
const season = z.unknown();

/** The few event fields the writing helpers need. */
const eventSummary = z.object({
  type: z.string().optional(),
  name: z.string().optional(),
  date: z.string().optional(),
  guests: whole.optional(),
});

export const BriefRequest = z.object({ text: text(4000), today: z.string() });
export const ChangeRequest = z.object({ text: text(2000), season });
export const IdeasRequest = z.object({
  type: z.string(),
  guests: whole.optional(),
  budget: whole.optional(),
  city: text(400).optional(),
  vibe: text(1000).optional(),
});
export const QuoteRequest = z.object({ text: text(8000), planned: whole.optional(), lineLabel: text(200).optional() });
export const MessageRequest = z.object({
  kind: z.string(),
  language: z.string().optional(),
  event: eventSummary.optional(),
  vendor: text(200).optional(),
  note: text(1000).optional(),
});
export const EventHelpRequest = z.object({ event: eventSummary, note: text(1000).optional() });
export const SavingsRequest = z.object({ season, eventId: z.string().optional(), note: text(1000).optional() });
export const ExplainRequest = z.object({ season, language: z.string().optional() });
export const RsvpRequest = z.object({ text: text(8000) });

export type BriefBody = z.infer<typeof BriefRequest>;
export type ChangeBody = z.infer<typeof ChangeRequest>;
export type IdeasBody = z.infer<typeof IdeasRequest>;
export type QuoteBody = z.infer<typeof QuoteRequest>;
export type MessageBody = z.infer<typeof MessageRequest>;
export type EventHelpBody = z.infer<typeof EventHelpRequest>;
export type SavingsBody = z.infer<typeof SavingsRequest>;
export type ExplainBody = z.infer<typeof ExplainRequest>;
export type RsvpBody = z.infer<typeof RsvpRequest>;
