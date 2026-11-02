# Architecture

Family Sangam is a static front end plus a thin serverless layer, written in strict TypeScript. The browser code is bundled into one module at build time; the API routes are compiled by Vercel. The only runtime dependency is zod, used on the server.

## Layers

```
shared/   pure planning logic and domain types   (imports nothing outside shared/)
server/   Gemini client, request handling, AI features   (imports shared/)
api/      one route per file   (imports server/)
client/   the browser UI   (imports shared/, and only types from server/)
```

A test (`test/evidence.test.ts`) fails if any file breaks these rules.

## Data flow

```
form / Gemini brief  ->  normalizeSeason (validate)  ->  season
season -> buildPlan -> lines, payments and tasks
plan   -> cashCalendar -> daily balance, first negative day
season + calendar -> suggestFixes -> ranked fixes (patches to season.adjust)
text -> /api/change (Gemini or offline parser) -> validateChange -> applyChange -> describeChange
```

A **season** is a start date, money in hand, income dates and up to six events. Everything on screen is derived from it by pure functions, so the same season always gives the same screen.

## `shared/` (pure logic)

| File                                              | Job                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`                                        | The domain types every layer uses: `Season`, `CelebrationEvent`, `BudgetLine`, `Payment`, `CashCalendar`, `Fix` and more |
| `guards.ts`                                       | Narrowing helpers for untrusted JSON (`asRecord`, `asList`, `field`)                                                     |
| `money.ts`                                        | Largest-remainder split in whole rupees, Indian digit grouping                                                           |
| `dates.ts`                                        | Calendar-date maths in UTC; month ends and leap years handled                                                            |
| `templates.ts`                                    | Data for each event type: budget weights, must-haves, payment terms, tasks                                               |
| `plan.ts`                                         | Season to lines, payments and tasks; task late and blocked status                                                        |
| `cash.ts`                                         | Day-by-day balance, shortfall day, worst day                                                                             |
| `fixes.ts`                                        | Candidate fixes, each scored by re-running the calendar; ranking                                                         |
| `whatif.ts`                                       | One-click bad-day scenarios                                                                                              |
| `change.ts`                                       | Validate, apply and explain a change; offline parser                                                                     |
| `schema.ts`                                       | Validation and clean-up for a season from any source                                                                     |
| `extras.ts`, `insights.ts`                        | Checklist, schedule and savings clean-up (savings capped by code); season facts, the number check and RSVP counting      |
| `quote.ts`, `message.ts`                          | Vendor-quote clean-up, comparison and warnings; message kinds, languages and offline template                            |
| `ideas.ts`, `progress.ts`, `view.ts`, `sample.ts` | Ideas clean-up, saved progress, chart geometry, demo data                                                                |

## `server/` and `api/`

| Piece                                      | Job                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/*.ts` (11 files)                      | One route each: `brief`, `change`, `ideas`, `quote`, `message`, `checklist`, `runshow`, `savings`, `explain`, `rsvp`, `health`. Each connects a zod schema to a server function |
| `server/http.ts`                           | `route(schema, run)`: POST only, 16 KB limit, 20 requests a minute per address, zod body check, generic errors                                                                  |
| `server/requests.ts`                       | The zod schema for each request body, and the TypeScript types inferred from them                                                                                               |
| `server/gemini.ts`                         | The only file that talks to Gemini: shared prompt rules, JSON output, reply envelope checked with zod, model failover, cooldowns                                                |
| `server/tasks.ts`, `writing.ts`, `more.ts` | The ten features: build the fenced prompt, call Gemini, validate with `shared/`, fall back and label the source                                                                 |
| `server/health.ts`                         | The `/api/health` self-check (never returns the key)                                                                                                                            |

## `client/`

| File                                                                            | Job                                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `app.ts`                                                                        | Wires the page: state, undo, and the actions screens may call        |
| `ui/context.ts`                                                                 | The `Ctx` interface every screen receives                            |
| `ui/h.ts`                                                                       | Tiny DOM builder: elements and text nodes only, never HTML strings   |
| `ui/overview.ts`, `events.ts`, `ideas.ts`, `tools.ts`, `helpers.ts`, `setup.ts` | The screens                                                          |
| `ui/state.ts`, `ui/api.ts`                                                      | Saved state (re-validated on load) and calls to the app's own routes |

## Design decisions

- **AI proposes, code decides.** Gemini reads and writes language; money, dates and decisions are ordinary tested functions.
- **Integers everywhere.** Money is whole rupees and shares use the largest-remainder method, so line items always add up to the budget exactly.
- **Fixes are data.** A fix is a small patch (`shifted`, `trimmed`, `reserve`) merged into `season.adjust`. Applying, ranking and undoing are all "merge and rebuild".
- **Validate at every boundary.** zod checks request shapes; `normalizeSeason`, `validateChange` and the clean-up functions check meaning; saved state is re-validated on load.
- **Types without a runtime cost.** Only erasable TypeScript syntax is used, so Node runs the tests straight from source and the browser bundle has no type helpers.

## Performance

The cash calendar is one pass over at most 800 days. Ranking fixes re-runs it once per candidate (a few dozen). A typical season renders in a few milliseconds. Each AI feature is one model call. The browser downloads one module of about 40 KB.

## Build and deployment

`npm run build` bundles `client/app.ts` with esbuild into `site/app.js` and copies the page and styles. Vercel runs that build (`vercel.json`), serves `site/`, and compiles each `api/*.ts` route. Set `GEMINI_API_KEY` in the project settings. `vercel.json` sets the security headers and a 60-second function limit.
