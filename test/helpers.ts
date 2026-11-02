// Shared test helpers: seeded random seasons, fake Gemini replies, and fake HTTP objects.

import assert from 'node:assert/strict';
import { addDays } from '../shared/dates.ts';
import { normalizeSeason } from '../shared/schema.ts';
import { TYPE_IDS } from '../shared/templates.ts';
import { HttpError } from '../server/http.ts';
import type { ApiRequest, ApiResponse, Handler } from '../server/http.ts';
import { GeminiError } from '../server/gemini.ts';
import type { FetchLike, FetchResponse } from '../server/gemini.ts';
import type { Season } from '../shared/types.ts';

/** Small seeded random generator so property tests are repeatable. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

export const TODAY = '2026-11-01';

/** A random but valid season. */
export function randomSeason(seed: number): Season {
  const r = rng(seed);
  const count = int(r, 1, 4);
  return {
    name: 'Random',
    startDate: TODAY,
    startBalance: int(r, 0, 800000),
    incomes: Array.from({ length: int(r, 0, 4) }, (_, i) => ({
      id: `i${i + 1}`,
      label: `Inc ${i}`,
      date: addDays(TODAY, int(r, 0, 120)),
      amount: int(r, 10000, 600000),
    })),
    events: Array.from({ length: count }, (_, i) => ({
      id: `e${i + 1}`,
      type: TYPE_IDS[int(r, 0, TYPE_IDS.length - 1)] ?? 'wedding',
      name: `Event ${i + 1}`,
      date: addDays(TODAY, int(r, 15, 150)),
      guests: int(r, 10, 400),
      budget: int(r, 50000, 2000000),
    })),
  };
}

/** normalizeSeason for input the test expects to be valid. */
export function valid(input: unknown): Season {
  const r = normalizeSeason(input);
  assert.ok(r.ok, r.ok ? '' : r.errors.join(' '));
  return r.season;
}

/** Environment with a (fake) Gemini key. */
export const KEY = { GEMINI_API_KEY: 'test-key' };

/** A Gemini reply whose JSON text is `obj`. */
export const reply = (obj: unknown): FetchResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
});

/** An HTTP failure with the given status. */
export const failure = (code: number): FetchResponse => ({ ok: code < 400, status: code, json: async () => ({}) });

/** A fetch that always answers with `obj`. */
export const answering =
  (obj: unknown): FetchLike =>
  async () =>
    reply(obj);

/** A fetch that records the user prompt it was sent, then answers with `obj`. */
export function recording(obj: unknown): { fetchImpl: FetchLike; prompt: () => string } {
  let sent = '';
  return {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init.body)) as { contents: { parts: { text: string }[] }[] };
      sent = body.contents[0]?.parts[0]?.text ?? '';
      return reply(obj);
    },
    prompt: () => sent,
  };
}

/** Predicates for assert.rejects. */
export const hasStatus =
  (code: number) =>
  (e: unknown): boolean =>
    e instanceof HttpError && e.status === code;
export const geminiCode =
  (code: string) =>
  (e: unknown): boolean =>
    e instanceof GeminiError && e.code === code;

export interface FakeResponse extends ApiResponse {
  headers: Record<string, string>;
  body: string;
}

export function fakeRes(): FakeResponse {
  const res: FakeResponse = {
    headers: {},
    statusCode: 0,
    body: '',
    setHeader: (k, v) => {
      res.headers[k] = v;
    },
    end: (b = '') => {
      res.body = b;
    },
  };
  return res;
}

/** Call a route handler and return the response with its parsed JSON body. */
export async function call(handler: Handler, req: ApiRequest): Promise<FakeResponse & { json: unknown }> {
  const res = fakeRes();
  await handler(req, res);
  return { ...res, json: res.body ? (JSON.parse(res.body) as unknown) : null };
}
