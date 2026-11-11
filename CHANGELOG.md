# Changelog

## 0.2.1 - 2026-11-12

### Fixed

- `parseWareki` took quadratic time on a long run of spaces before a `(`: about 6.5 seconds for 80,000 spaces. It is now linear, and input over 200 characters is rejected up front with a `SyntaxError`.
- Era years of 1000 or more (Gregorian 3018 onward) could be formatted but not parsed back. They now round-trip.

## 0.2.0 - 2026-11-12

### Added

- Kanji numerals: `formatWareki(date, { numerals: 'kanji' })` gives `令和八年十一月十一日`, and `parseWareki` reads traditional (`二十`, `六十四`) and positional (`二〇`) kanji numbers, alone or mixed with digits.
- Weekday: `formatWareki(date, { weekday: 'short' | 'long' })` gives `令和8年11月11日(水)` or `令和8年11月11日水曜日` (English names for the `roman` style).
- `parseWareki` accepts a trailing weekday such as `(水)`, `水曜日` or `(Wed)`, and throws if it does not match the date.
- A `wareki` command-line tool: `npx wareki-kit 2026-11-11` and `npx wareki-kit 令和8年11月11日`.
- Issue template for bug reports.

### Docs

- New "Gotchas" section in the README, including the `new Date('YYYY-MM-DD')` time-zone trap.

## 0.1.0 - 2026-11-11

First release.

- `toWareki`, `fromWareki`, `parseWareki`, `formatWareki`, `toGregorianYear`, `getEra`, `erasInYear` and the `ERAS` table
- Eras from 明治 (Meiji) to 令和 (Reiwa), with exact day-level boundaries
- Parses kanji (`令和8年11月11日`), short (`R8.11.11`) and romaji (`Reiwa 8.11.11`) forms, including `元年` and full-width digits
- TypeScript type definitions
- Zero dependencies
