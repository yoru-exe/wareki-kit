# wareki-kit

[![npm](https://img.shields.io/npm/v/wareki-kit)](https://www.npmjs.com/package/wareki-kit)
[![CI](https://github.com/yoru-exe/wareki-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/yoru-exe/wareki-kit/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Convert between Gregorian dates and Japanese era dates (和暦), such as 令和8年11月11日.

- Covers 明治 (Meiji) through 令和 (Reiwa), with exact day-level boundaries
- Parses and formats kanji, short (`R8.11.11`) and romaji (`Reiwa 8.11.11`) forms
- Kanji numerals (`令和八年十一月十一日`), daiji (`令和八年拾壱月拾壱日`), weekdays (`(水)`), 元年 (gannen) and full-width digits
- Custom format patterns such as `GGGGy年M月d日(E)`
- Finds every wareki date in a block of text, with exact positions
- Accepts `Date`, strings, and Temporal objects (`PlainDate`, `ZonedDateTime`, ...)
- Time-zone aware: read a `Date` as Tokyo time, whatever time zone the server is in
- Fiscal years (`令和8年度`) and validation helpers that never throw
- Includes a small command-line tool
- Zero dependencies, ESM, TypeScript types included
- Tested against the JavaScript engine's own Japanese calendar for every day from 1868-10-23 to 2100-12-31

## Install

```sh
npm install wareki-kit
```

Works on Node.js 18 and newer, as ESM or CommonJS:

```js
import { formatWareki } from 'wareki-kit';        // ESM
const { formatWareki } = require('wareki-kit');   // CommonJS, including Node versions that cannot require() ESM
```

TypeScript types are included for both. Node 18 and 20 have reached end-of-life, but the package is tested on them (and on 22 and 24).

## Usage

```js
import { toWareki, formatWareki, parseWareki, fromWareki } from 'wareki-kit';

formatWareki('2026-11-11');                    // '令和8年11月11日'
formatWareki('2019-05-01');                    // '令和元年5月1日'
formatWareki('2019-05-01', { gannen: false }); // '令和1年5月1日'
formatWareki('2026-11-11', { style: 'short' });// 'R8.11.11'
formatWareki('2026-11-11', { style: 'roman' });// 'Reiwa 8.11.11'
formatWareki(new Date());                      // today, e.g. '令和8年11月12日'

toWareki('1989-01-07');
// { era: '昭和', eraRoman: 'Showa', eraShort: 'S', year: 64, month: 1, day: 7, gregorianYear: 1989 }

parseWareki('平成31年4月30日');  // { era: '平成', year: 31, month: 4, day: 30, ... }
parseWareki('R8.11.11');         // works with short and romaji forms too
parseWareki('令和８年１１月１１日'); // full-width digits are fine

fromWareki('令和8年11月11日');                           // Date at local midnight
fromWareki({ era: 'H', year: 31, month: 4, day: 30 });  // Date for 2019-04-30
```

### Kanji numerals

```js
formatWareki('2026-11-11', { numerals: 'kanji' }); // '令和八年十一月十一日'
formatWareki('1989-01-07', { numerals: 'kanji' }); // '昭和六十四年一月七日'
formatWareki('2026-10-20', { numerals: 'kanji' }); // '令和八年十月二十日'

parseWareki('令和八年十一月十一日');  // 2026-11-11
parseWareki('令和二〇年');            // positional form, 2038
parseWareki('令和８年十一月11日');    // digits and kanji can be mixed
```

Kanji numerals work with the default `long` style only.

### Daiji (大字)

Legal and financial documents use daiji so that a number cannot be altered: 壱 弐 参 拾 instead of 一 二 三 十.

```js
formatWareki('2026-11-11', { numerals: 'daiji' }); // '令和八年拾壱月拾壱日'
formatWareki('2026-12-22', { numerals: 'daiji' }); // '令和八年拾弐月弐拾弐日'

parseWareki('令和八年拾壱月拾壱日');       // 2026-11-11
parseWareki('令和八年壱拾壱月壱拾壱日');   // an explicit 壱拾 for 10 is read too
parseWareki('令和八年十一月拾壱日');       // daiji and ordinary kanji can be mixed
```

Only the four characters that are easy to alter are replaced, so other digits stay as they are. The old forms 壹 貳 參 are accepted when parsing.

### Weekdays

```js
formatWareki('2026-11-11', { weekday: 'short' }); // '令和8年11月11日(水)'
formatWareki('2026-11-11', { weekday: 'long' });  // '令和8年11月11日水曜日'
formatWareki('2026-11-11', { style: 'roman', weekday: 'long' }); // 'Reiwa 8.11.11 (Wednesday)'
```

`parseWareki` also accepts a trailing weekday, and checks it against the date:

```js
parseWareki('令和8年11月11日(水)');  // ok
parseWareki('令和8年11月11日(木)');  // RangeError: ... that date is a Wednesday, not a Thursday
```

This catches typos in data that carries both a date and its weekday. A weekday needs a full date (year, month and day).

### Custom patterns

For a layout the built-in styles do not cover, pass a `pattern`:

```js
formatWareki('2026-11-11', { pattern: 'GGGGy年M月d日(E)' });  // '令和8年11月11日(水)'
formatWareki('2026-11-11', { pattern: 'Gyy.MM.dd' });          // 'R08.11.11'
formatWareki('2019-05-01', { pattern: 'GGGGY年M月d日' });      // '令和元年5月1日'
formatWareki('2026-11-11', { pattern: "GGG y 'year' (u)" });   // 'Reiwa 8 year (2026)'
formatWareki('2026-11-11', { pattern: 'GGGGY年M月d日', numerals: 'kanji' });  // '令和八年十一月十一日'
```

| Token | Meaning | Example |
| --- | --- | --- |
| `G` | era, one letter | `R` |
| `GGG` | era, romaji | `Reiwa` |
| `GGGG` | era, kanji | `令和` |
| `y` / `yy` | year in the era / two digits | `8` / `08` |
| `Y` | year in the era, `元` for the first year | `8`, or `元` |
| `u` / `uuuu` | Gregorian year | `2026` |
| `M` / `MM` | month | `5` / `05` |
| `d` / `dd` | day | `1` / `01` |
| `E` | weekday | `水` |
| `EEEE` | weekday, long | `水曜日` |

- Text in `'single quotes'` is copied as it is, and two quotes (`''`) make one apostrophe.
- Any character that is not an ASCII letter (`年`, `(`, `-`, spaces) is copied as it is.
- An ASCII letter that is not a token **throws**, so a typo such as `yyy` or `H` is caught instead of printed. Put literal letters in quotes.
- `M`, `d` and `E` throw if the date has no month or day (for example when you pass only a year).
- `numerals` (`'kanji'` or `'daiji'`) applies to the number tokens. Zero-padded tokens (`yy`, `uuuu`, `MM`, `dd`) need `'arabic'`.
- A pattern cannot be combined with `style`, `gannen` or `weekday`, since the pattern says all of that itself. `formatNendo` does not take a pattern.

The tokens are checked against the built-in styles: for every day from 1868 to 2100, `GGGGY年M月d日(E)` gives the same text as `{ weekday: 'short' }`, and so on.

### Time zones

A `Date` is an instant in time, and the calendar day it falls on depends on the time zone. By default it is read in local time. Pass `timeZone` to say which zone you mean:

```js
const instant = new Date(Date.UTC(2026, 10, 11, 20, 0, 0)); // 20:00 UTC on 11 November

formatWareki(instant, { timeZone: 'Asia/Tokyo' });            // '令和8年11月12日'  (already the 12th in Japan)
formatWareki(instant, { timeZone: 'America/Los_Angeles' });   // '令和8年11月11日'
formatWareki(new Date(), { timeZone: 'Asia/Tokyo' });         // today in Japan, wherever your server runs
```

`timeZone` takes any IANA name and works with `toWareki`, `getEra`, `formatWareki`, `toNendo` and `formatNendo`. It only affects `Date` input. Strings, numbers and `{ year, month, day }` objects are plain calendar dates and are never shifted. `fromWareki` still returns a `Date` at local midnight.

### Temporal

The [Temporal](https://tc39.es/proposal-temporal/docs/) objects work wherever a date is accepted:

```js
formatWareki(Temporal.PlainDate.from('2026-11-11'));                                  // '令和8年11月11日'
formatWareki(Temporal.PlainYearMonth.from('2026-11'));                                // '令和8年11月'
formatWareki(Temporal.ZonedDateTime.from('2026-11-12T05:00+09:00[Asia/Tokyo]'));      // '令和8年11月12日'
formatWareki(Temporal.Instant.from('2026-11-11T20:00:00Z'), { timeZone: 'Asia/Tokyo' }); // '令和8年11月12日'

formatWareki(Temporal.Now.plainDateISO('Asia/Tokyo'), { weekday: 'short' });          // today in Japan
```

`PlainDate`, `PlainDateTime`, `PlainYearMonth` and `ZonedDateTime` are read by their own year, month and day, so `timeZone` does not change them. A `ZonedDateTime` is already in a zone, and a plain date has none. A `Temporal.Instant` is read like a `Date`, in `timeZone` or local time. Only the ISO 8601 calendar is accepted: a date in another calendar throws a `TypeError`, and `.withCalendar('iso8601')` converts it first.

To go the other way, build a Temporal object from the parsed date:

```js
const w = parseWareki('令和8年11月11日');
Temporal.PlainDate.from({ year: w.gregorianYear, month: w.month, day: w.day });  // 2026-11-11
```

The package does not need Temporal to be present. This was tested against the real [`@js-temporal/polyfill`](https://github.com/js-temporal/temporal-polyfill).

### Fiscal years (年度)

Japanese fiscal years run from April to March and are named by the year they start in.

```js
import { formatNendo, toNendo, parseNendo } from 'wareki-kit';

formatNendo('2026-03-31');                      // '令和7年度'
formatNendo('2026-04-01');                      // '令和8年度'
formatNendo('2026-04-01', { style: 'short' });  // 'R8年度'
formatNendo('2026-04-01', { style: 'roman' });  // 'Reiwa 8 fiscal year'
formatNendo('2026-04-01', { numerals: 'kanji' });  // '令和八年度'
formatNendo('2026-10-01', { startMonth: 10 });  // for organisations whose year starts in October

toNendo('2026-05-01');       // { era: '令和', year: 8, gregorianYear: 2026, ... } (the year it starts in)
parseNendo('令和8年度');     // same shape; also reads 'R8年度' and 'Reiwa 8 fiscal year'
```

A fiscal year that straddles an era change uses the era in effect at the **end** of the calendar year it starts in, the same rule as year-only dates. So April 2019 to March 2020 is `令和元年度`, even though April 2019 was still 平成. (Government pages label that year `平成31年度/令和元年度`; `parseNendo('平成31年度')` is accepted and means the same year.) The older era changes in 1912 and 1926 follow the same rule, so check them against your source documents if they matter.

### Validating input without try/catch

```js
import { isValidWareki, tryParseWareki } from 'wareki-kit';

isValidWareki('令和8年11月11日');   // true
isValidWareki('平成31年5月1日');    // false (Heisei ended on 30 April 2019)
isValidWareki(undefined);           // false, never throws

tryParseWareki('R8.11.11')?.gregorianYear;  // 2026
tryParseWareki('nonsense');                 // null
```

### Finding dates in text

`findWareki` pulls every wareki date out of a paragraph:

```js
import { findWareki } from 'wareki-kit';

const text = '契約日は令和8年11月11日、有効期限は令和9年3月31日です。';
findWareki(text);
// [
//   { text: '令和8年11月11日', index: 4,  end: 14, value: { era: '令和', year: 8, month: 11, day: 11, gregorianYear: 2026, ... } },
//   { text: '令和9年3月31日',  index: 20, end: 29, value: { ... } },
// ]

text.slice(14, 20); // positions are real string positions, so you can slice or replace by them
```

Each `value` is exactly what `parseWareki` returns for that text.

What it recognises:

- Kanji dates: `令和8年11月11日`, `令和元年5月1日`, `令和８年１１月１１日`, `令和八年十一月十一日`, `令和八年拾壱月拾壱日`, and spaces inside (`令和 8 年 11 月 11 日`). A year (`令和8年`) or a year and month (`令和8年11月`) is found too, with `month` and `day` as `null`.
- Romaji: `Reiwa 8.11.11`, `Shōwa 64.1.7`, `Reiwa 8`, in any case.
- Single letters: `R8.11.11`. These are matched **only as full dates and only in capitals**, because `R8` alone could be a model number. Turn them off with `{ abbreviations: false }`.
- A year followed by `度` (`令和8年度`) is a fiscal year and is skipped, but `令和8年4月` is still found. A weekday after a date is not part of the match.

Text that looks like a date but cannot exist, such as `平成31年5月1日` or `令和8年2月30日`, is skipped. To list those too (for example to check a document), pass `{ includeInvalid: true }`: they come back with `value: null` and an `error` explaining why.

It never changes the text before searching, so positions are always right, even with emoji or `㈱` in the text. Search time grows linearly with the length of the text.

### Era boundaries

Era changes happen mid-year, and the package gets them right:

```js
formatWareki('1989-01-07'); // '昭和64年1月7日'
formatWareki('1989-01-08'); // '平成元年1月8日'
formatWareki('2019-04-30'); // '平成31年4月30日'
formatWareki('2019-05-01'); // '令和元年5月1日'
```

A year with no month or day is ambiguous when an era changes inside it. In that case the era in effect at the **end** of the year is used, which is the common convention:

```js
formatWareki(1989); // '平成元年'
formatWareki(2019); // '令和元年'

import { erasInYear } from 'wareki-kit';
erasInYear(1989).map((w) => `${w.era}${w.year}`); // ['昭和64', '平成1']
```

Impossible dates throw instead of silently guessing:

```js
parseWareki('平成31年5月1日'); // RangeError: ... is outside the Heisei era
toWareki('2025-02-29');        // RangeError: Invalid day ...
```

## Command line

```sh
npx wareki-kit                      # today
npx wareki-kit 2026-11-11           # 令和8年11月11日
npx wareki-kit 2026-11-11 --kanji   # 令和八年十一月十一日
npx wareki-kit 2026-11-11 -s short  # R8.11.11
npx wareki-kit 2026-11-11 -w long   # 令和8年11月11日水曜日
npx wareki-kit 令和8年11月11日       # 2026-11-11
npx wareki-kit R8.11.11 --json      # full result as JSON
npx wareki-kit 2026-11-11 --nendo   # 令和8年度 (fiscal year)
npx wareki-kit 令和8年度             # 2026-04-01 to 2027-03-31
npx wareki-kit --tz Asia/Tokyo      # today in Japan, wherever you are
npx wareki-kit 2026-11-11 --daiji   # 令和八年拾壱月拾壱日
npx wareki-kit 2026-11-11 -p "GGGGy年M月d日(E)"   # 令和8年11月11日(水)
npx wareki-kit --find "契約日は令和8年11月11日です"   # list every wareki date in some text
cat contract.txt | npx wareki-kit --find --invalid  # ...or in a file, including impossible dates
```

Install it globally (`npm install -g wareki-kit`) to get the shorter `wareki` command. Run `wareki --help` for all options.

## API

| Function | Description |
| --- | --- |
| `toWareki(input)` | Gregorian to wareki object. Input can be a `Date`, a `"YYYY-MM-DD"`, `"YYYY-MM"` or `"YYYY"` string, a year number, or `{ year, month?, day? }`. |
| `formatWareki(input, options?)` | Gregorian to wareki text. Options: `style` (`'long'` \| `'short'` \| `'roman'`), `gannen` (boolean, default `true`), `numerals` (`'arabic'` \| `'kanji'` \| `'daiji'`), `weekday` (`false` \| `'short'` \| `'long'`), `timeZone` (IANA name, for `Date` input), `pattern` (your own layout). |
| `parseWareki(text)` | Wareki text to wareki object. Accepts kanji, short and romaji forms, kanji numerals and a trailing weekday. |
| `fromWareki(input)` | Wareki text or `{ era, year, month, day }` to a `Date` at local midnight. Month and day are required. |
| `toGregorianYear(era, year)` | `toGregorianYear('平成', 1) === 1989`. |
| `getEra(input)` | The era object in effect for a date. |
| `erasInYear(year)` | Every era that overlaps a Gregorian year. |
| `findWareki(text, options?)` | Every wareki date in a text, in order, with `text`, `index`, `end` and the parsed `value`. Options: `includeInvalid`, `abbreviations`. |
| `toNendo(input, options?)` | The fiscal year (年度) of a date as a wareki object. Options: `startMonth` (default 4), `timeZone`. |
| `formatNendo(input, options?)` | The fiscal year as text: `令和8年度`, `R8年度`, `Reiwa 8 fiscal year`. Takes the `formatWareki` options (except `weekday`) plus `startMonth`. |
| `parseNendo(text)` | Fiscal year text to a wareki object whose `gregorianYear` is the year it starts in. |
| `tryParseWareki(text)` | Like `parseWareki`, but returns `null` instead of throwing. Accepts any value. |
| `isValidWareki(text)` | `true` if the text is a valid wareki date. Accepts any value. |
| `ERAS` | The era table (name, romaji, letter, start, end). |

Anywhere an era is accepted you can pass `令和`, `Reiwa` (any case, macrons allowed, so `Shōwa` works) or `R`.

## Gotchas

**`new Date('2026-11-11')` can give the wrong day.** JavaScript reads that string as midnight *UTC*. In a time zone behind UTC (anywhere in the Americas, for example) that moment is still November 10th locally, so you get 令和8年11月10日:

```js
// Los Angeles
formatWareki(new Date('2026-11-11')); // '令和8年11月10日'  <- surprising
formatWareki('2026-11-11');           // '令和8年11月11日'  <- pass the string directly
formatWareki(new Date(2026, 10, 11)); // '令和8年11月11日'  <- or build the Date from parts
formatWareki(new Date('2026-11-11'), { timeZone: 'UTC' }); // '令和8年11月11日'  <- or say which zone you mean
```

Unless you pass `timeZone` (see [Time zones](#time-zones)), a `Date` is read in local time: the year, month and day your clock shows.

**Year-only input uses the era at the end of the year.** `formatWareki(1989)` is `平成元年`, even though 昭和64年 covered the first week. Pass a full date, or use `erasInYear()`, when it matters.

**Meiji starts on 1868-01-25.** That is how most conversion tables count Meiji 1. Dates before it are not supported. Some date libraries (including ICU, which powers `Intl`) switch from 慶応 to 明治 on 1868-10-23 instead, so results for early 1868 can differ from `Intl`.

**Calendar dates only.** The package does not handle the pre-1873 lunisolar calendar.

**New eras:** if a new era is announced, add it to the table in `src/index.js` and close the previous one.

## Development

```sh
npm test
```

## License

[MIT](./LICENSE) © yoru-exe
