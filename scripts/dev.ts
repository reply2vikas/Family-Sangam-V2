// Local dev server: serves the built site/ folder and runs the api/ routes.
// Usage: npm run dev   (set GEMINI_API_KEY to use Gemini; without it the app uses its fallbacks)

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ApiRequest, ApiResponse, Handler } from '../server/http.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
};
const port = Number(process.env.PORT) || 3000;

async function runApi(name: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let raw = '';
  for await (const chunk of req) raw += String(chunk);
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  try {
    const mod = (await import(pathToFileURL(join(root, 'api', `${name}.ts`)).href)) as { default: Handler };
    const apiReq: ApiRequest = { method: req.method, headers: req.headers, body };
    await mod.default(apiReq, res as ApiResponse);
  } catch {
    res.statusCode = 404;
    res.end('{}');
  }
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      void runApi(url.pathname.slice(5).replace(/[^a-z]/g, ''), req, res);
      return;
    }
    const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    readFile(join(root, 'site', rel))
      .then((body) => {
        res.setHeader('content-type', types[extname(rel)] ?? 'application/octet-stream');
        res.end(body);
      })
      .catch(() => {
        res.statusCode = 404;
        res.end('Not found');
      });
  })
  .listen(port, () => process.stdout.write(`http://localhost:${port}\n`));
