// A tiny self-check so the owner can see whether Gemini is reachable. It never returns the key.

import { generateJSON, GeminiError } from './gemini.ts';
import type { Env, GeminiDeps } from './gemini.ts';
import { field } from '../shared/guards.ts';

const TTL_MS = 60_000;

export interface Health {
  keyPresent: boolean;
  /** The key has a plausible shape (Google keys are long runs of letters, digits, '-', '_' or '.'). */
  keyLooksValid: boolean;
  gemini: string;
  model?: string;
  cached?: boolean;
}

let cached: { at: number; body: Health } | null = null;

export function resetHealth(): void {
  cached = null;
}

export async function checkHealth(env: Env, deps: GeminiDeps = {}): Promise<Health> {
  const now = (deps.now ?? Date.now)();
  if (cached && now - cached.at < TTL_MS) return { ...cached.body, cached: true };
  const key = env.GEMINI_API_KEY ?? '';
  const body: Health = {
    keyPresent: key.length > 0,
    keyLooksValid: /^[0-9A-Za-z._-]{30,}$/.test(key),
    gemini: 'not tested',
  };
  if (body.keyPresent) {
    try {
      const r = await generateJSON({
        system: 'Reply with JSON only.',
        user: 'Return {"ok": true}.',
        apiKey: key,
        schema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } } },
        timeoutMs: 15_000,
        ...deps,
      });
      body.gemini = field(r.data, 'ok') === true ? 'working' : 'answered but unexpected';
      body.model = r.model;
    } catch (err) {
      body.gemini = err instanceof GeminiError ? `failed: ${err.reason || err.code}` : 'failed';
    }
  } else {
    body.gemini = 'GEMINI_API_KEY is not set for this deployment';
  }
  cached = { at: now, body };
  return body;
}
