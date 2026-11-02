// Builds the static site into site/: one bundled, minified browser module plus the page and styles.
// The API routes in api/ are compiled by Vercel itself.
import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';

const out = 'site';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await build({
  entryPoints: ['client/app.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  outfile: `${out}/app.js`,
  logLevel: 'warning',
});
await Promise.all(['index.html', 'styles.css'].map((f) => copyFile(`client/${f}`, `${out}/${f}`)));
process.stdout.write(`built ${out}/\n`);
