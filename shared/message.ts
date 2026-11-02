// Messages a family sends: invitations and vendor notes. Gemini writes them in the chosen
// language; this file holds the allowed choices, the clean-up and an English offline template.

import { formatDate, isISODate } from './dates.ts';
import { field } from './guards.ts';

export type MessageKind = 'invitation' | 'vendor_followup' | 'move_advance' | 'thanks';
export type Language = 'English' | 'Hindi' | 'Hinglish';

export interface Message {
  subject: string;
  body: string;
}

export interface MessageContext {
  name?: string;
  date?: unknown;
  vendor?: string;
}

export const KINDS: Record<MessageKind, string> = {
  invitation: 'Invitation to guests',
  vendor_followup: 'Follow-up to a vendor',
  move_advance: 'Ask a vendor to pay the advance later',
  thanks: 'Thank-you note after the event',
};
export const LANGUAGES: Language[] = ['English', 'Hindi', 'Hinglish'];

export const isMessageKind = (v: unknown): v is MessageKind => typeof v === 'string' && v in KINDS;
export const isLanguage = (v: unknown): v is Language => (LANGUAGES as unknown[]).includes(v);

/** Keep line breaks, drop markup characters and control characters. */
export function cleanBody(value: unknown, max = 900): string {
  return String(value ?? '')
    .replace(/[<>]/g, ' ')
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** Clean a written message; null when there is no body. */
export function cleanMessage(raw: unknown): Message | null {
  const body = cleanBody(field(raw, 'body'));
  if (!body) return null;
  return { subject: cleanBody(field(raw, 'subject'), 100).replace(/\n/g, ' '), body };
}

/** English fallback used when Gemini is not reachable. */
export function offlineMessage(
  kind: unknown,
  { name = 'our celebration', date, vendor }: MessageContext = {},
): Message {
  const hello = vendor ? `Hello ${vendor},` : 'Hello,';
  const when = isISODate(date) ? formatDate(date) : 'the planned date';
  const templates: Record<MessageKind, [string, string]> = {
    invitation: [
      `Invitation: ${name}`,
      `Namaste! We would be delighted to have you with us for ${name} on ${when}. Please let us know if you can come, so we can plan for everyone.`,
    ],
    vendor_followup: [
      `Following up: ${name}`,
      `${hello} I am writing about ${name} on ${when}. Could you please confirm the booking, the final price and what is included? Thank you.`,
    ],
    move_advance: [
      `Request about the advance for ${name}`,
      `${hello} for ${name} on ${when}, could we pay the advance a few days later than planned? We are happy to confirm the booking in writing today. Please let us know what works.`,
    ],
    thanks: [`Thank you for ${name}`, `Thank you for being part of ${name}. Your presence meant a lot to our family.`],
  };
  const [subject, body] = templates[isMessageKind(kind) ? kind : 'invitation'];
  return { subject, body };
}
