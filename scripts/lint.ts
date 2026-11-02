// Project rules that the TypeScript compiler does not check. Run: npm run lint
// (exits 1 when a rule is broken). Unused code is caught by the compiler (noUnusedLocals).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export const MAX_LINES = 260;
export const APP_DIRS = ['shared', 'server', 'client', 'api'];

const RULES: [RegExp, string][] = [
  [/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write\(/, 'no HTML string injection'],
  [/\beval\(|new Function\(/, 'no eval'],
  [/\bvar\s/, 'use let/const'],
  [/console\.(log|debug)\(/, 'no console logging in shipped code'],
  [/AIza[0-9A-Za-z_-]{20,}/, 'no API keys in source'],
  [/:\s*any\b|\bas any\b|<any>/, 'no "any" type'],
  [/@ts-(ignore|expect-error|nocheck)/, 'no compiler suppressions'],
];

/** All .ts files under `dir`, skipping dependencies and build output. */
export function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'site'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (extname(full) === '.ts') out.push(full);
  }
  return out;
}

/** Problems in one file. App code gets every rule; scripts and tests only the length rule. */
export function lintSource(path: string, text: string): string[] {
  const problems: string[] = [];
  const lines = text.split('\n');
  if (lines.length > MAX_LINES) problems.push(`${path}: ${lines.length} lines (max ${MAX_LINES})`);
  if (!APP_DIRS.some((d) => path.startsWith(`${d}/`))) return problems;
  lines.forEach((line, i) => {
    for (const [re, why] of RULES) if (re.test(line)) problems.push(`${path}:${i + 1}: ${why}`);
  });
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = [...APP_DIRS, 'scripts', 'test']
    .flatMap((d) => files(d))
    .flatMap((f) => lintSource(f, readFileSync(f, 'utf8')));
  problems.forEach((p) => process.stderr.write(`${p}\n`));
  process.stdout.write(problems.length ? `${problems.length} problem(s)\n` : 'lint ok\n');
  process.exit(problems.length ? 1 : 0);
}
