/**
 * wareki-kit: convert between Gregorian dates and Japanese era (和暦) dates.
 *
 * Conventions used throughout:
 *  - Era years count calendar years. 昭和64年 is 1-7 Jan 1989 and 平成元年 is
 *    8 Jan-31 Dec 1989.
 *  - JavaScript Date objects are read and created in LOCAL time (the year, month
 *    and day the user's clock shows). No time-zone conversion happens.
 *  - If only a year (or a year and month) is given and an era change falls inside
 *    that period, the era in effect at the END of the period is used.
 */

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y, m) => (m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m - 1]);

/** Sortable integer for a calendar date, e.g. 2026-11-11 -> 20261111. */
const key = (y, m, d) => y * 10000 + m * 100 + d;
const pad = (n) => String(n).padStart(2, '0');
const iso = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;

// ---------------------------------------------------------------------------
// Kanji numerals and weekdays
// ---------------------------------------------------------------------------

const KANJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const KANJI_VALUES = new Map([['零', 0], ...KANJI_DIGITS.map((c, i) => [c, i])]);
const KANJI_UNITS = new Map([
  ['十', 10],
  ['百', 100],
  ['千', 1000],
]);
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** 8 -> 八, 11 -> 十一, 20 -> 二十, 64 -> 六十四, 100 -> 百. Falls back to digits above 9999. */
function toKanjiNumber(n) {
  if (n > 9999) return String(n);
  let out = '';
  let rest = n;
  for (const [value, unit] of [
    [1000, '千'],
    [100, '百'],
    [10, '十'],
  ]) {
    const digit = Math.floor(rest / value);
    rest %= value;
    if (digit > 0) out += (digit === 1 ? '' : KANJI_DIGITS[digit]) + unit;
  }
  return out + (rest > 0 ? KANJI_DIGITS[rest] : '');
}

/**
 * Reads 八, 十一, 二十一, 六十四, 百二十 and also positional forms such as 二〇.
 * Returns NaN for anything malformed (十十, 二〇十, 一一, ...).
 */
function parseKanjiNumber(text) {
  if (![...text].some((c) => KANJI_UNITS.has(c))) {
    let n = 0;
    for (const c of text) {
      const d = KANJI_VALUES.get(c);
      if (d === undefined) return NaN;
      n = n * 10 + d;
    }
    return n;
  }
  let total = 0;
  let lastUnit = Infinity;
  let digit = null;
  for (const c of text) {
    const unit = KANJI_UNITS.get(c);
    if (unit !== undefined) {
      if (unit >= lastUnit) return NaN;
      total += (digit ?? 1) * unit;
      digit = null;
      lastUnit = unit;
    } else {
      const d = KANJI_VALUES.get(c);
      if (d === undefined || d === 0 || digit !== null) return NaN;
      digit = d;
    }
  }
  return total + (digit ?? 0);
}

/** Day of the week (0 = Sunday) for a Gregorian date. */
const weekdayOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

// ---------------------------------------------------------------------------
// Era table
// ---------------------------------------------------------------------------

const calendarDate = (year, month, day) => Object.freeze({ year, month, day });
const makeEra = (name, roman, short, start, end) =>
  Object.freeze({ name, roman, short, start, end });

/**
 * The supported eras, oldest first. `end` is null for the current era.
 * If a new era is ever announced, add it here and close the previous one.
 */
export const ERAS = Object.freeze([
  makeEra('明治', 'Meiji', 'M', calendarDate(1868, 1, 25), calendarDate(1912, 7, 29)),
  makeEra('大正', 'Taisho', 'T', calendarDate(1912, 7, 30), calendarDate(1926, 12, 24)),
  makeEra('昭和', 'Showa', 'S', calendarDate(1926, 12, 25), calendarDate(1989, 1, 7)),
  makeEra('平成', 'Heisei', 'H', calendarDate(1989, 1, 8), calendarDate(2019, 4, 30)),
  makeEra('令和', 'Reiwa', 'R', calendarDate(2019, 5, 1), null),
]);

const startKey = (era) => key(era.start.year, era.start.month, era.start.day);
const endKey = (era) => (era.end ? key(era.end.year, era.end.month, era.end.day) : Infinity);

// ---------------------------------------------------------------------------
// Era lookup
// ---------------------------------------------------------------------------

const stripMarks = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');

const ERA_LOOKUP = new Map();
for (const era of ERAS) {
  for (const label of [era.name, era.roman, era.short]) {
    ERA_LOOKUP.set(label.toLowerCase(), era);
  }
}

/** Accepts 令和, Reiwa, reiwa, R, r (and macron forms such as Taishō). */
function findEra(token) {
  const label =
    typeof token === 'string' ? stripMarks(token.normalize('NFKC').trim()).toLowerCase() : '';
  const era = ERA_LOOKUP.get(label);
  if (!era) throw new RangeError(`Unknown era: ${String(token)}`);
  return era;
}

// ---------------------------------------------------------------------------
// Validation and result building
// ---------------------------------------------------------------------------

/** Validates Gregorian year/month/day, where month and day may be null. */
function checkParts(year, month, day) {
  if (!Number.isInteger(year)) throw new TypeError(`Invalid year: ${String(year)}`);
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
    throw new RangeError(`Invalid month: ${String(month)} (expected 1-12)`);
  }
  if (day !== null) {
    if (month === null) throw new TypeError('A day was given without a month');
    const max = daysInMonth(year, month);
    if (!Number.isInteger(day) || day < 1 || day > max) {
      throw new RangeError(`Invalid day: ${String(day)} (${year}-${pad(month)} has ${max} days)`);
    }
  }
}

const build = (era, eraYear, month, day) => ({
  era: era.name,
  eraRoman: era.roman,
  eraShort: era.short,
  year: eraYear,
  month,
  day,
  gregorianYear: era.start.year + eraYear - 1,
});

const STYLES = ['long', 'short', 'roman'];

function formatParts(era, eraYear, month, day, style, gannen, numerals = 'arabic') {
  if (style === 'long') {
    const n = numerals === 'kanji' ? toKanjiNumber : String;
    const y = gannen && eraYear === 1 ? '元' : n(eraYear);
    return `${era.name}${y}年${month === null ? '' : `${n(month)}月`}${day === null ? '' : `${n(day)}日`}`;
  }
  const head = style === 'short' ? `${era.short}${eraYear}` : `${era.roman} ${eraYear}`;
  return head + (month === null ? '' : `.${month}`) + (day === null ? '' : `.${day}`);
}

/** Validates an era date and returns it in the standard result shape. */
function resolveWareki(input) {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('Expected an object like { era, year, month?, day? }');
  }
  const era = findEra(input.era);
  const { year } = input;
  const month = input.month ?? null;
  const day = input.day ?? null;

  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError(`Invalid era year: ${String(year)} (expected a whole number, 1 or more)`);
  }
  const gregorianYear = era.start.year + year - 1;
  checkParts(gregorianYear, month, day);

  // The (possibly partial) date must overlap the era.
  const lo = key(gregorianYear, month ?? 1, day ?? 1);
  const hi = key(gregorianYear, month ?? 12, day ?? daysInMonth(gregorianYear, month ?? 12));
  if (hi < startKey(era) || lo > endKey(era)) {
    const span = era.end
      ? `${iso(era.start)} to ${iso(era.end)}`
      : `${iso(era.start)} onward`;
    const label = formatParts(era, year, month, day, 'long', false);
    throw new RangeError(`${label} is outside the ${era.roman} era (${span})`);
  }
  return build(era, year, month, day);
}

/** Reads a Date, "YYYY-MM-DD" string, year number or { year, month?, day? } object. */
function readGregorian(input) {
  let year;
  let month = null;
  let day = null;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new TypeError('Invalid Date');
    year = input.getFullYear();
    month = input.getMonth() + 1;
    day = input.getDate();
  } else if (typeof input === 'string') {
    const m = /^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?$/.exec(input.normalize('NFKC').trim());
    if (!m) {
      throw new TypeError(`Cannot read "${input}" as a date. Use "YYYY-MM-DD", "YYYY-MM" or "YYYY".`);
    }
    year = Number(m[1]);
    month = m[2] === undefined ? null : Number(m[2]);
    day = m[3] === undefined ? null : Number(m[3]);
  } else if (typeof input === 'number') {
    year = input;
  } else if (input !== null && typeof input === 'object') {
    if ('era' in input) {
      throw new TypeError(
        'Expected a Gregorian date but got an object with an "era" field. Use fromWareki() for era dates.',
      );
    }
    year = input.year;
    month = input.month ?? null;
    day = input.day ?? null;
  } else {
    throw new TypeError(
      'Expected a Date, a "YYYY-MM-DD" string, a year number, or a { year, month?, day? } object.',
    );
  }

  checkParts(year, month, day);
  return { year, month, day };
}

// ---------------------------------------------------------------------------
// Parsing patterns
// ---------------------------------------------------------------------------

const NUMBER = String.raw`(?:\d{1,3}|[〇零一二三四五六七八九十百千]+)`;

/** 令和8年11月11日, 令和元年, 令和八年十一月十一日 */
const KANJI_DATE = new RegExp(
  String.raw`^(明治|大正|昭和|平成|令和)\s*(元|${NUMBER})\s*年(?:\s*(${NUMBER})\s*月(?:\s*(${NUMBER})\s*日)?)?$`,
);

/** R8.11.11, Reiwa 8.11.11 (already lower-cased and stripped of macrons) */
const LATIN_DATE =
  /^(meiji|taisho|showa|heisei|reiwa|[mtshr])\s*(\d{1,3})(?:[./-](\d{1,2})(?:[./-](\d{1,2}))?)?$/;

/** A trailing weekday: (水)  (水曜日)  水曜日  (Wed)  (Wednesday) */
const WEEKDAY_SUFFIX =
  /^(.*?)\s*(?:\(\s*([日月火水木金土])(?:曜日)?\s*\)|([日月火水木金土])曜日|\(\s*(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\s*\))$/i;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a Gregorian date to a wareki date.
 *
 * @example
 * toWareki('2026-11-11');
 * // { era: '令和', eraRoman: 'Reiwa', eraShort: 'R', year: 8, month: 11, day: 11, gregorianYear: 2026 }
 */
export function toWareki(input) {
  const { year, month, day } = readGregorian(input);
  const probe = key(year, month ?? 12, day ?? daysInMonth(year, month ?? 12));

  for (let i = ERAS.length - 1; i >= 0; i--) {
    if (probe >= startKey(ERAS[i])) {
      return build(ERAS[i], year - ERAS[i].start.year + 1, month, day);
    }
  }
  throw new RangeError(
    `Dates before ${iso(ERAS[0].start)} (the start of the ${ERAS[0].roman} era) are not supported`,
  );
}

/**
 * Parse wareki text such as "令和8年11月11日", "令和八年十一月十一日", "R8.11.11" or
 * "Reiwa 8". Full-width digits are accepted. A trailing weekday such as "(水)" is
 * accepted and must match the date. Throws if the date does not exist in that era.
 */
export function parseWareki(text) {
  if (typeof text !== 'string') throw new TypeError('parseWareki() expects a string');
  let s = text.normalize('NFKC').trim();

  let weekday = null;
  const wd = WEEKDAY_SUFFIX.exec(s);
  if (wd) {
    s = wd[1];
    const ja = wd[2] ?? wd[3];
    weekday = ja
      ? WEEKDAYS_JA.indexOf(ja)
      : WEEKDAYS_EN.findIndex((name) => name.slice(0, 3).toLowerCase() === wd[4].slice(0, 3).toLowerCase());
  }

  const num = (v) => {
    if (v === undefined) return null;
    const n = /^\d/.test(v) ? Number(v) : parseKanjiNumber(v);
    if (Number.isNaN(n)) throw new SyntaxError(`Cannot read "${v}" as a number in "${text}"`);
    return n;
  };

  let result;
  const kanji = KANJI_DATE.exec(s);
  if (kanji) {
    result = resolveWareki({
      era: kanji[1],
      year: kanji[2] === '元' ? 1 : num(kanji[2]),
      month: num(kanji[3]),
      day: num(kanji[4]),
    });
  } else {
    const latin = LATIN_DATE.exec(stripMarks(s).toLowerCase());
    if (!latin) {
      throw new SyntaxError(
        `Cannot parse "${text}" as a wareki date. Try "令和8年11月11日", "R8.11.11" or "Reiwa 8.11.11".`,
      );
    }
    result = resolveWareki({
      era: latin[1],
      year: Number(latin[2]),
      month: latin[3] === undefined ? null : Number(latin[3]),
      day: latin[4] === undefined ? null : Number(latin[4]),
    });
  }

  if (weekday !== null) {
    if (result.month === null || result.day === null) {
      throw new RangeError('A weekday needs a full date (year, month and day)');
    }
    const actual = weekdayOf(result.gregorianYear, result.month, result.day);
    if (actual !== weekday) {
      throw new RangeError(
        `${text.trim()} does not match: that date is a ${WEEKDAYS_EN[actual]}, not a ${WEEKDAYS_EN[weekday]}`,
      );
    }
  }
  return result;
}

/**
 * Convert a wareki date to a JavaScript Date (local midnight).
 * Takes wareki text or an object. Month and day are required.
 *
 * @example
 * fromWareki('令和8年11月11日');
 * fromWareki({ era: 'H', year: 31, month: 4, day: 30 });
 */
export function fromWareki(input) {
  const w = typeof input === 'string' ? parseWareki(input) : resolveWareki(input);
  if (w.month === null || w.day === null) {
    throw new TypeError(
      'fromWareki() needs a full date (era, year, month and day). Use toGregorianYear() for a year only.',
    );
  }
  return new Date(w.gregorianYear, w.month - 1, w.day);
}

/**
 * Format a Gregorian date as wareki text.
 *
 * Options:
 *  - style: 'long' (令和8年11月11日, default), 'short' (R8.11.11) or 'roman' (Reiwa 8.11.11)
 *  - gannen: write 元年 instead of 1年 in the long style (default true)
 *  - numerals: 'arabic' (default) or 'kanji' (令和八年十一月十一日); long style only
 *  - weekday: false (default), 'short' or 'long' (or true for 'short'); needs a full date
 */
export function formatWareki(input, options = {}) {
  const { style = 'long', gannen = true, numerals = 'arabic' } = options;
  const weekday = options.weekday === true ? 'short' : (options.weekday ?? false);

  if (!STYLES.includes(style)) {
    throw new RangeError(`Unknown style "${String(style)}". Use ${STYLES.map((s) => `"${s}"`).join(', ')}.`);
  }
  if (numerals !== 'arabic' && numerals !== 'kanji') {
    throw new RangeError(`Unknown numerals "${String(numerals)}". Use "arabic" or "kanji".`);
  }
  if (numerals === 'kanji' && style !== 'long') {
    throw new RangeError('numerals: "kanji" can only be used with style: "long"');
  }
  if (weekday !== false && weekday !== 'short' && weekday !== 'long') {
    throw new RangeError(`Unknown weekday option "${String(weekday)}". Use false, "short" or "long".`);
  }

  const w = toWareki(input);
  const text = formatParts(findEra(w.era), w.year, w.month, w.day, style, gannen, numerals);
  if (weekday === false) return text;

  if (w.month === null || w.day === null) {
    throw new RangeError('The weekday option needs a full date (year, month and day)');
  }
  const dow = weekdayOf(w.gregorianYear, w.month, w.day);
  if (style === 'roman') {
    const name = WEEKDAYS_EN[dow];
    return `${text} (${weekday === 'long' ? name : name.slice(0, 3)})`;
  }
  if (weekday === 'long') {
    return style === 'long' ? `${text}${WEEKDAYS_JA[dow]}曜日` : `${text}(${WEEKDAYS_JA[dow]}曜日)`;
  }
  return `${text}(${WEEKDAYS_JA[dow]})`;
}

/**
 * Gregorian year for an era year, e.g. toGregorianYear('平成', 1) === 1989.
 * `era` can be 平成, Heisei or H.
 */
export function toGregorianYear(era, year) {
  return resolveWareki({ era, year }).gregorianYear;
}

/** The era object (see ERAS) in effect for a Gregorian date. */
export function getEra(input) {
  return findEra(toWareki(input).era);
}

/**
 * Every era that overlaps a Gregorian year, oldest first.
 * erasInYear(1989) returns 昭和64 and 平成1.
 */
export function erasInYear(year) {
  if (!Number.isInteger(year)) throw new TypeError(`Invalid year: ${String(year)}`);
  const matches = ERAS.filter(
    (era) => year >= era.start.year && (era.end === null || year <= era.end.year),
  ).map((era) => build(era, year - era.start.year + 1, null, null));
  if (matches.length === 0) {
    throw new RangeError(`Years before ${ERAS[0].start.year} are not supported`);
  }
  return matches;
}
