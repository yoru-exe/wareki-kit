'use strict';
// Generated from src/index.js by scripts/build-cjs.js. Do not edit by hand.
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
/** User text as shown in an error message, so a huge input cannot make a huge message. */
const preview = (text) => (text.length > 40 ? `${text.slice(0, 40)}…` : text);
const iso = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;

// ---------------------------------------------------------------------------
// Kanji numerals and weekdays
// ---------------------------------------------------------------------------

const KANJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
// Daiji (大字): the forms used in legal and financial documents, where 一 二 三 十
// are too easy to alter. Only these four are replaced; the other numerals are unchanged.
const DAIJI = new Map([
  ['一', '壱'],
  ['二', '弐'],
  ['三', '参'],
  ['十', '拾'],
]);
const KANJI_VALUES = new Map([
  ['零', 0],
  ...KANJI_DIGITS.map((c, i) => [c, i]),
  ['壱', 1],
  ['壹', 1], // old form of 壱
  ['弐', 2],
  ['貳', 2], // old form of 弐
  ['参', 3],
  ['參', 3], // old form of 参
]);
const KANJI_UNITS = new Map([
  ['十', 10],
  ['拾', 10],
  ['百', 100],
  ['千', 1000],
]);
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * 8 -> 八, 11 -> 十一, 20 -> 二十, 64 -> 六十四, 100 -> 百. Falls back to digits above 9999.
 * With `daiji`, 一 二 三 十 become 壱 弐 参 拾: 11 -> 拾壱, 22 -> 弐拾弐.
 */
function toKanjiNumber(n, daiji = false) {
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
  out += rest > 0 ? KANJI_DIGITS[rest] : '';
  return daiji ? [...out].map((c) => DAIJI.get(c) ?? c).join('') : out;
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
const ERAS = Object.freeze([
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
  if (!era) throw new RangeError(`Unknown era: ${typeof token === 'string' ? preview(token) : String(token)}`);
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
    const n =
      numerals === 'kanji'
        ? toKanjiNumber
        : numerals === 'daiji'
          ? (value) => toKanjiNumber(value, true)
          : String;
    const y = gannen && eraYear === 1 ? '元' : n(eraYear);
    return `${era.name}${y}年${month === null ? '' : `${n(month)}月`}${day === null ? '' : `${n(day)}日`}`;
  }
  const head = style === 'short' ? `${era.short}${eraYear}` : `${era.roman} ${eraYear}`;
  return head + (month === null ? '' : `.${month}`) + (day === null ? '' : `.${day}`);
}

/** Which repeat counts each pattern letter accepts. See formatWareki(). */
const PATTERN_TOKENS = {
  G: [1, 3, 4], // R, Reiwa, 令和
  y: [1, 2], // 8, 08
  Y: [1], // 元 for the first year, otherwise 8
  u: [1, 4], // 2026
  M: [1, 2],
  d: [1, 2],
  E: [1, 4], // 水, 水曜日
};

/** Renders an era date with a pattern such as "GGGGy年M月d日(E)". */
function formatPattern(w, pattern, numerals) {
  const number = (value, width) => {
    if (numerals === 'arabic') return String(value).padStart(width, '0');
    if (width > 1) {
      throw new RangeError(`Zero-padded tokens such as "yy" cannot be used with numerals: "${numerals}"`);
    }
    return toKanjiNumber(value, numerals === 'daiji');
  };
  const require = (value, what, token) => {
    if (value === null) throw new RangeError(`The pattern uses "${token}" but the date has no ${what}`);
    return value;
  };

  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];

    if (c === "'") {
      // Two quotes in a row, inside quoted text or not, make one '.
      if (pattern[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      // Otherwise 'quoted text' is copied as it is.
      let j = i + 1;
      let literal = '';
      for (;;) {
        if (j >= pattern.length) {
          throw new SyntaxError(`Unterminated quote in pattern "${preview(pattern)}"`);
        }
        if (pattern[j] === "'") {
          if (pattern[j + 1] !== "'") break;
          literal += "'";
          j += 2;
        } else {
          literal += pattern[j];
          j += 1;
        }
      }
      out += literal;
      i = j + 1;
      continue;
    }

    if (!/[A-Za-z]/.test(c)) {
      out += c;
      i += 1;
      continue;
    }

    let end = i + 1;
    while (pattern[end] === c) end += 1;
    const token = pattern.slice(i, end);
    const allowed = PATTERN_TOKENS[c];
    if (!allowed || !allowed.includes(token.length)) {
      const known = Object.entries(PATTERN_TOKENS)
        .map(([letter, lengths]) => lengths.map((n) => letter.repeat(n)).join(' '))
        .join(' ');
      throw new RangeError(
        `Unsupported pattern token "${preview(token)}". Supported: ${known}. Put literal letters in 'quotes'.`,
      );
    }

    if (c === 'G') out += token.length === 1 ? w.eraShort : token.length === 3 ? w.eraRoman : w.era;
    else if (c === 'y') out += number(w.year, token.length);
    else if (c === 'Y') out += w.year === 1 ? '元' : number(w.year, 1);
    else if (c === 'u') out += number(w.gregorianYear, token.length);
    else if (c === 'M') out += number(require(w.month, 'month', token), token.length);
    else if (c === 'd') out += number(require(w.day, 'day', token), token.length);
    else {
      require(w.day, 'day', token);
      const name = WEEKDAYS_JA[weekdayOf(w.gregorianYear, w.month, w.day)];
      out += token.length === 1 ? name : `${name}曜日`;
    }
    i = end;
  }
  return out;
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

/** The calendar id of a Temporal object ("iso8601" for the default), or undefined for anything else. */
function temporalCalendar(input) {
  const calendar = input.calendarId ?? input.calendar; // `calendar` is the older spelling
  const id = typeof calendar === 'string' ? calendar : calendar?.id;
  return typeof id === 'string' && typeof input.year === 'number' && typeof input.month === 'number'
    ? id
    : undefined;
}

const ZONED_FORMATTERS = new Map();

/** The calendar year, month and day a Date has in the given IANA time zone. */
function zonedParts(date, timeZone) {
  let fmt = ZONED_FORMATTERS.get(timeZone);
  if (!fmt) {
    // Throws a RangeError for an unknown time zone, so only valid zones get cached.
    fmt = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    ZONED_FORMATTERS.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Reads a Date, "YYYY-MM-DD" string, year number or { year, month?, day? } object.
 * `timeZone` only affects Date input: without it a Date is read in local time.
 */
function readGregorian(input, timeZone) {
  let year;
  let month = null;
  let day = null;

  if (timeZone !== undefined && typeof timeZone !== 'string') {
    throw new TypeError(`Invalid timeZone: ${String(timeZone)} (expected an IANA name such as "Asia/Tokyo")`);
  }

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new TypeError('Invalid Date');
    if (timeZone === undefined) {
      year = input.getFullYear();
      month = input.getMonth() + 1;
      day = input.getDate();
    } else {
      ({ year, month, day } = zonedParts(input, timeZone));
    }
  } else if (typeof input === 'string') {
    const m = /^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?$/.exec(input.normalize('NFKC').trim());
    if (!m) {
      throw new TypeError(
        `Cannot read "${preview(input)}" as a date. Use "YYYY-MM-DD", "YYYY-MM" or "YYYY".`,
      );
    }
    year = Number(m[1]);
    month = m[2] === undefined ? null : Number(m[2]);
    day = m[3] === undefined ? null : Number(m[3]);
  } else if (typeof input === 'number') {
    year = input;
  } else if (input !== null && typeof input === 'object' && temporalCalendar(input) !== undefined) {
    // Temporal.PlainDate, PlainDateTime, PlainYearMonth or ZonedDateTime. This must come
    // before the generic object branch: these objects have an `era` getter.
    const calendar = temporalCalendar(input);
    if (calendar !== 'iso8601') {
      throw new TypeError(
        `Only the ISO 8601 calendar is supported (got "${calendar}"). Convert it first with .withCalendar('iso8601').`,
      );
    }
    year = input.year;
    month = input.month;
    day = input.day ?? null; // a PlainYearMonth has no day
  } else if (
    input !== null &&
    typeof input === 'object' &&
    typeof input.epochMilliseconds === 'number' &&
    input.year === undefined
  ) {
    // Temporal.Instant: read it like a Date, in `timeZone` or local time.
    return readGregorian(new Date(input.epochMilliseconds), timeZone);
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

const NUMBER = String.raw`(?:\d{1,5}|[〇零一二三四五六七八九十百千壱壹弐貳参參拾]+)`;

/** Real dates are a few dozen characters. Anything longer is rejected up front. */
const MAX_INPUT_LENGTH = 200;

/** 令和8年11月11日, 令和元年, 令和八年十一月十一日 */
const KANJI_DATE = new RegExp(
  String.raw`^(明治|大正|昭和|平成|令和)\s*(元|${NUMBER})\s*年(?:\s*(${NUMBER})\s*月(?:\s*(${NUMBER})\s*日)?)?$`,
);

/** R8.11.11, Reiwa 8.11.11 (already lower-cased and stripped of macrons) */
const LATIN_DATE =
  /^(meiji|taisho|showa|heisei|reiwa|[mtshr])\s*(\d{1,5})(?:[./-](\d{1,2})(?:[./-](\d{1,2}))?)?$/;

/**
 * A trailing weekday: (水)  (水曜日)  水曜日  (Wed)  (Wednesday)
 * Deliberately not anchored at the start: a leading `(.*?)\s*` makes the match
 * quadratic on long runs of spaces. Use `match.index` to cut the suffix off.
 */
const WEEKDAY_SUFFIX =
  /(?:\(\s*([日月火水木金土])(?:曜日)?\s*\)|([日月火水木金土])曜日|\(\s*(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\s*\))$/i;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a Gregorian date to a wareki date.
 *
 * @example
 * toWareki('2026-11-11');
 * // { era: '令和', eraRoman: 'Reiwa', eraShort: 'R', year: 8, month: 11, day: 11, gregorianYear: 2026 }
 *
 * Pass `{ timeZone: 'Asia/Tokyo' }` to read a Date in that time zone instead of local time.
 */
function toWareki(input, options) {
  const { year, month, day } = readGregorian(input, options?.timeZone);
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
function parseWareki(text) {
  if (typeof text !== 'string') throw new TypeError('parseWareki() expects a string');
  if (text.length > MAX_INPUT_LENGTH) {
    throw new SyntaxError(`Input is too long to be a wareki date (over ${MAX_INPUT_LENGTH} characters)`);
  }
  let s = text.normalize('NFKC').trim();

  let weekday = null;
  const wd = WEEKDAY_SUFFIX.exec(s);
  if (wd) {
    s = s.slice(0, wd.index).trimEnd();
    const ja = wd[1] ?? wd[2];
    weekday = ja
      ? WEEKDAYS_JA.indexOf(ja)
      : WEEKDAYS_EN.findIndex((name) => name.slice(0, 3).toLowerCase() === wd[3].slice(0, 3).toLowerCase());
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
function fromWareki(input) {
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
 *  - timeZone: IANA name, used to read a Date (see toWareki)
 *  - pattern: your own layout instead of style/gannen/weekday, e.g. 'GGGGy年M月d日(E)'.
 *      G R  GGG Reiwa  GGGG 令和 | y 8  yy 08  Y 元 or 8  u 2026  uuuu 2026
 *      M 11  MM 11  d 5  dd 05 | E 水  EEEE 水曜日 | 'quoted text' | other characters as they are
 *    `numerals` still applies to the number tokens. Unknown letters throw.
 */
function formatWareki(input, options = {}) {
  const { style = 'long', gannen = true, numerals = 'arabic', timeZone } = options;
  const weekday = options.weekday === true ? 'short' : (options.weekday ?? false);

  if (!STYLES.includes(style)) {
    throw new RangeError(`Unknown style "${String(style)}". Use ${STYLES.map((s) => `"${s}"`).join(', ')}.`);
  }
  if (numerals !== 'arabic' && numerals !== 'kanji' && numerals !== 'daiji') {
    throw new RangeError(`Unknown numerals "${String(numerals)}". Use "arabic", "kanji" or "daiji".`);
  }
  if (numerals !== 'arabic' && style !== 'long') {
    throw new RangeError(`numerals: "${numerals}" can only be used with style: "long"`);
  }
  if (weekday !== false && weekday !== 'short' && weekday !== 'long') {
    throw new RangeError(`Unknown weekday option "${String(weekday)}". Use false, "short" or "long".`);
  }
  if (options.pattern !== undefined) {
    if (typeof options.pattern !== 'string') throw new TypeError('The "pattern" option must be a string');
    for (const option of ['style', 'gannen', 'weekday']) {
      if (options[option] !== undefined) {
        throw new RangeError(`The "pattern" option cannot be combined with "${option}": put it in the pattern instead`);
      }
    }
  }

  const w = toWareki(input, { timeZone });
  if (options.pattern !== undefined) return formatPattern(w, options.pattern, numerals);
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
function toGregorianYear(era, year) {
  return resolveWareki({ era, year }).gregorianYear;
}

/** The era object (see ERAS) in effect for a Gregorian date. */
function getEra(input, options) {
  return findEra(toWareki(input, options).era);
}

/**
 * Every era that overlaps a Gregorian year, oldest first.
 * erasInYear(1989) returns 昭和64 and 平成1.
 */
function erasInYear(year) {
  if (!Number.isInteger(year)) throw new TypeError(`Invalid year: ${String(year)}`);
  const matches = ERAS.filter(
    (era) => year >= era.start.year && (era.end === null || year <= era.end.year),
  ).map((era) => build(era, year - era.start.year + 1, null, null));
  if (matches.length === 0) {
    throw new RangeError(`Years before ${ERAS[0].start.year} are not supported`);
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Fiscal years (年度)
// ---------------------------------------------------------------------------

/** The Gregorian year in which the fiscal year containing this date begins. */
function fiscalYearOf(input, startMonth, timeZone) {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new RangeError(`Invalid startMonth: ${String(startMonth)} (expected 1-12)`);
  }
  const { year, month } = readGregorian(input, timeZone);
  if (startMonth === 1) return year;
  if (month === null) {
    throw new RangeError('A fiscal year needs at least a year and a month (or a full date)');
  }
  return month >= startMonth ? year : year - 1;
}

/**
 * The fiscal year (年度) a date falls in, as a wareki object with no month or day.
 * The fiscal year starts in April by default (`startMonth`, 1-12) and is named by
 * the year it starts in. `gregorianYear` is that starting year.
 *
 * Like a year-only date, it uses the era in effect at the END of that calendar
 * year, so April 2019 to March 2020 is 令和元年度 (not 平成31年度).
 *
 * @example
 * toNendo('2026-03-31'); // 令和7年度 (era year 7)
 * toNendo('2026-04-01'); // 令和8年度 (era year 8)
 */
function toNendo(input, options = {}) {
  return toWareki(fiscalYearOf(input, options.startMonth ?? 4, options.timeZone));
}

/**
 * Format the fiscal year of a date as text.
 * Takes the options of formatWareki (except `weekday`) plus `startMonth`.
 *
 *  formatNendo('2026-05-01')                    // 令和8年度
 *  formatNendo('2026-05-01', { style: 'short' }) // R8年度
 *  formatNendo('2026-05-01', { style: 'roman' }) // Reiwa 8 fiscal year
 */
function formatNendo(input, options = {}) {
  if (options.pattern !== undefined) throw new RangeError('formatNendo() does not support the "pattern" option');
  const { startMonth = 4, timeZone, style = 'long', ...rest } = options;
  const text = formatWareki(fiscalYearOf(input, startMonth, timeZone), { ...rest, style });
  if (style === 'short') return `${text}年度`;
  if (style === 'roman') return `${text} fiscal year`;
  return `${text}度`;
}

/**
 * Parse fiscal year text such as "令和8年度", "令和元年度", "令和八年度", "R8年度" or
 * "Reiwa 8 fiscal year". The result has no month or day, and `gregorianYear` is
 * the calendar year the fiscal year starts in. Names written before an era change,
 * such as "平成31年度" (the same fiscal year as 令和元年度), are accepted too.
 */
function parseNendo(text) {
  if (typeof text !== 'string') throw new TypeError('parseNendo() expects a string');
  if (text.length > MAX_INPUT_LENGTH) {
    throw new SyntaxError(`Input is too long to be a fiscal year (over ${MAX_INPUT_LENGTH} characters)`);
  }
  const s = text.normalize('NFKC').trim();

  const candidates = [];
  if (s.endsWith('年度')) candidates.push(s.slice(0, -1), s.slice(0, -2)); // 令和8年度, R8年度
  else if (s.endsWith('度')) candidates.push(s.slice(0, -1));
  else {
    const m = /^(.{1,100}?)\s+fiscal\s+year$/i.exec(s);
    if (m) candidates.push(m[1]);
  }

  for (const candidate of candidates) {
    try {
      const w = parseWareki(candidate);
      if (w.month === null) return w; // "令和8年4月度" is not a fiscal year
    } catch (error) {
      if (error instanceof RangeError) throw error; // readable, but the date cannot exist
    }
  }
  throw new SyntaxError(
    `Cannot parse "${text}" as a fiscal year. Try "令和8年度", "R8年度" or "Reiwa 8 fiscal year".`,
  );
}

// ---------------------------------------------------------------------------
// Validation helpers that never throw
// ---------------------------------------------------------------------------

/** Like parseWareki(), but returns null instead of throwing (also for non-strings). */
function tryParseWareki(text) {
  try {
    return parseWareki(text);
  } catch {
    return null;
  }
}

/** True if the text is a valid wareki date, such as "令和8年11月11日" or "R8.11.11". */
function isValidWareki(text) {
  return tryParseWareki(text) !== null;
}

// ---------------------------------------------------------------------------
// Finding wareki dates in text
// ---------------------------------------------------------------------------

const SPACE = String.raw`[ \t　]*`; // spaces inside a date; never a line break
const TEXT_NUMBER = String.raw`(?:[0-9０-９]{1,5}|[〇零一二三四五六七八九十百千壱壹弐貳参參拾]+)`;

/** 令和8年11月11日, 令和元年, 令和八年十一月十一日, 令和８年１１月１１日 */
const FIND_KANJI = String.raw`(?:明治|大正|昭和|平成|令和)${SPACE}(?:元|${TEXT_NUMBER})${SPACE}年(?:${SPACE}${TEXT_NUMBER}${SPACE}月(?:${SPACE}${TEXT_NUMBER}${SPACE}日)?)?`;

/** Reiwa 8, Reiwa 8.11, Reiwa 8.11.11, Shōwa 64.1.7 (not when followed by more digits or letters) */
const FIND_ROMAJI = String.raw`(?<![A-Za-z])(?:Meiji|Taish(?:ō?|ō)|Sh(?:ō?|ō)wa|Heisei|Reiwa)[ \t]*[0-9]{1,5}(?:[./-][0-9]{1,2}(?:[./-][0-9]{1,2})?)?(?![A-Za-z0-9]|[./-][0-9])`;

/** R8.11.11: a single letter is only trusted as part of a full date. */
const FIND_ABBREVIATION = String.raw`(?<![A-Za-z0-9])[MTSHR][0-9]{1,3}[./-][0-9]{1,2}[./-][0-9]{1,2}(?![A-Za-z0-9]|[./-][0-9])`;

/**
 * Find wareki dates in a piece of text and return them in order.
 *
 * Each result has the matched `text`, its position (`index` and `end`, so that
 * `source.slice(index, end) === text`) and the parsed `value`, exactly as
 * parseWareki() would return it. A match can be a year, a year and month, or a full date.
 *
 * What is recognised: 令和8年11月11日 (also 元年, kanji and daiji numerals, full-width
 * digits and spaces), Reiwa 8.11.11 (also Reiwa 8 and Reiwa 8.11), and R8.11.11. A single
 * letter such as R is only matched as a full date, in capitals, because "R8" alone could be
 * anything; turn those off with `{ abbreviations: false }`. A year followed by 度, as in
 * 令和8年度, is a fiscal year and is skipped. A weekday after the date is not part of the match.
 *
 * Text that looks like a date but cannot exist (平成31年5月1日, 令和8年2月30日) is skipped.
 * With `{ includeInvalid: true }` it is returned with `value: null` and an `error` message.
 */
function findWareki(text, options = {}) {
  if (typeof text !== 'string') throw new TypeError('findWareki() expects a string');
  const { includeInvalid = false, abbreviations = true } = options;

  const source = [FIND_KANJI, FIND_ROMAJI, ...(abbreviations ? [FIND_ABBREVIATION] : [])].join('|');
  const found = [];
  for (const match of text.matchAll(new RegExp(source, 'gi'))) {
    const matched = match[0];
    const { index } = match;
    const end = index + matched.length;

    // The "i" flag also lets lowercase letters through: only capital R, H, S, T, M count.
    if (/^[mtshr][0-9]/i.test(matched) && !/^[MTSHR]/.test(matched)) continue;
    // 令和8年度 is a fiscal year, not the year 令和8.
    if (matched.endsWith('年') && text[end] === '度') continue;

    try {
      found.push({ text: matched, index, end, value: parseWareki(matched) });
    } catch (error) {
      if (includeInvalid) found.push({ text: matched, index, end, value: null, error: error.message });
    }
  }
  return found;
}

module.exports = {
  ERAS,
  toWareki,
  parseWareki,
  fromWareki,
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
};
