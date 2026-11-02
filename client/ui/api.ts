// Calls our own server routes. The browser never sees an API key.

import { field } from '../../shared/guards.ts';

/**
 * POST JSON to one of this app's routes and return its answer. The type parameter names the
 * route's result type (exported by the server module), so callers stay in step with the server.
 */
export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const message = field(data, 'error');
    throw new Error(typeof message === 'string' && message ? message : 'That did not work. Please try again.');
  }
  return data as T;
}
