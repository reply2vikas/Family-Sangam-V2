# Evaluation evidence

This page maps the six evaluation criteria to evidence in the repository. Every number here comes from running the commands below on the current `main` branch; nothing is estimated.

```bash
npm ci
npm run check   # format check, lint, type check (app and tests), tests with coverage gates, build
```

| Check                  | Result                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run typecheck`    | 0 errors, strict TypeScript for the app (`tsconfig.json`) and the tests (`test/tsconfig.json`) |
| `npm run lint`         | 0 problems                                                                                     |
| `npm run format:check` | every file matches Prettier                                                                    |
| `npm run coverage`     | 826 tests pass; lines 99.8%, branches 96.8%, functions 98.1% (gates: 95 / 90 / 95)             |
| `npm run build`        | one minified browser module, about 40 KB, plus the page and styles                             |

## 1. Code quality

- **Strict TypeScript everywhere.** `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` and `erasableSyntaxOnly` are on (`tsconfig.json`). The linter forbids `any` and compiler suppressions (`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`) in app code (`scripts/lint.ts`).
- **Three layers with one-way dependencies**, checked by a test (`test/evidence.test.ts`, "layers only depend downward"):
  - `shared/`: pure planning logic and domain types. Imports nothing outside `shared/`.
  - `server/`: the Gemini client, request handling with zod, and the ten AI features. Never imports client code.
  - `client/`: the browser UI. Imports only types from `server/`, so request and response shapes stay in step.
  - `api/`: eleven one-line route files that connect a zod schema to a server function.
- **Shared types, one source of truth.** `shared/types.ts` defines `Season`, `CelebrationEvent`, `BudgetLine`, `Payment`, `CashCalendar`, `Fix` and more; the browser and the server compile against the same definitions.
- **Small files, small functions.** No app file is longer than 260 lines (lint rule). Repeated pieces (prompt rules, the Gemini call, schema helpers, test fakes) live in one place: `server/gemini.ts`, `shared/guards.ts`, `test/helpers.ts`, `test/fake-dom.ts`.
- **Consistent formatting.** Prettier, checked in CI.
- **History.** Changes are committed with conventional messages (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `ci:`).

## 2. Security

| Risk                    | What is done                                                                                                                                                    | Where                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| API key leak            | Read only on the server from `process.env`, sent in the `x-goog-api-key` header, never in a URL or in browser code. A test scans `client/` for it.              | `server/gemini.ts`, `test/evidence.test.ts` |
| Script injection        | No `innerHTML`, `eval` or HTML parsing. The DOM is built from elements and text nodes. Lint and tests enforce it.                                               | `client/ui/h.ts`, `scripts/lint.ts`         |
| Content-Security-Policy | `default-src 'self'`, no `unsafe-inline`, no `unsafe-eval`, `object-src 'none'`, `frame-ancestors 'none'`, plus HSTS, `nosniff`, `no-referrer`.                 | `vercel.json`                               |
| Malformed requests      | Every route checks its body with a zod schema before any code runs; unknown fields are dropped.                                                                 | `server/requests.ts`, `server/http.ts`      |
| Prompt injection        | User text sits inside `<data>` tags with angle brackets removed; AI output is validated by code and only fills a form or proposes a change the person confirms. | `server/gemini.ts`, `shared/schema.ts`      |
| Abuse                   | POST only, 16 KB body limit, 20 requests per minute per address, 60-second function limit.                                                                      | `server/http.ts`                            |
| Error leaks             | Unexpected errors return a generic message.                                                                                                                     | `server/http.ts`                            |

Known limit: the rate limiter is per server instance. See [SECURITY.md](SECURITY.md).

## 3. Efficiency

- One runtime dependency (zod, on the server only). The browser bundle is a single minified module of about 40 KB with no framework.
- The cash calendar is one pass over at most 800 days; ranking fixes re-runs it once per candidate (a few dozen).
- One Gemini call per user action, with a 25-second timeout, model failover and a 60-second cooldown for a rate-limited model.
- `/api/health` caches its result for a minute, so it cannot be used to run up usage.

## 4. Testing

826 tests with `node:test`, run directly on the TypeScript sources (Node strips the types). See [TESTING.md](TESTING.md) for what each suite proves. Highlights:

- Property tests over seeded random seasons: allocations add up exactly, later income never lowers the worst day, the top fix never makes things worse and never cuts a must-have.
- Every Gemini feature tested with a fake Gemini: good answers, nonsense answers, outages, and prompt-fence escapes.
- Screen tests render the real overview and event cards with a fake DOM, including "nothing is applied until the person confirms".
- Evidence tests check this documentation's claims against the code (CSP, no key in browser code, strict compiler flags, CI steps, layer rules, colour contrast).

## 5. Accessibility

Native controls with labels, a skip link, `aria-live` status messages, a data table behind the chart, visible focus, reduced-motion support, print layout and a phone layout without sideways scrolling. Colour pairs are checked at 4.5:1 or better by a test. See [ACCESSIBILITY.md](ACCESSIBILITY.md).

## 6. Problem statement alignment

| The brief asks for                    | In Family Sangam                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Weddings, birthdays, community events | Three event types with their own budget splits, payment terms and tasks; all three can share one season                                                      |
| Budgets                               | Per-event budget with every line labelled "estimate" or "you entered", plus one cash calendar for the whole season with the first short day and ranked fixes |
| Timelines                             | Tasks counted back from each event, with "waiting on" links and "late" flags                                                                                 |
| Vendor checklists                     | Vendor type, name, status, first payment and refund window; a quote reader that compares a pasted quote with the plan                                        |
| Personalised ideas                    | Gemini ideas shaped by city, style, guests and budget, refined with one tap                                                                                  |
| GenAI                                 | Ten Gemini features with structured JSON output and code validation. See [GENAI.md](GENAI.md)                                                                |

## Issues found and fixed

| Found                                                              | Fix                                                                             | Proof                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------ |
| RSVP result could show the word "false" when no guest had said yes | Empty children are skipped; the button appears only when there is a count       | `test/ui.test.ts`                          |
| Hindi family summary used the past tense for future events         | The prompt states that all events are in the future                             | `test/insights.test.ts`                    |
| Offline vendor message greeted "Hello your team"                   | Greets by name, or "Hello," when there is no name                               | `test/writing.test.ts`                     |
| A failed Gemini call left nothing in the hosting logs              | The reason is logged (never the key or user text), and `/api/health` reports it | `test/api.test.ts`, `test/health.test.ts`  |
| The health check called newer Google key formats "not valid"       | It now checks only that the key has a plausible length and characters           | `test/health.test.ts`                      |
| A request body of the wrong shape reached route code               | zod checks every body first and returns a clear 400                             | `test/api.test.ts`, `test/writing.test.ts` |
