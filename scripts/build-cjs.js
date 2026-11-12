#!/usr/bin/env node
// Builds the CommonJS entry point (dist/index.cjs) and its type declarations
// (dist/index.d.cts) from the ESM source, so `require('wareki-kit')` works on Node
// versions that cannot require() an ES module. Zero dependencies: the source only
// uses `export const` and `export function`, so the transform is a text replace.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

/** ESM source -> CommonJS source. Throws if the source uses syntax this script cannot convert. */
export function buildCjs(source) {
  const unsupported = source.match(/^(?:import\b|export\s+(?!(?:const|function)\b)).*/m);
  if (unsupported) {
    throw new Error(`build-cjs: unsupported syntax in src/index.js: ${unsupported[0]}`);
  }
  const names = [...source.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
  const body = source.replace(/^export (?=(?:const|function)\b)/gm, '');
  const exportsList = names.map((name) => `  ${name},`).join('\n');
  return `'use strict';\n// Generated from src/index.js by scripts/build-cjs.js. Do not edit by hand.\n${body}\nmodule.exports = {\n${exportsList}\n};\n`;
}

/** The type declarations need no conversion, only a header and a .d.cts name. */
export function buildDts(source) {
  return `// Generated from src/index.d.ts by scripts/build-cjs.js. Do not edit by hand.\n${source}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (path) => readFileSync(new URL(path, root), 'utf8');
  mkdirSync(new URL('dist/', root), { recursive: true });
  writeFileSync(new URL('dist/index.cjs', root), buildCjs(read('src/index.js')));
  writeFileSync(new URL('dist/index.d.cts', root), buildDts(read('src/index.d.ts')));
  console.log('built dist/index.cjs and dist/index.d.cts');
}
