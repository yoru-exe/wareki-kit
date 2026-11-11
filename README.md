# wareki-kit

[![npm](https://img.shields.io/npm/v/wareki-kit)](https://www.npmjs.com/package/wareki-kit)
[![CI](https://github.com/yoru-exe/wareki-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/yoru-exe/wareki-kit/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Convert between Gregorian dates and Japanese era dates (和暦), such as 令和8年11月11日.

- Covers 明治 (Meiji) through 令和 (Reiwa), with exact day-level boundaries
- Parses and formats kanji, short (`R8.11.11`) and romaji (`Reiwa 8.11.11`) forms
- Handles 元年 (gannen) and full-width digits
- Zero dependencies, ESM, TypeScript types included
- Tested against the JavaScript engine's own Japanese calendar for every day from 1868-10-23 to 2100-12-31

## Install

```sh
npm install wareki-kit
```

Requires Node.js 22.12 or newer. The package is ESM and can also be loaded with `require()` on Node 22.12+.

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

## API

| Function | Description |
| --- | --- |
| `toWareki(input)` | Gregorian to wareki object. Input can be a `Date`, a `"YYYY-MM-DD"`, `"YYYY-MM"` or `"YYYY"` string, a year number, or `{ year, month?, day? }`. |
| `formatWareki(input, options?)` | Gregorian to wareki text. Options: `style` (`'long'` \| `'short'` \| `'roman'`), `gannen` (boolean, default `true`). |
| `parseWareki(text)` | Wareki text to wareki object. Accepts kanji, short and romaji forms. |
| `fromWareki(input)` | Wareki text or `{ era, year, month, day }` to a `Date` at local midnight. Month and day are required. |
| `toGregorianYear(era, year)` | `toGregorianYear('平成', 1) === 1989`. |
| `getEra(input)` | The era object in effect for a date. |
| `erasInYear(year)` | Every era that overlaps a Gregorian year. |
| `ERAS` | The era table (name, romaji, letter, start, end). |

Anywhere an era is accepted you can pass `令和`, `Reiwa` (any case, macrons allowed, so `Shōwa` works) or `R`.

### Notes

- **Time zones:** `Date` objects are read and created in local time, so the year, month and day your clock shows are what gets converted. No time-zone shifting happens.
- **Meiji start date:** Meiji 1 is counted from 1868-01-25, which is how most conversion tables do it. Dates before that are not supported. Some date libraries (including ICU) switch from 慶応 to 明治 on 1868-10-23 instead, so results for early 1868 can differ from `Intl`.
- **Calendar years only:** this package converts calendar dates. It does not handle the pre-1873 lunisolar calendar.
- **New eras:** if a new era is announced, add it to the table in `src/index.js` and close the previous one.

## Development

```sh
npm test
```

## License

[MIT](./LICENSE) © yoru-exe
