# Family Sangam

**Every celebration this season, one family budget.**

> **Version 2.** This repository is Family Sangam rebuilt in strict TypeScript with zod and a `shared/` · `server/` · `client/` layout, after PromptWars Virtual Challenge 5 closed. The version submitted to the challenge (plain JavaScript) stays unchanged at [reply2vikas/Family-Sangam](https://github.com/reply2vikas/Family-Sangam).

A GenAI planning assistant for weddings, birthdays and community events. Most planners treat each event on its own. Real families pay for several in the same few months out of one pool of money. Family Sangam plans them together and answers five questions:

1. **Will we run short, and on which day?** A cash calendar built from your income dates and vendor payment dates finds the first day the balance goes below zero.
2. **What should we change?** Ranked fixes (pay an advance later within its usual window, skip an optional line, hold back a reserve). Must-haves are never cut.
3. **What if something changes?** Type "50 more guests, smaller budget, event 2 weeks earlier". Gemini reads it, you confirm it, and the plan is revised in place with a "what changed" summary. Ticked tasks and your own amounts are kept.
4. **Is this quote fair?** Paste a vendor's WhatsApp or email quote. Gemini pulls out the price, what is and is not included, and risks. Code compares the price with your plan and adds its own warnings (non-refundable, GST extra, overtime), then offers to put the price into your budget.
5. **What do I tell them?** Gemini drafts invitations, vendor follow-ups, "please let us pay the advance later" notes and thank-you messages in English, Hindi or Hinglish. Copy with one tap.

Live app of the submitted version: https://family-sangam-planner-new.vercel.app/

## What you get for each event

| Brief asks for                        | Where it is in the app                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Budgets                               | Budget card: every line is labelled **estimate** or **you entered**. Type over any amount and the rest re-balance. Per-guest cost is shown. |
| Timelines                             | Timeline card: tasks with due dates counted back from the event, "waiting on" links between tasks, **late** flags.                          |
| Vendor checklists                     | Vendor card: vendor type, name, status, first payment amount and date, and the usual refund window.                                         |
| Personalised ideas                    | Ideas card: Gemini ideas shaped by city, style, guests and budget, with refine chips ("Cheaper", "More traditional").                       |
| Vendor quotes                         | Quote card: paste a quote, get price, inclusions, exclusions, risks and a comparison with your plan.                                        |
| Messages in your language             | Message card: invitations and vendor notes in English, Hindi or Hinglish.                                                                   |
| Weddings, birthdays, community events | Three event types with their own budget splits, payment terms and task lists. All three can sit in one season.                              |

## Gemini features (ten)

| #   | Feature                                                    | Route            | What Gemini returns                                             | What code does with it                                                                                 |
| --- | ---------------------------------------------------------- | ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Describe your season in words                              | `/api/brief`     | Events, dates, guests, budgets, income as JSON                  | Validates it and fills the form for you to check                                                       |
| 2   | Plain-words change test                                    | `/api/change`    | Guest, budget and date change plus its assumptions              | Validates, shows it back, applies only after you confirm                                               |
| 3   | Personalised ideas with refine chips                       | `/api/ideas`     | 4 to 6 ideas with cost notes                                    | Cleans and labels them                                                                                 |
| 4   | Vendor quote reader                                        | `/api/quote`     | Price, advance, inclusions, exclusions, red flags, refund terms | Checks the price, adds its own keyword warnings, compares with the plan                                |
| 5   | Message writer in English, Hindi or Hinglish               | `/api/message`   | Subject and body                                                | Cleans it; you edit and copy                                                                           |
| 6   | Extra checklist items for the timeline                     | `/api/checklist` | Tasks with "days before" and a reason                           | Keeps only well-formed items (0 to 365 days)                                                           |
| 7   | Day-of schedule                                            | `/api/runshow`   | Time, activity, who                                             | Keeps valid 24-hour times only, sorts them                                                             |
| 8   | Where can we save?                                         | `/api/savings`   | Ideas tied to a budget line, with a rupee saving                | Rejects unknown lines and caps each saving at what the line is worth (half for must-haves)             |
| 9   | Explain my season to the family (English, Hindi, Hinglish) | `/api/explain`   | A short summary written only from facts code computed           | Checks every number in the text against those facts; if one is invented, shows the plain facts instead |
| 10  | RSVP counter from pasted WhatsApp replies                  | `/api/rsvp`      | Name, yes/no/maybe, party size per reply                        | Adds up the totals itself; one click sets the guest count                                              |

All ten use structured JSON output, run only on the server, and have a labelled fallback or a clear error. See [docs/GENAI.md](docs/GENAI.md).

## How the work is split: AI proposes, code decides

| Done by Gemini                                                            | Done by plain, tested code                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Reads free text: the season description, a change request, a pasted quote | Splits money (largest-remainder, exact to the rupee)                                         |
| Writes: ideas and messages in three languages                             | Dates, payments, the cash calendar, the shortfall day, ranked fixes                          |
| Fills in structure from messy words                                       | Validates every AI answer, compares quote prices, flags risky quote wording, applies changes |

If Gemini is down or its answer does not validate, the app says so and falls back (sample ideas, an offline change parser, an offline quote reader, an English message template) with the source labelled on screen.

## Run it

```bash
node -v                              # 22.x
npm ci
GEMINI_API_KEY=your-key npm run dev  # builds, then serves http://localhost:3000
npm run check                        # format, lint, type check, tests with coverage gates, build
```

Check that Gemini is connected: open `/api/health` on your deployment. It says whether the key is set and whether Gemini answers (it never shows the key).

No key? The app still works: "Try a sample season", the form, and the labelled offline fallbacks.

Deploy: import the repo in Vercel and set `GEMINI_API_KEY`. `vercel.json` runs the build and serves `site/`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Evaluation criteria

Full evidence, with the commands that produce it: [docs/EVALUATION.md](docs/EVALUATION.md).

| Criterion         | What was done                                                                                                                                                                                                                                         | Proof                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Code quality      | Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, no `any`), three layers (`shared/`, `server/`, `client/`) whose one-way dependencies are checked by a test, shared domain types, zod for every request body, Prettier, files under 260 lines | `tsconfig.json`, `scripts/lint.ts`, [architecture](docs/ARCHITECTURE.md) |
| Security          | Strict CSP (no inline script or style), key only on the server and sent in a header, every request body checked with zod, size and rate limits, prompt data fenced, no `innerHTML` anywhere                                                           | [docs/SECURITY.md](docs/SECURITY.md), `test/evidence.test.ts`            |
| Efficiency        | One runtime dependency (zod, server only), one minified browser module of about 40 KB, cash calendar is a single pass over at most 800 days, one AI call per action                                                                                   | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                             |
| Testing           | 826 tests: unit, table-driven, a parameter grid, seeded random seasons, every Gemini feature with a fake Gemini, screen tests with a fake DOM, and tests that check this README's claims. Coverage gate and type check in CI                          | [docs/TESTING.md](docs/TESTING.md)                                       |
| Accessibility     | Labelled controls, skip link, live regions, a table for the chart, colour contrast checked in tests, print layout, works on a phone                                                                                                                   | [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md)                           |
| Problem alignment | The brief's four outputs for three event types, plus the season-level cash view                                                                                                                                                                       | table above                                                              |

## Assumptions and limits

- Budget splits, payment terms and refund windows are **typical planning assumptions, not vendor quotes**. The app says so on screen. Confirm everything in writing with each vendor.
- Money is whole rupees. Dates are calendar dates, so time zones and daylight saving do not matter.
- The plan lives in your browser (local storage). There are no accounts and no database.
- Extra checklist items and the day-of schedule are shown as suggestions; they are not added to the timeline automatically.
- The change test edits one event at a time. The quote reader reads one quote at a time (it does not rank several vendors), and there is no day-of runbook.
- Hindi and Hinglish messages are written by Gemini and are not checked by code. Read them before sending.
- Offline fallbacks are simpler than the AI paths: the quote reader finds the largest rupee amount, and messages fall back to English.
- "Cash runs short" is computed from the income dates and amounts you enter. It is a planning aid, not financial advice.

## Layout

```
shared/   pure planning logic and domain types, used by browser and server
server/   Gemini client, request handling with zod, the ten AI features
api/      eleven Vercel routes: ten Gemini features plus /api/health
client/   the browser UI (builds elements, never HTML strings)
test/     node:test suites, run straight from the TypeScript sources
docs/     evaluation evidence, architecture, GenAI, security, accessibility, testing
```

Stack: TypeScript 5 (strict), zod 4, Google Gemini API, esbuild, Prettier, `node:test`, Vercel.

MIT licence.
