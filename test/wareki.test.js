import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  ERAS,
  toWareki,
  fromWareki,
  parseWareki,
  formatWareki,
  toGregorianYear,
  getEra,
  erasInYear,
  toNendo,
  formatNendo,
  parseNendo,
  tryParseWareki,
  isValidWareki,
  findWareki,
} from '../src/index.js';

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Era table
// ---------------------------------------------------------------------------

test('ERAS has five eras with no gaps or overlaps', () => {
  assert.deepEqual(
    ERAS.map((e) => e.name),
    ['明治', '大正', '昭和', '平成', '令和'],
  );
  for (let i = 1; i < ERAS.length; i++) {
    const { end } = ERAS[i - 1];
    const nextDay = new Date(Date.UTC(end.year, end.month - 1, end.day) + DAY_MS);
    assert.deepEqual(
      { year: nextDay.getUTCFullYear(), month: nextDay.getUTCMonth() + 1, day: nextDay.getUTCDate() },
      { ...ERAS[i].start },
      `${ERAS[i].name} should start the day after ${ERAS[i - 1].name} ends`,
    );
  }
  assert.equal(ERAS.at(-1).end, null);
  assert.ok(Object.isFrozen(ERAS));
});

// ---------------------------------------------------------------------------
// toWareki / formatWareki at the era boundaries
// ---------------------------------------------------------------------------

const boundaries = [
  ['1868-01-25', '明治元年1月25日'],
  ['1912-07-29', '明治45年7月29日'],
  ['1912-07-30', '大正元年7月30日'],
  ['1926-12-24', '大正15年12月24日'],
  ['1926-12-25', '昭和元年12月25日'],
  ['1989-01-07', '昭和64年1月7日'],
  ['1989-01-08', '平成元年1月8日'],
  ['2019-04-30', '平成31年4月30日'],
  ['2019-05-01', '令和元年5月1日'],
  ['2026-11-11', '令和8年11月11日'],
];

for (const [iso, expected] of boundaries) {
  test(`formatWareki(${iso}) is ${expected}`, () => {
    assert.equal(formatWareki(iso), expected);
  });
}

test('toWareki returns the full result shape', () => {
  assert.deepEqual(toWareki('2026-11-11'), {
    era: '令和',
    eraRoman: 'Reiwa',
    eraShort: 'R',
    year: 8,
    month: 11,
    day: 11,
    gregorianYear: 2026,
  });
});

test('toWareki accepts Date, string, number and object input', () => {
  const expected = toWareki('2019-05-01');
  assert.deepEqual(toWareki(new Date(2019, 4, 1)), expected);
  assert.deepEqual(toWareki('2019/05/01'), expected);
  assert.deepEqual(toWareki('2019.5.1'), expected);
  assert.deepEqual(toWareki({ year: 2019, month: 5, day: 1 }), expected);
  assert.deepEqual(toWareki('２０１９-０５-０１'), expected, 'full-width digits');
});

test('year-only and year-month input use the era in effect at the end of the period', () => {
  assert.equal(formatWareki(1989), '平成元年');
  assert.equal(formatWareki(2019), '令和元年');
  assert.equal(formatWareki(1912), '大正元年');
  assert.equal(formatWareki('1989-01'), '平成元年1月');
  assert.equal(formatWareki('2019-04'), '平成31年4月');
  assert.equal(formatWareki('2019-05'), '令和元年5月');
  assert.deepEqual(toWareki(1989), {
    era: '平成',
    eraRoman: 'Heisei',
    eraShort: 'H',
    year: 1,
    month: null,
    day: null,
    gregorianYear: 1989,
  });
});

test('leap days are handled', () => {
  assert.equal(formatWareki('2024-02-29'), '令和6年2月29日');
  assert.equal(formatWareki('1900-02-28'), '明治33年2月28日');
  assert.throws(() => toWareki('1900-02-29'), RangeError, '1900 is not a leap year');
  assert.throws(() => toWareki('2025-02-29'), RangeError);
});

test('toWareki rejects bad input', () => {
  assert.throws(() => toWareki('1868-01-24'), /not supported/);
  assert.throws(() => toWareki(1700), RangeError);
  assert.throws(() => toWareki('2026-02-30'), RangeError);
  assert.throws(() => toWareki('2026-13-01'), RangeError);
  assert.throws(() => toWareki('2026-00-10'), RangeError);
  assert.throws(() => toWareki(new Date('nope')), TypeError);
  assert.throws(() => toWareki('11/11/2026'), TypeError);
  assert.throws(() => toWareki('2026-11-11T10:00:00Z'), TypeError);
  assert.throws(() => toWareki(2026.5), TypeError);
  assert.throws(() => toWareki(null), TypeError);
  assert.throws(() => toWareki({ year: 2026, day: 5 }), TypeError, 'day without month');
  assert.throws(() => toWareki({ era: '令和', year: 8 }), /fromWareki/);
});

// ---------------------------------------------------------------------------
// formatWareki options
// ---------------------------------------------------------------------------

test('formatWareki styles and gannen option', () => {
  assert.equal(formatWareki('2026-11-11', { style: 'short' }), 'R8.11.11');
  assert.equal(formatWareki('2026-11-11', { style: 'roman' }), 'Reiwa 8.11.11');
  assert.equal(formatWareki('2019-05-01', { gannen: false }), '令和1年5月1日');
  assert.equal(formatWareki('2019-05-01', { style: 'short' }), 'R1.5.1');
  assert.equal(formatWareki(2026, { style: 'roman' }), 'Reiwa 8');
  assert.throws(() => formatWareki('2026-11-11', { style: 'fancy' }), RangeError);
});

// ---------------------------------------------------------------------------
// parseWareki
// ---------------------------------------------------------------------------

test('parseWareki understands kanji, short and romaji forms', () => {
  const same = {
    era: '令和',
    eraRoman: 'Reiwa',
    eraShort: 'R',
    year: 8,
    month: 11,
    day: 11,
    gregorianYear: 2026,
  };
  for (const text of [
    '令和8年11月11日',
    '令和 8 年 11 月 11 日',
    '令和８年１１月１１日',
    'R8.11.11',
    'r8.11.11',
    'R8/11/11',
    'R8-11-11',
    'Reiwa 8.11.11',
    'reiwa8.11.11',
    '  R8.11.11  ',
  ]) {
    assert.deepEqual(parseWareki(text), same, text);
  }
});

test('parseWareki handles gannen, partial dates and macrons', () => {
  assert.equal(parseWareki('令和元年5月1日').year, 1);
  assert.equal(parseWareki('令和1年5月1日').year, 1);
  assert.deepEqual(
    { month: parseWareki('令和8年').month, day: parseWareki('令和8年').day },
    { month: null, day: null },
  );
  assert.equal(parseWareki('令和8年11月').day, null);
  assert.equal(parseWareki('R8').gregorianYear, 2026);
  assert.equal(parseWareki('Taishō 15').gregorianYear, 1926);
  assert.equal(parseWareki('Shōwa 64.1.7').gregorianYear, 1989);
  assert.equal(parseWareki('H31/4/30').month, 4);
});

test('parseWareki rejects dates outside the era', () => {
  assert.throws(() => parseWareki('平成31年5月1日'), /outside the Heisei era/);
  assert.throws(() => parseWareki('昭和64年1月8日'), RangeError);
  assert.throws(() => parseWareki('大正15年12月25日'), RangeError);
  assert.throws(() => parseWareki('明治45年7月30日'), RangeError);
  assert.throws(() => parseWareki('平成32年'), RangeError);
  assert.throws(() => parseWareki('昭和65年'), RangeError);
  assert.throws(() => parseWareki('令和0年'), RangeError);
  assert.throws(() => parseWareki('明治元年1月24日'), RangeError);
  assert.throws(() => parseWareki('令和8年2月30日'), RangeError);
  assert.throws(() => parseWareki('令和8年13月1日'), RangeError);
});

test('parseWareki rejects text it cannot read', () => {
  assert.throws(() => parseWareki('令和'), SyntaxError);
  assert.throws(() => parseWareki('Edo 8'), SyntaxError);
  assert.throws(() => parseWareki('2026-11-11'), SyntaxError);
  assert.throws(() => parseWareki(''), SyntaxError);
  assert.throws(() => parseWareki(2026), TypeError);
});

// ---------------------------------------------------------------------------
// fromWareki / toGregorianYear
// ---------------------------------------------------------------------------

test('fromWareki returns a local-midnight Date', () => {
  const d = fromWareki('令和8年11月11日');
  assert.equal(d.getTime(), new Date(2026, 10, 11).getTime());
  assert.equal(
    fromWareki({ era: 'H', year: 31, month: 4, day: 30 }).getTime(),
    new Date(2019, 3, 30).getTime(),
  );
  assert.equal(
    fromWareki({ era: 'Showa', year: 64, month: 1, day: 7 }).getTime(),
    new Date(1989, 0, 7).getTime(),
  );
});

test('fromWareki validates', () => {
  assert.throws(() => fromWareki('令和8年'), /full date/);
  assert.throws(() => fromWareki('令和8年11月'), /full date/);
  assert.throws(() => fromWareki({ era: '令和', year: 8 }), /full date/);
  assert.throws(() => fromWareki({ era: 'Edo', year: 1, month: 1, day: 1 }), /Unknown era/);
  assert.throws(() => fromWareki({ era: '平成', year: 31, month: 5, day: 1 }), RangeError);
  assert.throws(() => fromWareki(null), TypeError);
});

test('toGregorianYear', () => {
  assert.equal(toGregorianYear('令和', 8), 2026);
  assert.equal(toGregorianYear('平成', 1), 1989);
  assert.equal(toGregorianYear('Heisei', 31), 2019);
  assert.equal(toGregorianYear('S', 64), 1989);
  assert.equal(toGregorianYear('明治', 45), 1912);
  assert.throws(() => toGregorianYear('平成', 32), RangeError);
  assert.throws(() => toGregorianYear('平成', 0), RangeError);
  assert.throws(() => toGregorianYear('平成', 1.5), RangeError);
});

// ---------------------------------------------------------------------------
// getEra / erasInYear
// ---------------------------------------------------------------------------

test('getEra returns the era object', () => {
  assert.equal(getEra('2026-11-11'), ERAS[4]);
  assert.equal(getEra('2019-04-30').roman, 'Heisei');
});

test('erasInYear lists every era that overlaps a year', () => {
  assert.deepEqual(
    erasInYear(1989).map((w) => `${w.era}${w.year}`),
    ['昭和64', '平成1'],
  );
  assert.deepEqual(
    erasInYear(2019).map((w) => `${w.era}${w.year}`),
    ['平成31', '令和1'],
  );
  assert.deepEqual(
    erasInYear(1912).map((w) => `${w.era}${w.year}`),
    ['明治45', '大正1'],
  );
  assert.deepEqual(
    erasInYear(2026).map((w) => `${w.era}${w.year}`),
    ['令和8'],
  );
  assert.throws(() => erasInYear(1867), RangeError);
});

// ---------------------------------------------------------------------------
// Exhaustive checks
// ---------------------------------------------------------------------------

test('every day from 1868-01-25 to 2100-12-31 round-trips through all three styles', () => {
  for (let t = Date.UTC(1868, 0, 25); t <= Date.UTC(2100, 11, 31); t += DAY_MS) {
    const utc = new Date(t);
    const parts = {
      year: utc.getUTCFullYear(),
      month: utc.getUTCMonth() + 1,
      day: utc.getUTCDate(),
    };
    const expected = new Date(parts.year, parts.month - 1, parts.day).getTime();
    for (const style of ['long', 'short', 'roman']) {
      const text = formatWareki(parts, { style });
      assert.equal(fromWareki(text).getTime(), expected, `${parts.year}-${parts.month}-${parts.day} as ${text}`);
    }
  }
});

const intlSupported = (() => {
  try {
    return new Intl.DateTimeFormat('ja-JP-u-ca-japanese').resolvedOptions().calendar === 'japanese';
  } catch {
    return false;
  }
})();

// Intl (ICU) switches from 慶応 to 明治 on 1868-10-23, while Japanese conversion
// tables count Meiji 1 from 1868-01-25, so the comparison starts at ICU's date.
test(
  'agrees with Intl (ICU) for every day from 1868-10-23 to 2100-12-31',
  { skip: !intlSupported && 'Intl Japanese calendar is not available in this runtime' },
  () => {
    const fmt = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', {
      era: 'long',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const part = (parts, type) => parts.find((p) => p.type === type).value;

    for (let t = Date.UTC(1868, 9, 23); t <= Date.UTC(2100, 11, 31); t += DAY_MS) {
      const d = new Date(t);
      const ours = toWareki({
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
      });
      const parts = fmt.formatToParts(d);
      assert.deepEqual(
        [ours.era, ours.year, ours.month, ours.day],
        [part(parts, 'era'), Number(part(parts, 'year')), Number(part(parts, 'month')), Number(part(parts, 'day'))],
        d.toISOString().slice(0, 10),
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Packaging
// ---------------------------------------------------------------------------

test('can be loaded with require() on every supported Node version', () => {
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/index.cjs');
  assert.equal(cjs.formatWareki('2026-11-11'), '令和8年11月11日');
});

// ---------------------------------------------------------------------------
// Kanji numerals
// ---------------------------------------------------------------------------

const kanji = { numerals: 'kanji' };

test('kanji numerals: formatting', () => {
  assert.equal(formatWareki('2026-11-11', kanji), '令和八年十一月十一日');
  assert.equal(formatWareki('1989-01-07', kanji), '昭和六十四年一月七日');
  assert.equal(formatWareki('2019-05-01', kanji), '令和元年五月一日');
  assert.equal(formatWareki('2019-05-01', { ...kanji, gannen: false }), '令和一年五月一日');
  assert.equal(formatWareki('2026-10-10', kanji), '令和八年十月十日');
  assert.equal(formatWareki('2026-10-20', kanji), '令和八年十月二十日');
  assert.equal(formatWareki('2026-12-30', kanji), '令和八年十二月三十日');
  assert.equal(formatWareki('1912-07-30', kanji), '大正元年七月三十日');
  assert.equal(formatWareki(2026, kanji), '令和八年');
  assert.equal(formatWareki('2026-11', kanji), '令和八年十一月');
});

test('kanji numerals: parsing, traditional and positional', () => {
  assert.equal(parseWareki('令和八年十一月十一日').gregorianYear, 2026);
  assert.equal(parseWareki('昭和六十四年一月七日').day, 7);
  assert.equal(parseWareki('令和元年五月一日').month, 5);
  assert.equal(parseWareki('令和二十年').gregorianYear, 2038);
  assert.equal(parseWareki('令和二〇年').gregorianYear, 2038, 'positional');
  assert.equal(parseWareki('令和百年').gregorianYear, 2118);
  assert.equal(parseWareki('令和８年十一月11日').month, 11, 'mixed digits and kanji');
  assert.equal(parseWareki('令和 八 年 十一 月').month, 11);
  assert.throws(() => parseWareki('令和 八 年 十 一 月'), SyntaxError, 'no spaces inside one number');
  assert.equal(parseWareki('平成三十一年四月三十日').day, 30);
});

test('kanji numerals: malformed numbers are rejected', () => {
  for (const s of ['令和十十年', '令和二〇十年', '令和百百年', '令和二二十年', '令和十二十年', '令和八年十一月十一']) {
    assert.throws(() => parseWareki(s), SyntaxError, s);
  }
  assert.throws(() => parseWareki('令和〇年'), RangeError, 'year zero');
  assert.throws(() => parseWareki('令和八年十三月一日'), RangeError, 'month 13');
  assert.throws(() => parseWareki('平成三十一年五月一日'), /outside the Heisei era/);
});

test('kanji numerals: every era year 1..2000 round-trips', () => {
  for (let n = 1; n <= 2000; n++) {
    const g = 2018 + n;
    const text = formatWareki(g, { ...kanji, gannen: false });
    assert.equal(parseWareki(text).year, n, text);
    assert.equal(parseWareki(text).gregorianYear, g, text);
  }
});

test('kanji numerals only work with the long style', () => {
  assert.throws(() => formatWareki('2026-11-11', { style: 'short', numerals: 'kanji' }), RangeError);
  assert.throws(() => formatWareki('2026-11-11', { numerals: 'roman' }), RangeError);
  assert.equal(formatWareki('2026-11-11', { numerals: 'arabic' }), '令和8年11月11日');
});

// ---------------------------------------------------------------------------
// Weekday
// ---------------------------------------------------------------------------

test('weekday formatting', () => {
  assert.equal(formatWareki('2026-11-11', { weekday: 'short' }), '令和8年11月11日(水)');
  assert.equal(formatWareki('2026-11-11', { weekday: true }), '令和8年11月11日(水)');
  assert.equal(formatWareki('2026-11-11', { weekday: 'long' }), '令和8年11月11日水曜日');
  assert.equal(formatWareki('2026-11-11', { style: 'short', weekday: 'short' }), 'R8.11.11(水)');
  assert.equal(formatWareki('2026-11-11', { style: 'short', weekday: 'long' }), 'R8.11.11(水曜日)');
  assert.equal(formatWareki('2026-11-11', { style: 'roman', weekday: 'short' }), 'Reiwa 8.11.11 (Wed)');
  assert.equal(formatWareki('2026-11-11', { style: 'roman', weekday: 'long' }), 'Reiwa 8.11.11 (Wednesday)');
  assert.equal(formatWareki('2026-11-11', { ...kanji, weekday: 'long' }), '令和八年十一月十一日水曜日');
  assert.equal(formatWareki('2026-11-11', { weekday: false }), '令和8年11月11日');
});

test('weekday needs a full date and a valid mode', () => {
  assert.throws(() => formatWareki(2026, { weekday: 'short' }), /full date/);
  assert.throws(() => formatWareki('2026-11', { weekday: 'short' }), /full date/);
  assert.throws(() => formatWareki('2026-11-11', { weekday: 'tiny' }), RangeError);
});

test('parseWareki accepts a trailing weekday and checks it', () => {
  for (const s of [
    '令和8年11月11日(水)',
    '令和8年11月11日（水）',
    '令和8年11月11日 (水)',
    '令和8年11月11日水曜日',
    '令和8年11月11日(水曜日)',
    'R8.11.11(水)',
    'Reiwa 8.11.11 (Wed)',
    'reiwa 8.11.11 (wednesday)',
    '令和八年十一月十一日水曜日',
  ]) {
    assert.deepEqual(
      [parseWareki(s).gregorianYear, parseWareki(s).month, parseWareki(s).day],
      [2026, 11, 11],
      s,
    );
  }
  assert.throws(() => parseWareki('令和8年11月11日(木)'), /Wednesday, not a Thursday/);
  assert.throws(() => parseWareki('Reiwa 8.11.11 (Mon)'), RangeError);
  assert.throws(() => parseWareki('令和8年(水)'), /full date/);
  assert.throws(() => parseWareki('(水)'), SyntaxError);
  assert.throws(() => parseWareki('Reiwa 8.11.11 (Monkey)'), SyntaxError);
});

test('every day 1868-2100: weekday agrees with Intl and kanji/weekday text round-trips', () => {
  const ja = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: 'UTC' });
  for (let t = Date.UTC(1868, 0, 25); t <= Date.UTC(2100, 11, 31); t += DAY_MS) {
    const d = new Date(t);
    const parts = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    const short = formatWareki(parts, { weekday: 'short' });
    assert.equal(short.at(-2), ja.format(d), `${d.toISOString().slice(0, 10)} weekday`);
    const expected = new Date(parts.year, parts.month - 1, parts.day).getTime();
    for (const opts of [
      { weekday: 'short' },
      { weekday: 'long' },
      { numerals: 'kanji' },
      { numerals: 'kanji', weekday: 'long' },
      { style: 'short', weekday: 'long' },
      { style: 'roman', weekday: 'long' },
    ]) {
      const text = formatWareki(parts, opts);
      assert.equal(fromWareki(text).getTime(), expected, text);
    }
  }
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/wareki.js', import.meta.url));
const run = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { out: r.stdout.trim(), err: r.stderr.trim(), code: r.status };
};

test('CLI: Gregorian to wareki', () => {
  assert.deepEqual(run('2026-11-11'), { out: '令和8年11月11日', err: '', code: 0 });
  assert.equal(run('2026-11-11', '--style', 'short').out, 'R8.11.11');
  assert.equal(run('2026-11-11', '-s', 'roman').out, 'Reiwa 8.11.11');
  assert.equal(run('2026-11-11', '--kanji').out, '令和八年十一月十一日');
  assert.equal(run('2026-11-11', '-k', '-w', 'long').out, '令和八年十一月十一日水曜日');
  assert.equal(run('2019').out, '令和元年');
  assert.equal(run('2026-11').out, '令和8年11月');
});

test('CLI: wareki to Gregorian', () => {
  assert.equal(run('令和8年11月11日').out, '2026-11-11');
  assert.equal(run('R8.11.11').out, '2026-11-11');
  assert.equal(run('令和八年十一月十一日').out, '2026-11-11');
  assert.equal(run('Reiwa', '8.11.11').out, '2026-11-11', 'words joined');
  assert.equal(run('平成元年').out, '1989');
  assert.equal(run('平成元年1月').out, '1989-01');
});

test('CLI: no date prints today, json, help and version', () => {
  const today = run();
  assert.equal(today.code, 0);
  assert.match(today.out, /^令和\d+年\d+月\d+日$/);
  assert.equal(JSON.parse(run('2026-11-11', '--json').out).era, '令和');
  assert.equal(JSON.parse(run('R8.11.11', '--json').out).gregorianYear, 2026);
  assert.match(run('--help').out, /Usage:/);
  assert.match(run('-v').out, /^\d+\.\d+\.\d+$/);
});

test('CLI: errors go to stderr with a non-zero exit code', () => {
  for (const args of [['平成31年5月1日'], ['2026-02-30'], ['hello'], ['--nope'], ['2026-11-11', '-s', 'fancy']]) {
    const r = run(...args);
    assert.equal(r.code, 1, args.join(' '));
    assert.equal(r.out, '');
    assert.match(r.err, /^wareki: /);
  }
});

// ---------------------------------------------------------------------------
// Regression tests (0.2.1)
// ---------------------------------------------------------------------------

test('large era years (1000+) round-trip in every style', () => {
  for (const n of [999, 1000, 1234, 9999, 12345, 99999]) {
    const g = 2018 + n;
    for (const opts of [{ gannen: false }, { numerals: 'kanji', gannen: false }, { style: 'short' }, { style: 'roman' }]) {
      const w = parseWareki(formatWareki(g, opts));
      assert.equal(w.year, n, JSON.stringify(opts));
      assert.equal(w.gregorianYear, g);
    }
  }
});

test('parseWareki stays fast on pathological input', () => {
  const evil = [
    '令和8年' + ' '.repeat(80_000) + '(',
    '令和8年' + ' '.repeat(80_000) + '(水)',
    'R8.11.11 (' + 'w'.repeat(80_000) + ')',
    '('.repeat(80_000),
    ' '.repeat(80_000) + 'R8',
    '令和' + '十'.repeat(80_000) + '年',
    '令和8年' + '(水) '.repeat(20_000),
  ];
  const t0 = performance.now();
  for (const s of evil) {
    assert.throws(() => parseWareki(s), SyntaxError);
  }
  assert.ok(performance.now() - t0 < 200, `took ${(performance.now() - t0).toFixed(0)} ms`);
});

test('parseWareki still works on inputs just under the length limit', () => {
  assert.equal(parseWareki('令和8年11月11日' + ' '.repeat(150) + '(水)').day, 11);
  assert.throws(() => parseWareki('令和8年11月11日' + ' '.repeat(250) + '(水)'), /too long/);
});

test('weekday: null and undefined mean "off"', () => {
  assert.equal(formatWareki('2026-11-11', { weekday: null }), '令和8年11月11日');
  assert.equal(formatWareki('2026-11-11', { weekday: undefined }), '令和8年11月11日');
});

// ---------------------------------------------------------------------------
// timeZone option (0.3.0)
// ---------------------------------------------------------------------------

test('timeZone: a Date is read in the given zone, whatever the process time zone is', () => {
  const instant = new Date(Date.UTC(2026, 10, 11, 20, 0, 0)); // 2026-11-11 20:00 UTC
  assert.equal(formatWareki(instant, { timeZone: 'UTC' }), '令和8年11月11日');
  assert.equal(formatWareki(instant, { timeZone: 'Asia/Tokyo' }), '令和8年11月12日');
  assert.equal(formatWareki(instant, { timeZone: 'Asia/Dhaka' }), '令和8年11月12日');
  assert.equal(formatWareki(instant, { timeZone: 'America/Los_Angeles' }), '令和8年11月11日');
  assert.equal(formatWareki(instant, { timeZone: 'Pacific/Kiritimati' }), '令和8年11月12日');
  assert.equal(formatWareki(instant, { timeZone: 'Pacific/Pago_Pago' }), '令和8年11月11日');
});

test('timeZone: fixes the new Date("YYYY-MM-DD") trap', () => {
  const utcMidnight = new Date('2026-11-11'); // midnight UTC
  assert.equal(formatWareki(utcMidnight, { timeZone: 'UTC' }), '令和8年11月11日');
  assert.equal(formatWareki(utcMidnight, { timeZone: 'Asia/Tokyo' }), '令和8年11月11日');
  assert.equal(formatWareki(utcMidnight, { timeZone: 'America/Los_Angeles' }), '令和8年11月10日');
});

test('timeZone: era and year boundaries follow the zone', () => {
  const t = Date.UTC(2019, 3, 30, 15, 0, 0); // 2019-04-30 15:00 UTC = 2019-05-01 00:00 in Tokyo
  assert.equal(formatWareki(new Date(t), { timeZone: 'Asia/Tokyo' }), '令和元年5月1日');
  assert.equal(formatWareki(new Date(t), { timeZone: 'UTC' }), '平成31年4月30日');
  assert.equal(getEra(new Date(t), { timeZone: 'Asia/Tokyo' }).name, '令和');
  assert.equal(getEra(new Date(t), { timeZone: 'UTC' }).name, '平成');
  assert.equal(toWareki(new Date(Date.UTC(2018, 11, 31, 20)), { timeZone: 'Asia/Tokyo' }).year, 31);
  assert.equal(formatWareki(new Date(Date.UTC(2018, 11, 31, 20)), { timeZone: 'Asia/Tokyo' }), '平成31年1月1日');
});

test('timeZone: weekday, kanji and styles work with it', () => {
  const d = new Date(Date.UTC(2026, 10, 11, 20, 0, 0));
  assert.equal(formatWareki(d, { timeZone: 'Asia/Tokyo', weekday: 'short' }), '令和8年11月12日(木)');
  assert.equal(formatWareki(d, { timeZone: 'Asia/Tokyo', numerals: 'kanji' }), '令和八年十一月十二日');
  assert.equal(formatWareki(d, { timeZone: 'Asia/Tokyo', style: 'short' }), 'R8.11.12');
});

test('timeZone: ignored for strings, numbers and objects; bad values rejected', () => {
  assert.equal(formatWareki('2026-11-11', { timeZone: 'Asia/Tokyo' }), '令和8年11月11日');
  assert.equal(formatWareki(2026, { timeZone: 'Pacific/Kiritimati' }), '令和8年');
  assert.equal(formatWareki({ year: 2026, month: 1, day: 1 }, { timeZone: 'UTC' }), '令和8年1月1日');
  assert.throws(() => formatWareki(new Date(), { timeZone: 'Mars/Base' }), RangeError);
  assert.throws(() => formatWareki(new Date(), { timeZone: 5 }), TypeError);
  assert.throws(() => toWareki('2026-11-11', { timeZone: 5 }), TypeError);
  assert.doesNotThrow(() => toWareki(new Date(), undefined));
  assert.doesNotThrow(() => toWareki(new Date(), {}));
});

test(
  'timeZone: agrees with Intl (japanese calendar) for 20,000 random instants in 6 zones',
  { skip: !intlSupported && 'Intl Japanese calendar is not available in this runtime' },
  () => {
    const zones = ['Asia/Tokyo', 'Asia/Dhaka', 'America/Los_Angeles', 'Pacific/Auckland', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];
    const formatters = Object.fromEntries(
      zones.map((timeZone) => [
        timeZone,
        new Intl.DateTimeFormat('ja-JP-u-ca-japanese', { era: 'long', year: 'numeric', month: 'numeric', day: 'numeric', timeZone }),
      ]),
    );
    let seed = 987654321;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const from = Date.UTC(1869, 0, 1);
    const span = Date.UTC(2100, 11, 31) - from;
    for (let i = 0; i < 20000; i++) {
      const date = new Date(from + Math.floor(rnd() * span));
      const timeZone = zones[i % zones.length];
      const ours = toWareki(date, { timeZone });
      const part = (type) => formatters[timeZone].formatToParts(date).find((p) => p.type === type).value;
      assert.deepEqual(
        [ours.era, ours.year, ours.month, ours.day],
        [part('era'), Number(part('year')), Number(part('month')), Number(part('day'))],
        `${date.toISOString()} in ${timeZone}`,
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Fiscal years / 年度 (0.3.0)
// ---------------------------------------------------------------------------

test('formatNendo: fiscal year starts in April and is named by the year it starts in', () => {
  assert.equal(formatNendo('2026-03-31'), '令和7年度');
  assert.equal(formatNendo('2026-04-01'), '令和8年度');
  assert.equal(formatNendo('2026-11-11'), '令和8年度');
  assert.equal(formatNendo('2027-03-31'), '令和8年度');
  assert.equal(formatNendo('2027-04-01'), '令和9年度');
  assert.equal(formatNendo('2026-04'), '令和8年度');
  assert.equal(formatNendo('2026-03'), '令和7年度');
});

test('formatNendo: era changes use the era in effect at the end of the calendar year', () => {
  // The fiscal year that began in April 2019 is 令和元年度 (the Ministry of Health, Labour and Welfare
  // labels it 平成31年度/令和元年度), and 昭和63年度 / 平成元年度 follow the same rule.
  assert.equal(formatNendo('2019-03-31'), '平成30年度');
  assert.equal(formatNendo('2019-04-01'), '令和元年度');
  assert.equal(formatNendo('2019-05-01'), '令和元年度');
  assert.equal(formatNendo('2020-03-31'), '令和元年度');
  assert.equal(formatNendo('2020-04-01'), '令和2年度');
  assert.equal(formatNendo('1989-01-07'), '昭和63年度');
  assert.equal(formatNendo('1989-03-31'), '昭和63年度');
  assert.equal(formatNendo('1989-04-01'), '平成元年度');
});

test('formatNendo: styles, kanji numerals, gannen and startMonth', () => {
  assert.equal(formatNendo('2026-05-01', { style: 'short' }), 'R8年度');
  assert.equal(formatNendo('2026-05-01', { style: 'roman' }), 'Reiwa 8 fiscal year');
  assert.equal(formatNendo('2026-05-01', { numerals: 'kanji' }), '令和八年度');
  assert.equal(formatNendo('2019-06-01', { numerals: 'kanji' }), '令和元年度');
  assert.equal(formatNendo('2019-06-01', { gannen: false }), '令和1年度');
  assert.equal(formatNendo('2026-05-01', { startMonth: 1 }), '令和8年度');
  assert.equal(formatNendo('2026-09-30', { startMonth: 10 }), '令和7年度');
  assert.equal(formatNendo('2026-10-01', { startMonth: 10 }), '令和8年度');
  assert.equal(formatNendo(2026, { startMonth: 1 }), '令和8年度');
});

test('formatNendo: timeZone, Date input and bad input', () => {
  const d = new Date(Date.UTC(2026, 2, 31, 16, 0, 0)); // 2026-03-31 16:00 UTC = 2026-04-01 01:00 Tokyo
  assert.equal(formatNendo(d, { timeZone: 'Asia/Tokyo' }), '令和8年度');
  assert.equal(formatNendo(d, { timeZone: 'UTC' }), '令和7年度');
  assert.throws(() => formatNendo(2026), /year and a month/);
  assert.throws(() => formatNendo('2026-05-01', { startMonth: 0 }), RangeError);
  assert.throws(() => formatNendo('2026-05-01', { startMonth: 13 }), RangeError);
  assert.throws(() => formatNendo('2026-05-01', { startMonth: 4.5 }), RangeError);
  assert.throws(() => formatNendo('2026-05-01', { style: 'fancy' }), RangeError);
  assert.throws(() => formatNendo('2026-05-01', { style: 'short', numerals: 'kanji' }), RangeError);
  assert.throws(() => formatNendo('1868-03-31'), RangeError, 'fiscal year 1867 is before the first era');
});

test('toNendo returns a year-only wareki object', () => {
  assert.deepEqual(toNendo('2026-05-01'), {
    era: '令和', eraRoman: 'Reiwa', eraShort: 'R', year: 8, month: null, day: null, gregorianYear: 2026,
  });
  assert.equal(toNendo('2026-02-01').gregorianYear, 2025);
  assert.equal(toNendo('2019-04-01').era, '令和');
});

test('parseNendo reads every style, plus pre-era-change aliases', () => {
  for (const s of ['令和8年度', '令和８年度', '令和八年度', 'R8年度', 'r8年度', 'Reiwa 8年度', 'Reiwa 8 fiscal year', 'R8 fiscal year', ' 令和8年度 ']) {
    assert.equal(parseNendo(s).gregorianYear, 2026, s);
  }
  assert.equal(parseNendo('令和元年度').gregorianYear, 2019);
  assert.equal(parseNendo('平成31年度').gregorianYear, 2019, 'written before the era change');
  assert.equal(parseNendo('昭和63年度').gregorianYear, 1988);
  assert.equal(parseNendo('平成元年度').gregorianYear, 1989);
  assert.equal(parseNendo('令和8年度').year, 8);
});

test('parseNendo rejects what is not a fiscal year', () => {
  for (const s of ['令和8年4月度', '令和8年4月1日度', '令和8年', '度', '年度', 'R8', '', 'fiscal year', '令和度', 'Edo 8 fiscal year']) {
    assert.throws(() => parseNendo(s), SyntaxError, s);
  }
  assert.throws(() => parseNendo('平成32年度'), RangeError);
  assert.throws(() => parseNendo('令和0年度'), RangeError);
  assert.throws(() => parseNendo(2026), TypeError);
  assert.throws(() => parseNendo('令和8年度' + ' '.repeat(300)), /too long/);
});

test('every day 1868-04-01..2100-12-31: toNendo, formatNendo and parseNendo agree', () => {
  for (let t = Date.UTC(1868, 3, 1); t <= Date.UTC(2100, 11, 31); t += DAY_MS) {
    const d = new Date(t);
    const parts = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    const expected = parts.month >= 4 ? parts.year : parts.year - 1;
    assert.equal(toNendo(parts).gregorianYear, expected, `${parts.year}-${parts.month}-${parts.day}`);
    if (parts.day !== 1 && parts.day !== 28) continue; // text round-trips: sample two days a month
    for (const opts of [{}, { style: 'short' }, { style: 'roman' }, { numerals: 'kanji' }]) {
      assert.equal(parseNendo(formatNendo(parts, opts)).gregorianYear, expected, JSON.stringify(opts));
    }
  }
});

// ---------------------------------------------------------------------------
// tryParseWareki / isValidWareki (0.3.0)
// ---------------------------------------------------------------------------

test('tryParseWareki and isValidWareki never throw', () => {
  assert.equal(tryParseWareki('令和8年11月11日').day, 11);
  assert.equal(tryParseWareki('R8.11.11 (Wed)').month, 11);
  for (const bad of ['平成31年5月1日', 'nope', '', '令和8年11月11日(木)', 42, null, undefined, {}, [], Symbol('x'), '令和8年' + ' '.repeat(500)]) {
    assert.equal(tryParseWareki(bad), null, String(typeof bad));
    assert.equal(isValidWareki(bad), false, String(typeof bad));
  }
  for (const ok of ['令和8年11月11日', 'R8', '令和八年', '昭和64年1月7日', 'Heisei 31.4.30']) {
    assert.equal(isValidWareki(ok), true, ok);
  }
});

// ---------------------------------------------------------------------------
// CLI additions (0.3.0)
// ---------------------------------------------------------------------------

test('CLI: --nendo and fiscal-year ranges', () => {
  assert.equal(run('2026-11-11', '--nendo').out, '令和8年度');
  assert.equal(run('2026-02-01', '-n').out, '令和7年度');
  assert.equal(run('2019-04-01', '-n', '-k').out, '令和元年度');
  assert.equal(run('2026-11-11', '-n', '-s', 'short').out, 'R8年度');
  assert.equal(JSON.parse(run('2026-11-11', '-n', '--json').out).gregorianYear, 2026);
  assert.equal(run('令和8年度').out, '2026-04-01 to 2027-03-31');
  assert.equal(run('令和元年度').out, '2019-04-01 to 2020-03-31');
  assert.equal(run('Reiwa', '8', 'fiscal', 'year').out, '2026-04-01 to 2027-03-31');
  assert.equal(run('R8年度').out, '2026-04-01 to 2027-03-31');
  assert.equal(run('令和8年4月度').code, 1);
});

test('CLI: --tz applies to today and rejects unknown zones', () => {
  assert.match(run('--tz', 'Asia/Tokyo').out, /^令和\d+年\d+月\d+日$/);
  assert.match(run('-z', 'Asia/Tokyo', '-n').out, /^令和\d+年度$/);
  const bad = run('--tz', 'Mars/Base');
  assert.equal(bad.code, 1);
  assert.match(bad.err, /^wareki: .*time zone/i);
});

// ---------------------------------------------------------------------------
// CommonJS build (0.4.0)
// ---------------------------------------------------------------------------

import { buildCjs, buildDts } from '../scripts/build-cjs.js';

const readProjectFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('dist/ is up to date with src/ (run "npm run build" if this fails)', () => {
  assert.equal(readProjectFile('dist/index.cjs'), buildCjs(readProjectFile('src/index.js')));
  assert.equal(readProjectFile('dist/index.d.cts'), buildDts(readProjectFile('src/index.d.ts')));
});

test('the build script refuses syntax it cannot convert', () => {
  assert.throws(() => buildCjs("import x from 'y';\nexport const a = 1;"), /unsupported syntax/);
  assert.throws(() => buildCjs('export default 1;'), /unsupported syntax/);
  assert.throws(() => buildCjs('export { a };'), /unsupported syntax/);
  assert.throws(() => buildCjs('export async function f() {}'), /unsupported syntax/);
  assert.match(buildCjs('export const a = 1;\nexport function b() {}'), /module\.exports = \{\n {2}a,\n {2}b,\n\};/);
});

test('the CommonJS build matches the ESM build', async () => {
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/index.cjs');
  const esm = await import('../src/index.js');
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
  for (const name of Object.keys(esm)) assert.equal(typeof cjs[name], typeof esm[name], name);
  assert.deepEqual(cjs.ERAS, esm.ERAS);

  const dates = ['1868-01-25', '1912-07-30', '1989-01-07', '1989-01-08', '2019-04-30', '2019-05-01', '2026-11-11', 2019, '2020-02-29'];
  for (const d of dates) {
    for (const opts of [{}, { style: 'short' }, { style: 'roman' }, { numerals: 'kanji' }, { weekday: 'long' }]) {
      if (typeof d === 'number' && opts.weekday) continue;
      assert.equal(cjs.formatWareki(d, opts), esm.formatWareki(d, opts), `${d} ${JSON.stringify(opts)}`);
    }
    assert.deepEqual(cjs.toWareki(d), esm.toWareki(d));
    // Same result, or the same kind of error (1868-01-25 is in fiscal year 1867, before the first era).
    const startMonth = typeof d === 'number' ? 1 : 4;
    const outcome = (lib) => {
      try {
        return lib.formatNendo(d, { startMonth });
      } catch (error) {
        return `${error.name}: ${error.message}`;
      }
    };
    assert.equal(outcome(cjs), outcome(esm), `formatNendo(${d})`);
  }
  for (const text of ['令和八年十一月十一日水曜日', 'R8.11.11', 'Reiwa 8.11.11 (Wed)', '平成31年5月1日', 'nope']) {
    assert.deepEqual(cjs.tryParseWareki(text), esm.tryParseWareki(text), text);
    assert.equal(cjs.isValidWareki(text), esm.isValidWareki(text), text);
  }
  assert.deepEqual(cjs.parseNendo('令和元年度'), esm.parseNendo('令和元年度'));
  // Errors keep the right class in the CommonJS build.
  assert.throws(() => cjs.parseWareki('平成31年5月1日'), RangeError);
  assert.throws(() => cjs.parseWareki('nope'), SyntaxError);
  assert.throws(() => cjs.toWareki(null), TypeError);
});

test('package.json "exports" resolves for both import and require (self-reference)', async () => {
  const require = createRequire(import.meta.url);
  const viaImport = await import('wareki-kit');
  const viaRequire = require('wareki-kit');
  assert.equal(viaImport.formatWareki('2026-11-11'), '令和8年11月11日');
  assert.equal(viaRequire.formatWareki('2026-11-11'), '令和8年11月11日');
  assert.equal(viaImport.formatWareki, (await import('../src/index.js')).formatWareki, 'import -> src/index.js');
  assert.equal(viaRequire.formatWareki, require('../dist/index.cjs').formatWareki, 'require -> dist/index.cjs');
});

test('package.json points at files that exist and ships them', () => {
  const pkg = JSON.parse(readProjectFile('package.json'));
  const targets = [pkg.main, pkg.types, pkg.exports['.'].import.types, pkg.exports['.'].import.default, pkg.exports['.'].require.types, pkg.exports['.'].require.default, pkg.bin.wareki];
  for (const target of targets) {
    assert.doesNotThrow(() => readProjectFile(target.replace(/^\.\//, '')), target);
    assert.ok(pkg.files.some((f) => target.replace(/^\.\//, '').startsWith(`${f}/`)), `${target} is covered by "files"`);
  }
  assert.equal(pkg.engines.node, '>=18');
});

// ---------------------------------------------------------------------------
// Daiji numerals (0.4.0)
// ---------------------------------------------------------------------------

const daiji = { numerals: 'daiji' };

test('daiji: formatting replaces only 一 二 三 十', () => {
  assert.equal(formatWareki('2026-11-11', daiji), '令和八年拾壱月拾壱日');
  assert.equal(formatWareki('2019-05-01', daiji), '令和元年五月壱日');
  assert.equal(formatWareki('1989-01-07', daiji), '昭和六拾四年壱月七日');
  assert.equal(formatWareki('2026-10-10', daiji), '令和八年拾月拾日');
  assert.equal(formatWareki('2026-12-22', daiji), '令和八年拾弐月弐拾弐日');
  assert.equal(formatWareki('2026-12-23', daiji), '令和八年拾弐月弐拾参日');
  assert.equal(formatWareki('2026-12-30', daiji), '令和八年拾弐月参拾日');
  assert.equal(formatWareki('2026-02-03', daiji), '令和八年弐月参日');
  assert.equal(formatWareki('2019-05-01', { ...daiji, gannen: false }), '令和壱年五月壱日');
  assert.equal(formatWareki(2018 + 123, { ...daiji, gannen: false }), '令和百弐拾参年');
  assert.equal(formatWareki('2026-11-11', { ...daiji, weekday: 'long' }), '令和八年拾壱月拾壱日水曜日');
  assert.equal(formatNendo('2026-04-01', daiji), '令和八年度');
  assert.equal(formatNendo('2022-04-01', daiji), '令和四年度');
  assert.equal(formatNendo('2020-04-01', daiji), '令和弐年度');
});

test('daiji: parsing accepts daiji, ordinary kanji, explicit 壱拾 and old forms', () => {
  for (const s of ['令和八年拾壱月拾壱日', '令和八年壱拾壱月壱拾壱日', '令和八年拾一月十壱日', '令和八年十一月拾壱日']) {
    const w = parseWareki(s);
    assert.deepEqual([w.gregorianYear, w.month, w.day], [2026, 11, 11], s);
  }
  assert.equal(parseWareki('令和弐〇年').gregorianYear, 2038, 'positional daiji');
  assert.equal(parseWareki('令和壹年').gregorianYear, 2019, 'old form of 壱');
  assert.equal(parseWareki('令和貳拾參年').gregorianYear, 2041, 'old forms of 弐 and 参');
  assert.equal(parseWareki('令和元年五月壱日').day, 1);
});

test('daiji: malformed numbers are rejected', () => {
  for (const s of ['令和拾拾年', '令和拾十年', '令和十拾年', '令和弐拾〇年', '令和拾弐拾年', '令和壱拾壱拾年']) {
    assert.throws(() => parseWareki(s), SyntaxError, s);
  }
});

test('daiji: every era year 1..2000 and every day round-trip', () => {
  for (let n = 1; n <= 2000; n++) {
    const text = formatWareki(2018 + n, { ...daiji, gannen: false });
    assert.equal(parseWareki(text).year, n, text);
    assert.ok(!/[一二三十]/.test(text.slice(2)), `${text} still contains ordinary 一 二 三 十`);
  }
  for (let t = Date.UTC(1868, 0, 25); t <= Date.UTC(2100, 11, 31); t += DAY_MS * 3) {
    const d = new Date(t);
    const parts = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    const text = formatWareki(parts, { ...daiji, weekday: 'short' });
    assert.equal(fromWareki(text).getTime(), new Date(parts.year, parts.month - 1, parts.day).getTime(), text);
  }
});

test('daiji only works with the long style', () => {
  assert.throws(() => formatWareki('2026-11-11', { style: 'short', numerals: 'daiji' }), /only be used with style/);
  assert.throws(() => formatWareki('2026-11-11', { style: 'roman', numerals: 'kanji' }), RangeError);
  assert.throws(() => formatWareki('2026-11-11', { numerals: 'DAIJI' }), RangeError);
});

// ---------------------------------------------------------------------------
// Temporal input (0.4.0)
// ---------------------------------------------------------------------------

// Stand-ins shaped like Temporal objects: properties are prototype getters, and there is an
// `era` getter, exactly as on a real Temporal.PlainDate.
class FakePlainDate {
  #y; #m; #d; #c;
  constructor(y, m, d, calendarId = 'iso8601') { this.#y = y; this.#m = m; this.#d = d; this.#c = calendarId; }
  get year() { return this.#y; }
  get month() { return this.#m; }
  get day() { return this.#d; }
  get calendarId() { return this.#c; }
  get era() { return undefined; }
  get monthCode() { return `M${String(this.#m).padStart(2, '0')}`; }
}
class FakePlainYearMonth {
  get year() { return 2026; }
  get month() { return 11; }
  get calendarId() { return 'iso8601'; }
  get era() { return undefined; }
}
class FakeZonedDateTime extends FakePlainDate {
  get timeZoneId() { return 'Asia/Tokyo'; }
  get epochMilliseconds() { return Date.UTC(2026, 10, 11, 20, 0, 0); }
}
const fakeInstant = (ms) => ({ epochMilliseconds: ms, epochNanoseconds: BigInt(ms) * 1_000_000n });

test('Temporal-shaped input: PlainDate, PlainDateTime and PlainYearMonth', () => {
  assert.equal(formatWareki(new FakePlainDate(2026, 11, 11)), '令和8年11月11日');
  assert.equal(formatWareki(new FakePlainDate(1989, 1, 7), { style: 'short' }), 'S64.1.7');
  assert.equal(formatWareki(new FakePlainDate(2019, 5, 1), { numerals: 'kanji', weekday: 'long' }), '令和元年五月一日水曜日');
  assert.equal(formatWareki(new FakePlainYearMonth()), '令和8年11月');
  assert.deepEqual(toWareki(new FakePlainDate(2026, 11, 11)), toWareki('2026-11-11'));
  assert.equal(getEra(new FakePlainDate(2019, 4, 30)).name, '平成');
  assert.equal(formatNendo(new FakePlainDate(2026, 3, 31)), '令和7年度');
  assert.equal(toNendo(new FakePlainDate(2026, 4, 1)).gregorianYear, 2026);
  assert.equal(formatWareki(new FakePlainDate(2026, 11, 11), { timeZone: 'Asia/Tokyo' }), '令和8年11月11日', 'timeZone does not shift a plain date');
});

test('Temporal-shaped input: validation still applies', () => {
  assert.throws(() => toWareki(new FakePlainDate(1700, 1, 1)), RangeError);
  assert.throws(() => toWareki(new FakePlainDate(2026, 13, 1)), RangeError);
  assert.throws(() => toWareki(new FakePlainDate(2026, 2, 30)), RangeError);
  assert.throws(() => toWareki(new FakePlainDate(2026, 11, 11, 'japanese')), /ISO 8601/);
  assert.throws(() => toWareki(new FakePlainDate(2026, 11, 11, 'gregory')), TypeError);
});

test('Temporal-shaped input: ZonedDateTime uses its own fields, Instant is read like a Date', () => {
  const zoned = new FakeZonedDateTime(2026, 11, 12);
  assert.equal(formatWareki(zoned), '令和8年11月12日');
  assert.equal(formatWareki(zoned, { timeZone: 'America/Los_Angeles' }), '令和8年11月12日', 'the zone is already part of the value');

  const instant = fakeInstant(Date.UTC(2026, 10, 11, 20, 0, 0));
  assert.equal(formatWareki(instant, { timeZone: 'Asia/Tokyo' }), '令和8年11月12日');
  assert.equal(formatWareki(instant, { timeZone: 'America/Los_Angeles' }), '令和8年11月11日');
  assert.equal(formatWareki(instant, { timeZone: 'UTC' }), '令和8年11月11日');
  assert.equal(formatWareki(instant), formatWareki(new Date(instant.epochMilliseconds)));
  assert.throws(() => toWareki(fakeInstant(Number.MAX_SAFE_INTEGER)), TypeError, 'outside the Date range');
});

test('Temporal-shaped input: the older `calendar` spelling and plain objects with an era field', () => {
  assert.equal(formatWareki({ year: 2026, month: 11, day: 11, calendar: { id: 'iso8601' } }), '令和8年11月11日');
  assert.equal(formatWareki({ year: 2026, month: 11, day: 11, calendar: 'iso8601' }), '令和8年11月11日');
  assert.throws(() => toWareki({ era: '令和', year: 8 }), /fromWareki/, 'plain era objects are still rejected');
  assert.equal(toWareki({ year: 2026, month: 11, day: 11 }).year, 8, 'plain objects still work');
});

test(
  'real Temporal objects (when the runtime has Temporal)',
  { skip: typeof globalThis.Temporal === 'undefined' && 'Temporal is not available in this runtime' },
  () => {
    const { Temporal } = globalThis;
    assert.equal(formatWareki(Temporal.PlainDate.from('2026-11-11')), '令和8年11月11日');
    assert.equal(formatWareki(Temporal.PlainDateTime.from('2019-04-30T23:59:59')), '平成31年4月30日');
    assert.equal(formatWareki(Temporal.PlainYearMonth.from('2026-11')), '令和8年11月');
    assert.equal(formatWareki(Temporal.ZonedDateTime.from('2026-11-12T05:00:00+09:00[Asia/Tokyo]')), '令和8年11月12日');
    assert.equal(formatWareki(Temporal.Instant.from('2026-11-11T20:00:00Z'), { timeZone: 'Asia/Tokyo' }), '令和8年11月12日');
    assert.throws(() => toWareki(Temporal.PlainDate.from('2026-11-11').withCalendar('japanese')), /ISO 8601/);
  },
);

// ---------------------------------------------------------------------------
// Custom format patterns (0.4.0)
// ---------------------------------------------------------------------------

const withPattern = (pattern, input = '2026-11-11', options = {}) => formatWareki(input, { pattern, ...options });

test('pattern: every token', () => {
  const expected = {
    G: 'R', GGG: 'Reiwa', GGGG: '令和',
    y: '8', yy: '08', Y: '8', u: '2026', uuuu: '2026',
    M: '11', MM: '11', d: '11', dd: '11', E: '水', EEEE: '水曜日',
  };
  for (const [pattern, text] of Object.entries(expected)) assert.equal(withPattern(pattern), text, pattern);
  assert.equal(withPattern('GGGGy年M月d日(E)'), '令和8年11月11日(水)', 'the example from the docs');
  assert.equal(withPattern('M/d', '2026-03-05'), '3/5');
  assert.equal(withPattern('MM/dd', '2026-03-05'), '03/05');
  assert.equal(withPattern('yy', '2019-05-01'), '01');
  assert.equal(withPattern('Y', '2019-05-01'), '元');
  assert.equal(withPattern('y', '2019-05-01'), '1');
  assert.equal(withPattern('yy', 2018 + 123), '123', 'padding never truncates');
  assert.equal(withPattern('GGG y (u)'), 'Reiwa 8 (2026)');
  assert.equal(withPattern('Gyy.MM.dd', '2019-05-01'), 'R01.05.01');
});

test('pattern: quoted text, escaped quotes and untouched characters', () => {
  assert.equal(withPattern("'Era:' GGGG"), 'Era: 令和');
  assert.equal(withPattern("'o''clock'"), "o'clock");
  assert.equal(withPattern("'it''s' GGG"), "it's Reiwa");
  assert.equal(withPattern("''"), "'");
  assert.equal(withPattern("''''"), "''", 'each pair of quotes is one apostrophe');
  assert.equal(withPattern("''''''"), "'''");
  assert.equal(withPattern("y''''M"), "8''11");
  assert.equal(withPattern("'a''b'"), "a'b");
  assert.equal(withPattern("'a'''"), "a'", 'an escaped quote just before the closing quote');
  assert.equal(withPattern("'''a'"), "'a", 'an escaped quote, then quoted text');
  assert.throws(() => withPattern("'''"), SyntaxError, 'an escaped quote, then an unterminated one');
  assert.equal(withPattern("y''M"), "8'11");
  assert.equal(withPattern("'GGGG'"), 'GGGG', 'quoted tokens are literal');
  assert.equal(withPattern("'令和'y"), '令和8');
  assert.equal(withPattern('GGGG-y/M/d.(E)・[u]'), '令和-8/11/11.(水)・[2026]');
  assert.equal(withPattern('年月日 ０１２ é'), '年月日 ０１２ é', 'non-ASCII characters are literals');
  assert.equal(withPattern(''), '');
});

test('pattern: unknown or malformed tokens throw instead of printing garbage', () => {
  for (const bad of ['H', 'GG', 'GGGGG', 'yyy', 'yyyy', 'YY', 'uu', 'MMM', 'MMMM', 'ddd', 'EE', 'EEE', 'x', 'a', 'D', 'w', "o'clock"]) {
    assert.throws(() => withPattern(bad), RangeError, bad);
  }
  assert.throws(() => withPattern("'open"), SyntaxError);
  assert.throws(() => withPattern("a'b'"), RangeError);
  assert.throws(() => withPattern("'a''"), SyntaxError);
  assert.throws(() => withPattern(5), TypeError);
  assert.throws(() => withPattern(null), TypeError);
});

test('pattern: tokens that need a month or day fail clearly when the date has none', () => {
  assert.equal(withPattern('GGGGy年', 2026), '令和8年');
  assert.equal(withPattern('GGGGy年M月', '2026-11'), '令和8年11月');
  assert.throws(() => withPattern('M', 2026), /no month/);
  assert.throws(() => withPattern('d', '2026-11'), /no day/);
  assert.throws(() => withPattern('E', '2026-11'), /no day/);
  assert.throws(() => withPattern('EEEE', 2026), RangeError);
});

test('pattern: cannot be combined with style, gannen or weekday', () => {
  assert.throws(() => withPattern('y', '2026-11-11', { style: 'short' }), /cannot be combined with "style"/);
  assert.throws(() => withPattern('y', '2026-11-11', { gannen: false }), /"gannen"/);
  assert.throws(() => withPattern('y', '2026-11-11', { weekday: 'short' }), /"weekday"/);
  assert.equal(withPattern('y', '2026-11-11', { style: undefined, gannen: undefined, weekday: undefined }), '8');
  assert.throws(() => formatNendo('2026-04-01', { pattern: 'y' }), /does not support/);
});

test('pattern: numerals and timeZone apply', () => {
  assert.equal(withPattern('GGGGY年M月d日', '2026-11-11', { numerals: 'kanji' }), '令和八年十一月十一日');
  assert.equal(withPattern('GGGGY年M月d日(E)', '2026-11-11', { numerals: 'daiji' }), '令和八年拾壱月拾壱日(水)');
  assert.equal(withPattern('GGGGY年M月d日', '2019-05-01', { numerals: 'kanji' }), '令和元年五月一日');
  assert.equal(withPattern('u年', '2026-11-11', { numerals: 'kanji' }), '二千二十六年');
  assert.throws(() => withPattern('yy', '2026-11-11', { numerals: 'kanji' }), /Zero-padded/);
  assert.throws(() => withPattern('MM', '2026-11-11', { numerals: 'daiji' }), RangeError);
  assert.throws(() => withPattern('y', '2026-11-11', { numerals: 'roman' }), RangeError);

  const instant = new Date(Date.UTC(2026, 10, 11, 20, 0, 0));
  assert.equal(withPattern('GGGGy年M月d日(E)', instant, { timeZone: 'Asia/Tokyo' }), '令和8年11月12日(木)');
  assert.equal(withPattern('GGGGy年M月d日(E)', instant, { timeZone: 'America/Los_Angeles' }), '令和8年11月11日(水)');
});

test('pattern: matches style, weekday and numerals for every day 1868-2100', () => {
  const same = (a, b, label) => assert.equal(a, b, label);
  for (let t = Date.UTC(1868, 0, 25); t <= Date.UTC(2100, 11, 31); t += DAY_MS) {
    const d = new Date(t);
    const parts = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    const label = `${parts.year}-${parts.month}-${parts.day}`;
    same(withPattern('GGGGY年M月d日', parts), formatWareki(parts), `long ${label}`);
    same(withPattern('GGGGy年M月d日', parts), formatWareki(parts, { gannen: false }), `long no gannen ${label}`);
    same(withPattern('Gy.M.d', parts), formatWareki(parts, { style: 'short' }), `short ${label}`);
    same(withPattern('GGG y.M.d', parts), formatWareki(parts, { style: 'roman' }), `roman ${label}`);
    same(withPattern('GGGGY年M月d日(E)', parts), formatWareki(parts, { weekday: 'short' }), `weekday ${label}`);
    same(withPattern('GGGGY年M月d日EEEE', parts), formatWareki(parts, { weekday: 'long' }), `weekday long ${label}`);
    same(withPattern('GGGGY年M月d日', parts, { numerals: 'kanji' }), formatWareki(parts, { numerals: 'kanji' }), `kanji ${label}`);
    same(withPattern('GGGGY年M月d日', parts, { numerals: 'daiji' }), formatWareki(parts, { numerals: 'daiji' }), `daiji ${label}`);
    same(withPattern('u', parts), String(parts.year), `gregorian year ${label}`);
  }
});

test('pattern: pathological patterns stay fast', () => {
  const t0 = performance.now();
  assert.equal(withPattern('yy-'.repeat(50_000)).length, 150_000, 'many separate tokens');
  assert.equal(withPattern("'" + 'x'.repeat(500_000) + "'").length, 500_000, 'one long quoted literal');
  assert.equal(withPattern("''".repeat(100_000)).length, 100_000, 'many escaped quotes');
  assert.throws(() => withPattern('G'.repeat(500_000)), RangeError, 'one huge run of one letter');
  assert.throws(() => withPattern("'" + 'x'.repeat(500_000)), SyntaxError, 'unterminated quote');
  assert.ok(performance.now() - t0 < 1000, `took ${(performance.now() - t0).toFixed(0)} ms`);
});

test('error messages never echo huge input back', () => {
  const huge = 'x'.repeat(500_000);
  const messages = [];
  for (const attempt of [
    () => withPattern('G'.repeat(500_000)),
    () => withPattern("'" + huge),
    () => toWareki(huge),
    () => formatWareki(2026, { pattern: 5 }),
    () => toGregorianYear(huge, 1),
    () => parseWareki(huge),
    () => parseNendo(huge),
  ]) {
    let thrown;
    try {
      attempt();
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, 'the call should have thrown');
    messages.push(thrown.message);
  }
  for (const message of messages) assert.ok(message.length < 400, `${message.length} chars: ${message.slice(0, 60)}`);
});

test('CLI: --pattern and --daiji', () => {
  assert.equal(run('2026-11-11', '--pattern', 'GGGGy年M月d日(E)').out, '令和8年11月11日(水)');
  assert.equal(run('2026-11-11', '-p', "GGGGY年M月d日", '--daiji').out, '令和八年拾壱月拾壱日');
  assert.equal(run('2026-11-11', '--daiji').out, '令和八年拾壱月拾壱日');
  assert.equal(run('2026-11-11', '-p', 'GGGGy年', '-k').out, '令和八年');
  const clash = run('2026-11-11', '-p', 'y', '-s', 'short');
  assert.equal(clash.code, 1);
  assert.match(clash.err, /^wareki: .*cannot be combined/);
  assert.equal(run('2026-11-11', '-p', 'H').code, 1);
});

// ---------------------------------------------------------------------------
// findWareki (0.4.0)
// ---------------------------------------------------------------------------

const summary = (found) => found.map((f) => [f.text, f.value && [f.value.gregorianYear, f.value.month, f.value.day]]);

test('findWareki: dates in a paragraph, with exact positions', () => {
  const text = '契約日は令和8年11月11日、有効期限は令和9年3月31日です。平成31年4月30日に締結。';
  const found = findWareki(text);
  assert.deepEqual(summary(found), [
    ['令和8年11月11日', [2026, 11, 11]],
    ['令和9年3月31日', [2027, 3, 31]],
    ['平成31年4月30日', [2019, 4, 30]],
  ]);
  for (const f of found) assert.equal(text.slice(f.index, f.end), f.text);
  assert.deepEqual(found[0].value, parseWareki('令和8年11月11日'));
  assert.deepEqual(findWareki('nothing here, not even 2026年11月11日 or R8'), []);
  assert.deepEqual(findWareki(''), []);
});

test('findWareki: years, months, 元年, full-width digits, kanji and daiji numerals, inner spaces', () => {
  const text = '令和8年 / 令和8年11月 / 令和元年5月1日 / 令和８年１１月１１日 / 令和八年十一月十一日 / 令和 8 年 11 月 11 日 / 令和八年拾壱月拾壱日 / 令和　8年　11月　11日';
  assert.deepEqual(summary(findWareki(text)).map(([, v]) => v), [
    [2026, null, null], [2026, 11, null], [2019, 5, 1], [2026, 11, 11], [2026, 11, 11], [2026, 11, 11], [2026, 11, 11], [2026, 11, 11],
  ]);
  assert.deepEqual(summary(findWareki('平成元年1月8日と昭和64年1月7日')).map(([, v]) => v), [[1989, 1, 8], [1989, 1, 7]]);
});

test('findWareki: romaji names and macrons', () => {
  const text = 'Signed on Reiwa 8.11.11 and Heisei 31.4.30. Also Shōwa 64.1.7, Taishō 15.12.24, Reiwa 8, Reiwa 8.11, Meiji 1.1.25.';
  assert.deepEqual(summary(findWareki(text)), [
    ['Reiwa 8.11.11', [2026, 11, 11]], ['Heisei 31.4.30', [2019, 4, 30]], ['Shōwa 64.1.7', [1989, 1, 7]],
    ['Taishō 15.12.24', [1926, 12, 24]], ['Reiwa 8', [2026, null, null]], ['Reiwa 8.11', [2026, 11, null]], ['Meiji 1.1.25', [1868, 1, 25]],
  ]);
  assert.equal(findWareki('Shōwa 64.1.7')[0].value.gregorianYear, 1989, 'decomposed macron');
  assert.equal(findWareki('REIWA 8.11.11')[0].value.day, 11, 'any case');
});

test('findWareki: single-letter eras only count as capital letters in full dates', () => {
  assert.deepEqual(summary(findWareki('R8.11.11と H31.4.30、S64.1.7 T15.12.24 M1.1.25')).map(([t]) => t), ['R8.11.11', 'H31.4.30', 'S64.1.7', 'T15.12.24', 'M1.1.25']);
  for (const not of ['r8.11.11', 'BR8.11.11', 'R8.11.11x', 'R8.11.11.5', 'R8', 'R8.11', 'xR8.11.11', 'R8.11.111', 'R1.2.3 invalid date']) {
    assert.deepEqual(findWareki(not), [], not);
  }
  assert.deepEqual(findWareki('R8.11.11 and H31.4.30', { abbreviations: false }), []);
  assert.equal(findWareki('(R8.11.11)')[0].text, 'R8.11.11', 'brackets are fine');
  assert.equal(findWareki('R8-11-11')[0].value.month, 11);
  assert.equal(findWareki('R8/11/11')[0].value.day, 11);
});

test('findWareki: fiscal years are not dates, but a month after the year still is', () => {
  assert.deepEqual(findWareki('令和8年度予算 令和元年度 平成31年度'), []);
  assert.deepEqual(summary(findWareki('令和8年度予算は令和8年4月から')), [['令和8年4月', [2026, 4, null]]]);
});

test('findWareki: impossible dates are skipped, or reported with includeInvalid', () => {
  const text = '平成31年5月1日 令和8年2月30日 昭和64年1月8日 令和8年11月11日 令和0年';
  assert.deepEqual(summary(findWareki(text)), [['令和8年11月11日', [2026, 11, 11]]]);
  const all = findWareki(text, { includeInvalid: true });
  assert.deepEqual(all.map((f) => f.text), ['平成31年5月1日', '令和8年2月30日', '昭和64年1月8日', '令和8年11月11日', '令和0年']);
  assert.deepEqual(all.map((f) => f.value === null), [true, true, true, false, true]);
  assert.match(all[0].error, /outside the Heisei era/);
  assert.match(all[1].error, /Invalid day/);
  assert.equal(all[3].error, undefined, 'valid dates have no error');
  assert.ok(!('error' in all[3]));
});

test('findWareki: neighbours, line breaks and positions inside odd text', () => {
  assert.deepEqual(summary(findWareki('令和9年1月1日令和10年2月2日')).map(([t]) => t), ['令和9年1月1日', '令和10年2月2日']);
  assert.deepEqual(findWareki('令和8年\n11月11日').map((f) => f.text), ['令和8年', ], 'a line break ends a date');
  const text = '😀令和8年11月11日㈱令和9年1月1日​令和10年2月2日';
  const found = findWareki(text);
  assert.equal(found.length, 3);
  for (const f of found) assert.equal(text.slice(f.index, f.end), f.text, f.text);
  assert.equal(found[0].index, 2, 'positions count UTF-16 units, like indexOf');
  assert.equal(text.indexOf('令和9年1月1日'), found[1].index);
  assert.deepEqual(findWareki('令和8年11月11日(水)').map((f) => f.text), ['令和8年11月11日'], 'a weekday is not part of the match');
  assert.deepEqual(findWareki('昭和 64年 1月 7日').map((f) => f.text), ['昭和 64年 1月 7日']);
});

test('findWareki: rejects non-strings, never keeps state between calls', () => {
  for (const bad of [undefined, null, 5, {}, ['令和8年']]) assert.throws(() => findWareki(bad), TypeError);
  const a = findWareki('令和8年11月11日');
  const b = findWareki('令和8年11月11日');
  assert.deepEqual(a, b);
  a[0].value.year = 999;
  assert.equal(findWareki('令和8年11月11日')[0].value.year, 8);
});

test('findWareki: finds exactly what was written, in every style, among random filler', () => {
  let seed = 424242;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const filler = 'あいうえお。、「」（）・！？\n 漢字カナ～ー';
  const noise = () => Array.from({ length: Math.floor(rnd() * 6) }, () => filler[Math.floor(rnd() * filler.length)]).join('');
  const styles = [{}, { numerals: 'kanji' }, { numerals: 'daiji' }, { style: 'short' }, { style: 'roman' }, { gannen: false }];

  for (let round = 0; round < 3000; round++) {
    const expected = [];
    let text = noise();
    for (let k = 0; k < 1 + Math.floor(rnd() * 4); k++) {
      const x = Date.UTC(1868, 0, 25) + Math.floor(rnd() * (Date.UTC(2100, 11, 31) - Date.UTC(1868, 0, 25)));
      const u = new Date(x);
      const parts = { year: u.getUTCFullYear(), month: u.getUTCMonth() + 1, day: u.getUTCDate() };
      const written = formatWareki(parts, styles[Math.floor(rnd() * styles.length)]);
      expected.push({ written, index: text.length, parts });
      text += written + (rnd() < 0.3 ? `(${'日月火水木金土'[u.getUTCDay()]})` : '') + noise() + (rnd() < 0.5 ? ' ' : '。');
    }
    const found = findWareki(text);
    assert.deepEqual(found.map((f) => [f.text, f.index]), expected.map((e) => [e.written, e.index]), text);
    found.forEach((f, i) => {
      assert.deepEqual(f.value, parseWareki(f.text));
      assert.equal(f.value.gregorianYear, expected[i].parts.year);
      assert.equal(f.value.month, expected[i].parts.month);
      assert.equal(f.value.day, expected[i].parts.day);
    });
  }
});

test('findWareki: every day 1868-2100 is found in all five styles', () => {
  for (let t = Date.UTC(1868, 0, 25); t <= Date.UTC(2100, 11, 31); t += DAY_MS * 4) {
    const u = new Date(t);
    const parts = { year: u.getUTCFullYear(), month: u.getUTCMonth() + 1, day: u.getUTCDate() };
    for (const opts of [{}, { numerals: 'kanji' }, { numerals: 'daiji' }, { style: 'short' }, { style: 'roman' }]) {
      const written = formatWareki(parts, opts);
      const found = findWareki(`[${written}]`);
      assert.equal(found.length, 1, written);
      assert.equal(found[0].text, written);
      assert.deepEqual([found[0].value.gregorianYear, found[0].value.month, found[0].value.day], [parts.year, parts.month, parts.day], written);
    }
  }
});

test('findWareki: large and hostile text is searched in linear time', () => {
  // Reiwa 2-10: every month and day exists (Reiwa 1 began in May, so 令和1年1月 would not).
  const dates = Array.from({ length: 2000 }, (_, i) => `令和${2 + (i % 9)}年${1 + (i % 12)}月${1 + (i % 28)}日`);
  const big = dates.join('あ'.repeat(2500)); // about 5 MB of text with 2000 dates
  let t0 = performance.now();
  assert.equal(findWareki(big).length, 2000);
  const bigMs = performance.now() - t0;

  t0 = performance.now();
  for (const evil of [
    '令和'.repeat(500_000),
    '令和' + ' '.repeat(1_000_000),
    '令和8年' + ' '.repeat(1_000_000) + '月',
    '令和' + '十'.repeat(1_000_000) + '年',
    'Reiwa '.repeat(300_000),
    'Reiwa ' + '1'.repeat(1_000_000),
    'R' + '1.'.repeat(500_000),
    'R1.1.' + '1'.repeat(1_000_000),
    '令和1年'.repeat(200_000),
    '令和1年1月'.repeat(200_000),
  ]) {
    findWareki(evil, { includeInvalid: true });
  }
  const evilMs = performance.now() - t0;
  assert.ok(bigMs < 1500, `5 MB of text took ${bigMs.toFixed(0)} ms`);
  assert.ok(evilMs < 6000, `hostile inputs took ${evilMs.toFixed(0)} ms`);
});

const runStdin = (input, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input });
  return { out: r.stdout.trim(), err: r.stderr.trim(), code: r.status };
};

test('CLI: --find with an argument, with piped input, as JSON, and with --invalid', () => {
  assert.equal(run('--find', '契約日は令和8年11月11日です').out, '令和8年11月11日 -> 2026-11-11');
  assert.equal(run('-f', 'Signed Reiwa 8.11.11 and R9.1.2').out, 'Reiwa 8.11.11 -> 2026-11-11\nR9.1.2 -> 2027-01-02');
  assert.equal(run('-f', '令和8年と令和8年11月').out, '令和8年 -> 2026\n令和8年11月 -> 2026-11');
  assert.equal(runStdin('契約は令和8年11月11日。\n終了は令和9年3月31日。', '--find').out, '令和8年11月11日 -> 2026-11-11\n令和9年3月31日 -> 2027-03-31');
  assert.equal(runStdin('', '--find', '平成31年5月1日 と 令和8年11月11日').out, '令和8年11月11日 -> 2026-11-11', 'arguments win over stdin');
  assert.match(run('-f', '平成31年5月1日', '--invalid').out, /^平成31年5月1日 -> invalid: .*Heisei era/);
  assert.equal(run('-f', '平成31年5月1日').out, '', 'invalid dates are not listed by default');
  const json = JSON.parse(run('-f', 'Signed Reiwa 8.11.11', '--json').out);
  assert.deepEqual([json[0].text, json[0].index, json[0].end, json[0].value.gregorianYear], ['Reiwa 8.11.11', 7, 20, 2026]);
  assert.deepEqual(JSON.parse(run('-f', 'no dates', '--json').out), []);
  assert.equal(run('-f', 'no dates').code, 0);
});

test('CLI: --find without any text fails clearly', () => {
  const r = runStdin('', '--find');
  assert.equal(r.code, 1);
  assert.match(r.err, /^wareki: --find needs some text/);
  assert.equal(runStdin('   \n', '-f').code, 1);
});
