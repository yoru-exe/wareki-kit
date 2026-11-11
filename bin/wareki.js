#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { formatWareki, parseWareki, toWareki } from '../src/index.js';

const HELP = `wareki: convert between Gregorian dates and Japanese era (和暦) dates

Usage:
  wareki [date] [options]

  wareki                    today in wareki
  wareki 2026-11-11         Gregorian -> wareki   (also 2026-11, 2026)
  wareki 令和8年11月11日    wareki -> Gregorian   (also R8.11.11, "Reiwa 8", 令和八年)

Options (for Gregorian -> wareki):
  -s, --style <style>       long (default), short or roman
  -k, --kanji               kanji numerals: 令和八年十一月十一日
  -w, --weekday <mode>      short or long: add the day of the week
      --json                print the result as JSON
  -h, --help                show this help
  -v, --version             show the version
`;

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      style: { type: 'string', short: 's' },
      kanji: { type: 'boolean', short: 'k' },
      weekday: { type: 'string', short: 'w' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.help) return console.log(HELP);
  if (values.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return console.log(pkg.version);
  }

  const text = positionals.join(' ').trim();
  const isGregorian = text === '' || /^\d{4}(?:[-/.]\d{1,2}){0,2}$/.test(text.normalize('NFKC'));

  if (isGregorian) {
    const input = text === '' ? new Date() : text;
    if (values.json) return console.log(JSON.stringify(toWareki(input), null, 2));
    return console.log(
      formatWareki(input, {
        style: values.style,
        numerals: values.kanji ? 'kanji' : 'arabic',
        weekday: values.weekday,
      }),
    );
  }

  const w = parseWareki(text);
  if (values.json) return console.log(JSON.stringify(w, null, 2));
  const pad = (n) => String(n).padStart(2, '0');
  return console.log(
    [w.gregorianYear, w.month === null ? null : pad(w.month), w.day === null ? null : pad(w.day)]
      .filter((part) => part !== null)
      .join('-'),
  );
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`wareki: ${error.message}`);
  process.exitCode = 1;
}
