// Generated from src/index.d.ts by scripts/build-cjs.js. Do not edit by hand.
export type EraName = '明治' | '大正' | '昭和' | '平成' | '令和';
export type EraRoman = 'Meiji' | 'Taisho' | 'Showa' | 'Heisei' | 'Reiwa';
export type EraShort = 'M' | 'T' | 'S' | 'H' | 'R';

/**
 * Anywhere an era is accepted you can pass the kanji name (令和), the romaji
 * name (Reiwa, any case, macrons allowed) or the single letter (R).
 */
export type EraInput = EraName | EraRoman | EraShort | (string & {});

export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface Era {
  readonly name: EraName;
  readonly roman: EraRoman;
  readonly short: EraShort;
  /** First day of the era (Gregorian). */
  readonly start: CalendarDate;
  /** Last day of the era (Gregorian), or null for the current era. */
  readonly end: CalendarDate | null;
}

export interface WarekiDate {
  era: EraName;
  eraRoman: EraRoman;
  eraShort: EraShort;
  /** Year within the era (1 = 元年). */
  year: number;
  /** null when only a year was given. */
  month: number | null;
  /** null when no day was given. */
  day: number | null;
  /** The equivalent Gregorian year. */
  gregorianYear: number;
}

/** A `Temporal.Instant`, or anything else with `epochMilliseconds`. Read like a `Date`. */
export interface TemporalInstantLike {
  readonly epochMilliseconds: number;
}

/**
 * A Date, "YYYY-MM-DD" / "YYYY-MM" / "YYYY" string, a year number, or a year/month/day object.
 *
 * Temporal objects work too: `Temporal.PlainDate`, `PlainDateTime`, `PlainYearMonth` and
 * `ZonedDateTime` (in the ISO 8601 calendar) match the year/month/day object, and
 * `Temporal.Instant` matches `TemporalInstantLike`.
 */
export type GregorianInput =
  | Date
  | string
  | number
  | { year: number; month?: number | null; day?: number | null }
  | TemporalInstantLike;

export interface WarekiInput {
  era: EraInput;
  /** Year within the era (1 = 元年). */
  year: number;
  month?: number | null;
  day?: number | null;
}

export interface DateOptions {
  /**
   * IANA time zone used to read a `Date`, e.g. 'Asia/Tokyo'. Without it a Date is
   * read in local time. Ignored for strings, numbers and { year, month, day } objects.
   */
  timeZone?: string;
}

export interface FormatOptions extends DateOptions {
  /**
   * 'long'  -> 令和8年11月11日
   * 'short' -> R8.11.11
   * 'roman' -> Reiwa 8.11.11
   * @default 'long'
   */
  style?: 'long' | 'short' | 'roman';
  /**
   * Write 元年 instead of 1年 in the long style.
   * @default true
   */
  gannen?: boolean;
  /**
   * 'arabic' -> 令和8年11月11日
   * 'kanji'  -> 令和八年十一月十一日
   * 'daiji'  -> 令和八年拾壱月拾壱日  (壱 弐 参 拾, as used in legal and financial documents)
   * Kanji and daiji numerals only work with style 'long'.
   * @default 'arabic'
   */
  numerals?: 'arabic' | 'kanji' | 'daiji';
  /**
   * Append the day of the week. Needs a full date (year, month and day).
   * 'short' -> 令和8年11月11日(水)   R8.11.11(水)   Reiwa 8.11.11 (Wed)
   * 'long'  -> 令和8年11月11日水曜日 R8.11.11(水曜日) Reiwa 8.11.11 (Wednesday)
   * `true` is the same as 'short'.
   * @default false
   */
  weekday?: boolean | 'short' | 'long';
  /**
   * Your own layout instead of `style`, `gannen` and `weekday` (combining them throws).
   *
   *   G      R              y    8        M   11     E     水
   *   GGG    Reiwa          yy   08       MM  11     EEEE  水曜日
   *   GGGG   令和           Y    元 / 8   d   5
   *   u      2026                         dd  05
   *   uuuu   2026
   *
   * Text in 'single quotes' is copied as it is (two quotes make one '). Any other
   * character that is not an ASCII letter, such as 年 or ( or -, is copied too.
   * An ASCII letter that is not a token throws, so typos are caught.
   * `numerals` applies to the number tokens; zero-padded tokens need 'arabic'.
   *
   * @example formatWareki('2026-11-11', { pattern: 'GGGGy年M月d日(E)' }) // 令和8年11月11日(水)
   */
  pattern?: string;
}

export interface NendoOptions extends DateOptions {
  /**
   * First month of the fiscal year (1-12).
   * @default 4
   */
  startMonth?: number;
}

export interface FormatNendoOptions extends NendoOptions, Omit<FormatOptions, 'weekday' | 'pattern'> {}

/** The supported eras, oldest first. */
export const ERAS: readonly Era[];

/** Convert a Gregorian date to a wareki date. */
export function toWareki(input: GregorianInput, options?: DateOptions): WarekiDate;

/**
 * Parse text such as "令和8年11月11日", "令和八年十一月十一日", "R8.11.11" or "Reiwa 8".
 * A trailing weekday like "(水)" is accepted and must match the date.
 */
export function parseWareki(text: string): WarekiDate;

/** Convert a wareki date (text or object) to a Date at local midnight. Month and day are required. */
export function fromWareki(input: string | WarekiInput): Date;

/** Format a Gregorian date as wareki text. */
export function formatWareki(input: GregorianInput, options?: FormatOptions): string;

/** Gregorian year for an era year, e.g. toGregorianYear('平成', 1) === 1989. */
export function toGregorianYear(era: EraInput, year: number): number;

/** The era in effect for a Gregorian date. */
export function getEra(input: GregorianInput, options?: DateOptions): Era;

/** Every era that overlaps a Gregorian year, oldest first. */
export function erasInYear(year: number): WarekiDate[];

/**
 * The fiscal year (年度) a date falls in, as a wareki object with no month or day.
 * Starts in April by default. `gregorianYear` is the calendar year it starts in.
 * Uses the era in effect at the end of that year: April 2019 to March 2020 is 令和元年度.
 */
export function toNendo(input: GregorianInput, options?: NendoOptions): WarekiDate;

/** Format the fiscal year of a date, e.g. 令和8年度, R8年度 or Reiwa 8 fiscal year. */
export function formatNendo(input: GregorianInput, options?: FormatNendoOptions): string;

/** Parse fiscal year text such as "令和8年度", "R8年度" or "Reiwa 8 fiscal year". */
export function parseNendo(text: string): WarekiDate;

/** Like parseWareki(), but returns null instead of throwing. Safe to call with any value. */
export function tryParseWareki(text: unknown): WarekiDate | null;

/** True if the text is a valid wareki date. Safe to call with any value. */
export function isValidWareki(text: unknown): boolean;

export interface FoundWareki {
  /** The text that matched, exactly as written. */
  text: string;
  /** Where it starts in the searched text (a UTF-16 index, like `String.prototype.indexOf`). */
  index: number;
  /** Where it ends, exclusive. `source.slice(index, end) === text`. */
  end: number;
  /** The parsed date, or null for an impossible date when `includeInvalid` is set. */
  value: WarekiDate | null;
  /** Why the date is impossible. Only present when `value` is null. */
  error?: string;
}

export interface FindOptions {
  /**
   * Also return text that looks like a date but cannot exist, such as 平成31年5月1日,
   * with `value: null` and an `error`.
   * @default false
   */
  includeInvalid?: boolean;
  /**
   * Match single-letter eras such as R8.11.11 (capital letters, full dates only).
   * @default true
   */
  abbreviations?: boolean;
}

/**
 * Find wareki dates in a piece of text, in order. Understands 令和8年11月11日 (also 元年,
 * kanji and daiji numerals, full-width digits), Reiwa 8.11.11 and R8.11.11.
 * A year followed by 度 (a fiscal year) is skipped.
 */
export function findWareki(text: string, options?: FindOptions): FoundWareki[];
