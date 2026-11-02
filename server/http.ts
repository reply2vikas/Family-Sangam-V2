// Shared request handling for the API routes: method check, size limit, rate limit,
// body validation with zod, and JSON replies.

import type { z } from 'zod';
import type { Env } from './gemini.ts';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const MAX_BODY_BYTES = 16_000;
const MAX_TRACKED_ADDRESSES = 5000;

/** The parts of the platform's request object the routes use. */
export interface ApiRequest {
  method?: string | undefined;
  headers?: Record<string, string | string[] | undefined> | undefined;
  body?: unknown;
}

/** The parts of the platform's response object the routes use. */
export interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

export type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void>;

/** An error with an HTTP status whose message is safe to show to the person. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function httpError(status: number, message: string): HttpError {
  return new HttpError(status, message);
}

const hits = new Map<string, number[]>();

export function resetRateLimit(): void {
  hits.clear();
}

/** Best effort per server instance: counts requests per address in a sliding minute. */
function limited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > MAX_TRACKED_ADDRESSES) hits.clear(); // keep memory bounded on a long-lived instance
  return recent.length > MAX_PER_WINDOW;
}

function send(res: ApiResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function clientAddress(req: ApiRequest): string {
  const header = req.headers?.['x-forwarded-for'];
  const value = Array.isArray(header) ? header[0] : header;
  return (
    String(value ?? 'local')
      .split(',')[0]
      ?.trim() || 'local'
  );
}

export interface RouteOptions {
  env?: Env;
  now?: () => number;
}

/**
 * Wrap a POST route. The body must be a small JSON object that matches `schema`;
 * `run(body, env)` returns a JSON-able object or throws an HttpError.
 */
export function route<S extends z.ZodType>(
  schema: S,
  run: (body: z.infer<S>, env: Env) => Promise<unknown>,
  { env = process.env, now = Date.now }: RouteOptions = {},
): Handler {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      return send(res, 405, { error: 'Use POST.' });
    }
    if (limited(clientAddress(req), now()))
      return send(res, 429, { error: 'Too many requests. Try again in a minute.' });
    const { body } = req;
    if (!body || typeof body !== 'object' || JSON.stringify(body).length > MAX_BODY_BYTES) {
      return send(res, 400, { error: 'Send a small JSON body.' });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return send(res, 400, { error: 'The request was not in the expected format.' });
    try {
      return send(res, 200, await run(parsed.data, env));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return send(res, status, { error: err instanceof HttpError ? err.message : 'Something went wrong.' });
    }
  };
}
