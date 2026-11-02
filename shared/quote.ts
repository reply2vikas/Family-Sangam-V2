// Vendor quotes: clean what the AI extracted, add checks done by plain code, and compare
// the price with what the plan has set aside for that line.

import { cleanText } from './schema.ts';
import { formatINR } from './money.ts';
import { asList, asRecord } from './guards.ts';

export interface Quote {
  vendorName: string;
  total: number;
  advance: number | null;
  inclusions: string[];
  exclusions: string[];
  redFlags: string[];
  refundTerms: string;
}

export type QuoteVerdict = 'within' | 'slightly-over' | 'over';

export interface QuoteComparison {
  diff: number;
  pct: number | null;
  verdict: QuoteVerdict;
  text: string;
}

const MAX = 100_000_000;
const MULTIPLIER: Record<string, number> = { lakh: 100000, lac: 100000, k: 1000 };

const toInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= MAX ? v : null;
const list = (a: unknown, n: number, len: number): string[] =>
  asList(a)
    .slice(0, n)
    .map((x) => cleanText(x, len))
    .filter(Boolean);

/** Words in a quote that usually mean extra cost or lost money. Checked by code, not by the model. */
const FLAG_RULES: [RegExp, string][] = [
  [/non[- ]?refundable|no refund/i, 'Advance may be non-refundable'],
  [/(\+|plus|extra)\s*gst|gst\s*(extra|additional|excluded)|exclusive of (gst|tax)/i, 'GST may be charged on top'],
  [/service charge/i, 'Service charge mentioned'],
  [/overtime|extra hour|additional hour/i, 'Extra charges for overtime'],
  [/travel (cost|charges?|expenses?)|transport (cost|charges?)/i, 'Travel costs may be extra'],
  [/subject to change|prices? may (change|vary)/i, 'Price is not fixed'],
];

/** Warnings found in the quote text by plain code. */
export function codeFlags(text: unknown): string[] {
  const t = String(text || '');
  return FLAG_RULES.filter(([re]) => re.test(t)).map(([, label]) => label);
}

/** Clean an extracted quote; null when no usable total price was found. */
export function cleanQuote(input: unknown, sourceText = ''): Quote | null {
  const raw = asRecord(input);
  const total = toInt(raw.total);
  if (!total) return null;
  const flags = [...new Set([...list(raw.redFlags, 6, 140), ...codeFlags(sourceText)])].slice(0, 8);
  return {
    vendorName: cleanText(raw.vendorName, 60),
    total,
    advance: toInt(raw.advance),
    inclusions: list(raw.inclusions, 8, 100),
    exclusions: list(raw.exclusions, 8, 100),
    redFlags: flags,
    refundTerms: cleanText(raw.refundTerms, 200),
  };
}

/** Compare a quote with the amount the plan set aside. */
export function compareQuote(planned: number, quote: Quote): QuoteComparison {
  const diff = quote.total - planned;
  const pct = planned > 0 ? Math.round((diff * 100) / planned) : null;
  let verdict: QuoteVerdict = 'within';
  if (diff > 0) verdict = pct !== null && pct <= 10 ? 'slightly-over' : 'over';
  const text =
    diff <= 0
      ? `${formatINR(quote.total)} is within your plan of ${formatINR(planned)}${diff < 0 ? ` (${formatINR(-diff)} to spare)` : ''}.`
      : `${formatINR(quote.total)} is ${formatINR(diff)} above your plan of ${formatINR(planned)}${pct === null ? '' : ` (${pct}% over)`}.`;
  return { diff, pct, verdict, text };
}

/** Offline reader: finds the largest rupee amount in the text, plus the code checks. */
export function offlineQuote(text: unknown): Quote | null {
  const src = String(text || '').slice(0, 3000);
  const amounts: number[] = [];
  const re = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lac|k)?|(\d+(?:\.\d+)?)\s*(lakh|lac)\b/gi;
  for (const m of src.matchAll(re)) {
    const num = Number((m[1] ?? m[3] ?? '').replace(/,/g, ''));
    const unit = (m[2] ?? m[4] ?? '').toLowerCase();
    const value = Math.round(num * (MULTIPLIER[unit] ?? 1));
    if (Number.isFinite(value)) amounts.push(value);
  }
  if (!amounts.length) return null;
  return cleanQuote({ total: Math.max(...amounts) }, src);
}
