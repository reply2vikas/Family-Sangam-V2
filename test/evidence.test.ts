// Tests that check the claims made in the README and docs against the actual files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { APP_DIRS, files, lintSource } from '../scripts/lint.ts';
import { progressCases } from './progress.cases.ts';

const root = new URL('../', import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), 'utf8');
const relative = (abs: string): string => abs.slice(root.pathname.length);
const appFiles = APP_DIRS.flatMap((d) => files(new URL(d, root).pathname)).map(relative);

test('no app file breaks the lint rules (no innerHTML, eval, var, console.log, keys, any, suppressions, long files)', () => {
  const problems = [...appFiles, 'scripts/lint.ts'].flatMap((f) => lintSource(f, read(f)));
  assert.deepEqual(problems, []);
});

test('the linter really catches each rule', () => {
  const bad = [
    'el.innerHTML = 1;',
    'eval(x);',
    'var a;',
    'console.log(1);',
    `const k = "AIza${'A'.repeat(30)}";`,
    'let x: any;',
    '// @ts-ignore',
  ].join('\n');
  assert.equal(lintSource('shared/x.ts', bad).length, 7);
  assert.equal(lintSource('shared/x.ts', 'x\n'.repeat(300)).length, 1);
  assert.deepEqual(lintSource('scripts/x.ts', 'console.log(1)'), [], 'scripts may print');
  assert.deepEqual(lintSource('test/x.ts', 'let y: any;'), [], 'tests get only the length rule');
});

test('strict TypeScript is on, and CI runs the type check, the linter, the formatter, the tests and the build', () => {
  const ts = JSON.parse(read('tsconfig.json')) as { compilerOptions: Record<string, unknown> };
  for (const flag of [
    'strict',
    'noUncheckedIndexedAccess',
    'noImplicitReturns',
    'noUnusedLocals',
    'noUnusedParameters',
    'erasableSyntaxOnly',
  ]) {
    assert.equal(ts.compilerOptions[flag], true, flag);
  }
  const ci = read('.github/workflows/ci.yml');
  for (const step of ['npm run typecheck', 'npm run lint', 'npm run format:check', 'npm run coverage', 'npm run build'])
    assert.ok(ci.includes(step), step);
});

test('layers only depend downward: shared imports nothing above it; server never imports client code', () => {
  const imports = (f: string): string[] =>
    [...read(f).matchAll(/^import (type )?[^;]*?from '([^']+)'/gm)].map((m) => `${m[1] ?? ''}${m[2] ?? ''}`);
  for (const f of appFiles) {
    const used = imports(f);
    if (f.startsWith('shared/'))
      assert.ok(
        used.every((s) => !/\.\.\/(server|client|api)\//.test(s)),
        f,
      );
    if (f.startsWith('server/') || f.startsWith('api/'))
      assert.ok(
        used.every((s) => !s.includes('client/')),
        f,
      );
    if (f.startsWith('client/'))
      assert.ok(
        used.every((s) => !/server\//.test(s) || s.startsWith('type ')),
        `${f} may only import types from server/`,
      );
  }
});

test('Content-Security-Policy forbids inline scripts and styles and outside connections', () => {
  const csp = JSON.stringify((JSON.parse(read('vercel.json')) as { headers: unknown }).headers);
  for (const part of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ])
    assert.ok(csp.includes(part), part);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
});

test('the page has the basics screen-reader and keyboard users need', () => {
  const html = read('client/index.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>[^<]{10,}<\/title>/);
  assert.match(html, /class="skip" href="#main"/);
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  assert.ok(!/<script(?![^>]*src=)/.test(html), 'no inline script');
  assert.ok(!/ style=/.test(html), 'no inline style attributes');
  assert.match(html, /aria-live="polite"/);
  for (const tag of html.match(/<input[^>]*id="([^"]+)"/g) ?? []) {
    const id = /id="([^"]+)"/.exec(tag)?.[1] ?? '';
    assert.ok(html.includes(`for="${id}"`), id);
  }
});

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string): number => {
  const [x = 0, y = 0] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('text colour pairs in styles.css meet WCAG AA (4.5:1)', () => {
  const css = read('client/styles.css');
  const v = Object.fromEntries(
    [...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
  const pairs = [
    ['ink', 'bg'],
    ['ink', 'card'],
    ['muted', 'bg'],
    ['muted', 'card'],
    ['brand-ink', 'brand'],
    ['accent-ink', 'accent'],
    ['accent', 'card'],
    ['accent', 'bg'],
    ['warn', 'warn-bg'],
    ['ok', 'ok-bg'],
    ['amber', 'amber-bg'],
    ['warn', 'card'],
    ['focus', 'bg'],
  ];
  for (const [fg = '', bg = ''] of pairs) {
    const r = ratio(v[fg] ?? '#000000', v[bg] ?? '#000000');
    assert.ok(r >= 4.5, `${fg} on ${bg}: ${r.toFixed(2)}`);
  }
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media print/);
});

test('the API key is only read on the server and never appears in browser code', () => {
  for (const f of appFiles.filter((p) => p.startsWith('client/'))) assert.ok(!/GEMINI|process\.env/.test(read(f)), f);
  assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(read('README.md') + read('.env.example')));
  assert.ok(existsSync(new URL('.env.example', root)));
  assert.match(read('.gitignore'), /^\.env$/m);
});

test('zod is the only runtime dependency; everything else is build and test tooling', () => {
  const pkg = JSON.parse(read('package.json')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['zod']);
  assert.deepEqual(Object.keys(pkg.devDependencies ?? {}).sort(), ['@types/node', 'esbuild', 'prettier', 'typescript']);
});

test('the docs promised in the README exist and are not empty', () => {
  for (const f of [
    'README.md',
    'docs/ARCHITECTURE.md',
    'docs/GENAI.md',
    'docs/SECURITY.md',
    'docs/ACCESSIBILITY.md',
    'docs/TESTING.md',
    'docs/EVALUATION.md',
    'LICENSE',
  ]) {
    assert.ok(read(f).length > 400, f);
  }
  for (const link of read('README.md').match(/docs\/[A-Z]+\.md/g) ?? [])
    assert.ok(existsSync(new URL(link, root)), link);
});

test('saved-progress cleaning drops malformed entries', progressCases);
