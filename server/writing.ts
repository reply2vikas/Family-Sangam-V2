// Two more Gemini tasks: reading a pasted vendor quote, and drafting a message in the
// family's language. Same pattern as tasks.ts: fenced prompt, structured JSON, code validates.

import { askGemini, fence, str, int, obj, arr } from './gemini.ts';
import type { Env, GeminiDeps } from './gemini.ts';
import { httpError } from './http.ts';
import type { MessageBody, QuoteBody } from './requests.ts';
import { cleanText } from '../shared/schema.ts';
import { cleanQuote, compareQuote, offlineQuote } from '../shared/quote.ts';
import type { Quote, QuoteComparison } from '../shared/quote.ts';
import { cleanMessage, offlineMessage, KINDS, isLanguage, isMessageKind } from '../shared/message.ts';
import type { Language, MessageKind } from '../shared/message.ts';
import { isISODate } from '../shared/dates.ts';
import { isEventType } from '../shared/templates.ts';

const QUOTE_SCHEMA = obj(
  {
    vendorName: str,
    total: int,
    advance: int,
    inclusions: arr(str),
    exclusions: arr(str),
    redFlags: arr(str),
    refundTerms: str,
  },
  ['total'],
);
const MESSAGE_SCHEMA = obj({ subject: str, body: str }, ['body']);

export interface QuoteResult {
  source: 'gemini' | 'offline-reader';
  model: string | undefined;
  quote: Quote;
  comparison: QuoteComparison | null;
}

export interface MessageResult {
  source: 'gemini' | 'offline-template';
  model?: string;
  language: Language;
  kind: MessageKind;
  subject: string;
  body: string;
  note?: string;
}

export async function runQuote(body: QuoteBody, env: Env, deps: GeminiDeps = {}): Promise<QuoteResult> {
  const text = String(body.text ?? '')
    .replace(/[<>]/g, ' ')
    .trim()
    .slice(0, 2500);
  if (text.length < 10) throw httpError(400, "Paste the vendor's quote text first.");
  const planned =
    body.planned !== undefined && Number.isSafeInteger(body.planned) && body.planned >= 0 ? body.planned : 0;
  const label = cleanText(body.lineLabel, 60) || 'this item';
  const user = [
    `Read this vendor quote for "${fence(label, 60)}". Return the vendor name, the total price in rupees, the advance asked (if any), what is included, what is NOT included, any red flags (hidden or extra costs, non-refundable terms, unclear scope), and the refund terms.`,
    'If the price is given per head or per day, multiply out only when the quantity is stated. If you cannot find a total, set total to 0.',
    `<data>${text}</data>`,
  ].join('\n');
  const answer = await askGemini(QUOTE_SCHEMA, user, env, deps);
  const fromModel = answer ? cleanQuote(answer.data, text) : null;
  const quote = fromModel ?? offlineQuote(text);
  if (!quote) throw httpError(422, 'I could not find a total price in that text. Paste the part with the amount.');
  return {
    source: fromModel ? 'gemini' : 'offline-reader',
    model: answer?.model,
    quote,
    comparison: planned ? compareQuote(planned, quote) : null,
  };
}

export async function runMessage(body: MessageBody, env: Env, deps: GeminiDeps = {}): Promise<MessageResult> {
  const kind = isMessageKind(body.kind) ? body.kind : null;
  if (!kind) throw httpError(400, 'Choose what kind of message to write.');
  const language: Language = isLanguage(body.language) ? body.language : 'English';
  const ev = body.event ?? {};
  const date = isISODate(ev.date) ? ev.date : undefined;
  const vendor = cleanText(body.vendor, 40);
  const details = {
    name: cleanText(ev.name, 60) || 'our celebration',
    type: isEventType(ev.type) ? ev.type : 'event',
    date,
    ...(vendor ? { vendor } : {}),
  };
  const user = [
    `Write a short, warm, polite message in ${language}. Kind: ${KINDS[kind]}. For ${language === 'Hinglish' ? 'Hinglish (Hindi written in the English alphabet, the way people text)' : language}.`,
    `Event: ${fence(details.name, 60)} (${details.type})${date ? ` on ${date}` : ''}.${details.vendor ? ` Vendor: ${fence(details.vendor, 40)}.` : ''}`,
    'Keep it under 120 words. Do not invent addresses, phone numbers, prices or times.',
    `<data>Extra note from the family: ${fence(body.note, 300)}</data>`,
  ].join('\n');
  const answer = await askGemini(MESSAGE_SCHEMA, user, env, deps);
  const msg = answer ? cleanMessage(answer.data) : null;
  if (answer && msg) return { source: 'gemini', model: answer.model, language, kind, ...msg };
  return {
    source: 'offline-template',
    language: 'English',
    kind,
    ...offlineMessage(kind, details),
    note:
      language === 'English'
        ? 'Gemini was not reachable, so this is a built-in template.'
        : `Gemini was not reachable, so this is an English template instead of ${language}.`,
  };
}
