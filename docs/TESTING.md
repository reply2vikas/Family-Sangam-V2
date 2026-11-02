# Testing

826 tests at the time of writing, written with the built-in `node:test` runner and run directly on the TypeScript sources (Node 22 strips the types, so line numbers in coverage match the source).

```bash
npm test            # all suites
npm run coverage    # with the coverage gate: 95% lines, 90% branches, 95% functions
npm run typecheck   # the app and the tests are both type-checked in strict mode
npm run check       # format, lint, type check, coverage and build: what CI runs
```

| Suite              | Tests | What it proves                                                                                                                                                                                                                                                               |
| ------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.test.ts`   | 14    | Money splits add up exactly and stay within one rupee of the exact share; date maths across month ends and leap years; line items always equal the budget (random seasons); payments add up to lines; hand-entered amounts are kept; task late, blocked and at-risk status   |
| `fixes.test.ts`    | 8     | Only optional lines are trimmed and every fix helps; on 150 random seasons the top fix never makes things worse and never cuts a must-have; later income never lowers the worst day; bad-day scenarios never change the original; overdue payments count on day one          |
| `change.test.ts`   | 12    | Validation rejects bad dates, ranges and unknown fields; a change touches only its target event and keeps progress; the "what changed" text; the offline parser handles the example sentence                                                                                 |
| `cases.test.ts`    | 105   | Table-driven: money formatting, calendar maths, 17 plain-words change phrasings, all three event types at 8 guest counts, applied changes always give a valid season                                                                                                         |
| `grid.test.ts`     | 354   | 90 grid cases (3 event types × 6 guest counts × 5 budgets), 150 seeded random seasons, calendar round-trips across month ends and leap days, money splits                                                                                                                    |
| `api.test.ts`      | 8     | The Gemini client sends the key in a header, fails over between models, cools down rate-limited ones, and turns every failure into one error; routes enforce method, size, rate limit and the zod body check, and drop unknown fields                                        |
| `tasks.test.ts`    | 7     | Brief, change and ideas with a fake Gemini: good answers are validated and used, nonsense falls back with a label, outages are reported, user text cannot break out of the prompt fence                                                                                      |
| `writing.test.ts`  | 45    | Quote reader and message writer: 12 wording cases for code-side warnings, 8 amount formats (lakh, k, Rs, INR, ₹), price-comparison verdicts, all message kinds and languages, offline fallbacks, a wrongly shaped body rejected by zod                                       |
| `extras.test.ts`   | 61    | Checklist, day-of schedule and savings: valid and invalid times, checklist items, savings capped by code, offline fallbacks for every event type                                                                                                                             |
| `insights.test.ts` | 179   | The number check (only numbers that were given are allowed), 30 RSVP phrasings in English, Hindi and Hinglish, RSVP totals, 100 random seasons whose code-written summary passes its own number check, and an invented-number rejection                                      |
| `health.test.ts`   | 5     | `/api/health` reports a missing key, a working key, a failing key and an odd answer; never returns the key; caches for a minute                                                                                                                                              |
| `ui.test.ts`       | 11    | The element builder never turns text into markup; saved state survives corrupt or blocked storage; the fetch helper turns failures into readable errors; the RSVP helper shows no stray text and sets the guest count                                                        |
| `screens.test.ts`  | 6     | The real overview and event screens render against a fake DOM: all three event types, the short-day banner, the chart's text label and table twin; "Use this fix" hands the fix to the app; a change read by Gemini is shown back and applied only after "Apply this change" |
| `evidence.test.ts` | 11    | The documentation's claims against the files: lint rules, strict compiler flags, CI steps, layer rules, CSP, no key in browser code, zod as the only runtime dependency, docs exist, accessibility basics, colour contrast                                                   |

Shared test code lives in `test/helpers.ts` (seeded random seasons, fake Gemini replies, fake HTTP objects) and `test/fake-dom.ts` (a small fake DOM).

## How the count is made up

About 600 of the tests are one rule checked across many inputs (table-driven, grid or seeded random). That is a deliberate way to get breadth, and it is stated here rather than presented as 826 different behaviours. The table above is what each suite proves.

## Things deliberately not asserted

Some tempting properties are false, so they are not tested as rules:

- "Allocation is monotone in the total." It is not: the largest-remainder method can give a line one rupee less when the total goes up (the Alabama paradox). The suite documents this with a known example and tests only the exact sum and the within-one-rupee bound.
- "A higher budget never lowers a single payment" fails for the same reason.

## Not covered by the coverage gate

`client/app.ts` (the wiring that talks to the browser, storage and the network) and the screen files in `client/ui/` are outside the percentage gate. `screens.test.ts` and `ui.test.ts` render the main screens and helpers against a fake DOM, the type checker covers all of them, and the main flows were also checked in a real browser (desktop and phone width). This is stated openly rather than hidden by the coverage number.
