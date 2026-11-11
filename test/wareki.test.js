import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  ERAS,
  toWareki,
  fromWareki,
  parseWareki,
  formatWareki,
  toGregorianYear,
  getEra,
  erasInYear,
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

test('can be loaded with require() (Node 22.12+)', () => {
  const require = createRequire(import.meta.url);
  const cjs = require('../src/index.js');
  assert.equal(cjs.formatWareki('2026-11-11'), '令和8年11月11日');
});
