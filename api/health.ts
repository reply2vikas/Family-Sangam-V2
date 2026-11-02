// GET /api/health: is the Gemini key set, and does a tiny test call work? Never returns the key.
import { checkHealth } from '../server/health.ts';
import type { ApiRequest, ApiResponse } from '../server/http.ts';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('{"error":"Use GET."}');
    return;
  }
  res.statusCode = 200;
  res.end(JSON.stringify(await checkHealth(process.env)));
}
