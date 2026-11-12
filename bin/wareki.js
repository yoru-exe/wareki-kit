#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import {
  findWareki,
  formatNendo,
  formatWareki,
  parseNendo,
  parseWareki,
  toNendo,
  toWareki,
} from '../src/index.js';

const HELP = `wareki: convert between Gregorian dates and Japanese era (和暦) dates

Usage:
  wareki [date] [options]

  wareki                    today in wareki
  wareki 2026-11-11         Gregorian -> wareki   (also 2026-11, 2026)
  wareki 令和8年11月11日    wareki -> Gregorian   (also R8.11.11, "Reiwa 8", 令和八年)
  wareki 令和8年度          fiscal year -> its date range (April to March)
  wareki --find "契約日は令和8年11月11日です"      find every wareki date in some text
  cat contract.txt | wareki --find                 ...or in piped input

Options (for Gregorian -> wareki):
  -s, --style <style>       long (default), short or roman
  -k, --kanji               kanji numerals: 令和八年十一月十一日
      --daiji               daiji numerals (壱 弐 参 拾): 令和八年拾壱月拾壱日
  -p, --pattern <pattern>   your own layout, e.g. "GGGGy年M月d日(E)" (see the README)
  -w, --weekday <mode>      short or long: add the day of the week
  -n, --nendo               print the fiscal year (年度) instead: 令和8年度
  -z, --tz <zone>           time zone for today's date, e.g. Asia/Tokyo
  -f, --find                find wareki dates in the text (or in stdin) instead of converting
      --invalid             with --find: also list dates that cannot exist, such as 平成31年5月1日
      --json                print the result as JSON
  -h, --help                show this help
  -v, --version             show the version
`;

const pad = (n) => String(n).padStart(2, '0');
const gregorianText = (w) =>
  [w.gregorianYear, w.month === null ? null : pad(w.month), w.day === null ? null : pad(w.day)]
    .filter((part) => part !== null)
    .join('-');

function readStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      style: { type: 'string', short: 's' },
      kanji: { type: 'boolean', short: 'k' },
      daiji: { type: 'boolean' },
      pattern: { type: 'string', short: 'p' },
      weekday: { type: 'string', short: 'w' },
      nendo: { type: 'boolean', short: 'n' },
      tz: { type: 'string', short: 'z' },
      find: { type: 'boolean', short: 'f' },
      invalid: { type: 'boolean' },
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

  if (values.find) {
    const source = positionals.length > 0 ? positionals.join(' ') : readStdin();
    if (source.trim() === '') throw new Error('--find needs some text, or text piped in on stdin');
    const found = findWareki(source, { includeInvalid: values.invalid });
    if (values.json) return console.log(JSON.stringify(found, null, 2));
    for (const match of found) {
      console.log(`${match.text} -> ${match.value ? gregorianText(match.value) : `invalid: ${match.error}`}`);
    }
    return undefined;
  }

  const text = positionals.join(' ').trim();
  const isGregorian = text === '' || /^\d{4}(?:[-/.]\d{1,2}){0,2}$/.test(text.normalize('NFKC'));

  if (isGregorian) {
    const input = text === '' ? new Date() : text;
    const timeZone = values.tz;
    const numerals = values.daiji ? 'daiji' : values.kanji ? 'kanji' : 'arabic';
    if (values.nendo) {
      if (values.json) return console.log(JSON.stringify(toNendo(input, { timeZone }), null, 2));
      return console.log(formatNendo(input, { style: values.style, numerals, timeZone }));
    }
    if (values.json) return console.log(JSON.stringify(toWareki(input, { timeZone }), null, 2));
    return console.log(
      formatWareki(input, {
        style: values.style,
        numerals,
        weekday: values.weekday,
        timeZone,
        pattern: values.pattern,
      }),
    );
  }

  if (/度$|fiscal\s+year$/i.test(text)) {
    const fiscal = parseNendo(text);
    if (values.json) return console.log(JSON.stringify(fiscal, null, 2));
    const y = fiscal.gregorianYear;
    return console.log(`${y}-04-01 to ${y + 1}-03-31`);
  }

  const w = parseWareki(text);
  if (values.json) return console.log(JSON.stringify(w, null, 2));
  return console.log(gregorianText(w));
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`wareki: ${error.message}`);
  process.exitCode = 1;
}
