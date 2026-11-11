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

/** A Date, "YYYY-MM-DD" / "YYYY-MM" / "YYYY" string, a year number, or a year/month/day object. */
export type GregorianInput =
  | Date
  | string
  | number
  | { year: number; month?: number | null; day?: number | null };

export interface WarekiInput {
  era: EraInput;
  /** Year within the era (1 = 元年). */
  year: number;
  month?: number | null;
  day?: number | null;
}

export interface FormatOptions {
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
   * Kanji numerals only work with style 'long'.
   * @default 'arabic'
   */
  numerals?: 'arabic' | 'kanji';
  /**
   * Append the day of the week. Needs a full date (year, month and day).
   * 'short' -> 令和8年11月11日(水)   R8.11.11(水)   Reiwa 8.11.11 (Wed)
   * 'long'  -> 令和8年11月11日水曜日 R8.11.11(水曜日) Reiwa 8.11.11 (Wednesday)
   * `true` is the same as 'short'.
   * @default false
   */
  weekday?: boolean | 'short' | 'long';
}

/** The supported eras, oldest first. */
export const ERAS: readonly Era[];

/** Convert a Gregorian date to a wareki date. */
export function toWareki(input: GregorianInput): WarekiDate;

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
export function getEra(input: GregorianInput): Era;

/** Every era that overlaps a Gregorian year, oldest first. */
export function erasInYear(year: number): WarekiDate[];
