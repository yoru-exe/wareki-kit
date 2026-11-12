# Changelog

## 0.4.0 - 2026-11-12

### Added

- **CommonJS and older Node:** `require('wareki-kit')` now works everywhere, and the package runs on Node 18 and newer (it was limited to 22.12+). There is a generated `dist/index.cjs` with its own type declarations, `exports` for both `import` and `require`, and tests on Node 18, 20 and 22.
- **Custom format patterns:** `formatWareki(date, { pattern: 'GGGGy年M月d日(E)' })`. Tokens for the era (`G`, `GGG`, `GGGG`), era year (`y`, `yy`, `Y` for 元), Gregorian year (`u`, `uuuu`), month, day and weekday, plus `'quoted text'`. Unknown letters throw.
- **Daiji numerals:** `numerals: 'daiji'` gives `令和八年拾壱月拾壱日`. `parseWareki` reads daiji (and the old forms 壹 貳 參), alone or mixed with ordinary kanji.
- **Temporal input:** `Temporal.PlainDate`, `PlainDateTime`, `PlainYearMonth`, `ZonedDateTime` and `Instant` are accepted everywhere a date is. Only the ISO 8601 calendar is supported.
- **`findWareki(text)`:** finds every wareki date in a piece of text, with exact positions. Handles kanji, daiji, full-width, romaji and `R8.11.11` forms, and can report impossible dates with `includeInvalid`.
- CLI: `--pattern` / `-p`, `--daiji`, and `--find` / `-f` (also reads piped input), with `--invalid`.

### Changed

- `engines.node` is now `>=18` (it was `>=22.12`).
- Error messages shorten any input they quote, so a huge input can no longer produce a huge message.

## 0.3.0 - 2026-11-12

### Added

- `timeZone` option (an IANA name such as `Asia/Tokyo`) for `toWareki`, `getEra`, `formatWareki`, `toNendo` and `formatNendo`. It reads a `Date` in that zone instead of local time, which fixes the `new Date('YYYY-MM-DD')` surprise.
- Fiscal years (年度): `toNendo`, `formatNendo` and `parseNendo`. The year starts in April by default (`startMonth` changes that). `formatNendo('2026-04-01')` is `令和8年度`, and `令和元年度` is April 2019 to March 2020.
- `tryParseWareki` (returns `null` instead of throwing) and `isValidWareki`.
- CLI: `--nendo` / `-n` for the fiscal year, `--tz` / `-z` for the time zone, and `wareki 令和8年度` prints the fiscal year's date range.

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
