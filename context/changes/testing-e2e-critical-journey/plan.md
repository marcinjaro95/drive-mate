# E2E Critical User Journey — Implementation Plan

## Overview

Add end-to-end Playwright test coverage for Phase 4 of the test plan: prove the sign-in → add
vehicle → AI schedule renders with source attribution path works in a real browser against the
live Worker. This is the only e2e test in the project; everything else stays at the
unit/integration ceiling.

## Current State Analysis

The project already has:

- A north-star spec at `e2e/seed.spec.ts` (untracked) with one test that follows the same
  journey but has two bugs: (1) uses `.selectOption()` on `mat-select` which fails at runtime,
  and (2) references `data-testid` attributes that don't exist in `schedule-view.html`.
- No `playwright.config.ts`.
- No `@playwright/test` in devDependencies.
- Existing `.github/workflows/ci.yml` with no e2e step.
- `playwright/.auth/` already gitignored; `.env.*.local` already gitignored.

The Cloudflare Worker (`https://drive-mate.marcinjaro95.workers.dev`) is the only deployment
target — there is no separate staging environment.

## Desired End State

A new `e2e/critical-journey.spec.ts` with two tests:

1. Unauthenticated visitor navigating to `/dashboard` is redirected to `/login`.
2. Authenticated user can sign in, add a vehicle, and see at least one AI-generated schedule
   card with non-empty source attribution.

Both tests run in Playwright (Chromium) against the live Worker URL. The `e2e` CI job runs only
on push to master and uses GitHub secrets for credentials. `seed.spec.ts` is left untouched.

### Key Discoveries

- `mat-select[formControlName="fuel_type"]` at `vehicle-add.html:78` is Angular Material —
  `.selectOption()` fails; the click-open-overlay pattern is required.
- `schedule-view.html` has no `data-testid` attributes; the spec needs `data-testid="schedule-item"`
  on `mat-card.schedule-card` (line 55) and `data-testid="schedule-item-source"` on
  `<small>Source: {{ item.source }}</small>` (line 68).
- Fuel type option display texts for mat-option: `Gasoline`, `Diesel`, `Electric`, `Hybrid`,
  `LPG` (values: `gasoline`, `diesel`, `electric`, `hybrid`, `lpg`).
- The `waitForResponse` for the AI proxy must be registered **before** clicking the submit button
  (the response arrives quickly after navigation — registering it after `click()` risks missing it).
- `tests/integration/rls.spec.ts:130–143` has the vehicle cleanup pattern the `afterEach` will mirror.

## What We're NOT Doing

- Modifying or replacing `e2e/seed.spec.ts`.
- Testing the sign-up UI flow.
- Creating a dedicated staging Worker (one environment only; deferred).
- Adding `data-testid` to form inputs (ARIA `getByRole()` is sufficient).
- Adding a fixture-response fast-path — the point of this test is the live AI proxy call.

## Implementation Approach

Three-phase delivery: Playwright infrastructure first, then HTML instrumentation and the spec,
then the CI job. The spec uses a static pre-created test user (credentials from env vars) with
no globalSetup — tests sign in manually and `afterEach` cleans up vehicles via the service role
client.

## Critical Implementation Details

**`waitForResponse` must precede the submit click.** The AI proxy call fires immediately when
the schedule-view component loads after vehicle save. Register the intercept before clicking
submit: `const aiPromise = page.waitForResponse(...)` → `page.click(submit)` → `page.waitForURL(...)` →
`await aiPromise`. Reversing the order creates a race condition where the response is missed.

**mat-select overlay is appended to `<body>`, not the form.** After clicking
`mat-select[formControlName="fuel_type"]`, the `mat-option` elements appear as a floating overlay
at the bottom of the DOM. Scope `page.locator('mat-option:has-text("Gasoline")')` to the full
page, not the form container.

---

## Phase 1: Playwright infrastructure setup

### Overview

Install Playwright, create the config, add the npm script, and document the env vars required
for local e2e runs. No spec is written in this phase.

### Changes Required

#### 1. Install @playwright/test

**File**: `package.json`

**Intent**: Add `@playwright/test` as a devDependency so Playwright tests can be authored and
run. Add a `test:e2e` script so developers have a consistent entry point.

**Contract**: Add `"@playwright/test": "^1.50.0"` to `devDependencies`; add
`"test:e2e": "playwright test"` to `scripts`. After installing, run
`npx playwright install chromium` once per environment (this is a one-time CLI step, not a
script entry).

#### 2. playwright.config.ts

**File**: `playwright.config.ts` (new, project root)

**Intent**: Define the Playwright project configuration — where tests live, which browser to
use, what base URL to target, and how long to allow each test to run.

**Contract**:

- `testDir: './e2e'`
- `timeout: 120_000` (2 min — AI generation takes 30–90 s on the free-tier model)
- `retries: 1`
- `use.baseURL`: `process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://drive-mate.marcinjaro95.workers.dev'`
- `use.trace: 'on-first-retry'`
- No `globalSetup`, no `storageState` — tests sign in themselves using static credentials
- Single project: `{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }`

#### 3. .env.e2e.local setup (documentation)

**File**: `.env.e2e.local` (developer creates locally, gitignored via `.env.*.local`)

**Intent**: Document the six env vars a developer needs to run the e2e tests locally against
the live Worker. The dedicated test account in Supabase must be created once before first use.

| Variable                    | Source                                        |
| --------------------------- | --------------------------------------------- |
| `PLAYWRIGHT_BASE_URL`       | `https://drive-mate.marcinjaro95.workers.dev` |
| `SUPABASE_URL`              | `src/environments/environment.ts`             |
| `SUPABASE_ANON_KEY`         | `src/environments/environment.ts`             |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project Settings → API               |
| `E2E_USER_EMAIL`            | Email of the dedicated test account           |
| `E2E_USER_PASSWORD`         | Password of that account                      |

### Success Criteria

#### Automated Verification

- `@playwright/test` is present in `package.json` devDependencies
- `npm run test:e2e` is defined in `package.json` scripts
- `npx playwright test --list` exits 0 (confirms config is valid even with no test files yet)
- TypeScript still passes: `npx tsc -p tsconfig.app.json --noEmit` exits 0

#### Manual Verification

- `npm run test:e2e` (with `.env.e2e.local` populated) produces a Playwright runner output, not a "config not found" error

**Implementation Note**: After completing this phase and automated verification passes, pause for
manual confirmation before proceeding to Phase 2. Phase blocks use plain bullets — the
corresponding checkboxes live in `## Progress` below.

---

## Phase 2: HTML instrumentation + spec

### Overview

Add two `data-testid` attributes to `schedule-view.html`, then write
`e2e/critical-journey.spec.ts` with the redirect test and the critical-journey test.

### Changes Required

#### 1. Add data-testid attributes to schedule-view.html

**File**: `src/app/vehicles/schedule-view/schedule-view.html`

**Intent**: Instrument the schedule card and source attribution elements with stable test
identifiers so the Playwright spec can target them without coupling to CSS class names.

**Contract**:

- Line 55: `<mat-card class="schedule-card">` → add `data-testid="schedule-item"`
- Line 68: `<small>Source: {{ item.source }}</small>` → add `data-testid="schedule-item-source"`

No other elements need instrumentation. Form fields in other templates use ARIA `getByRole()`.

#### 2. Write e2e/critical-journey.spec.ts

**File**: `e2e/critical-journey.spec.ts` (new)

**Intent**: Define two tests and shared `afterEach` cleanup. Test 1 (redirect) covers Risk #3:
unauthenticated navigation to `/dashboard` must redirect to `/login`. Test 2 (critical journey)
covers Risks #1 and #2: the full sign-in → add vehicle → AI schedule path must render at least
one schedule card with non-empty source attribution in a real browser.

**Contract**:

Imports: `{ test, expect }` from `@playwright/test`; `{ createClient }` from `@supabase/supabase-js`.

Env vars read at module top: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_USER_EMAIL`,
`E2E_USER_PASSWORD`.

`test.afterEach`: use a service-role Supabase client to find the test user by `E2E_USER_EMAIL`
and delete their vehicles — mirror the pattern at `tests/integration/rls.spec.ts:130–143`.

**Test 1 — unauthenticated redirect**:

- `page.goto('/dashboard')` then `page.waitForURL(/\/login/)` then assert `page.url()` contains `/login`

**Test 2 — critical journey**:

1. Fill `input[formControlName="email"]` and `input[formControlName="password"]` via ARIA
   `getByRole('textbox')` or `formControlName` attribute selectors; click `button[type="submit"]`; wait for URL `/dashboard`.
2. Navigate to `/dashboard/vehicles/new` (direct navigation or click the Add car link).
3. Fill make, model, year, engine_capacity using `getByRole()` ARIA selectors.
4. Open the fuel type overlay: `page.locator('mat-select[formControlName="fuel_type"]').click()` →
   `page.waitForSelector('mat-option', { state: 'visible' })` → `page.locator('mat-option:has-text("Gasoline")').click()` →
   `page.waitForSelector('mat-option', { state: 'hidden' })`.
5. Register AI intercept **before** clicking submit:
   `const aiPromise = page.waitForResponse((r) => r.url().includes('/api/ai') && r.ok())`.
6. `page.getByRole('button', { name: /save/i }).click()`.
7. `page.waitForURL(/\/dashboard\/vehicles\/.+/)`.
8. `await aiPromise`.
9. Assert `page.locator('[data-testid="schedule-item"]').first()` is visible.
10. Assert all `[data-testid="schedule-item-source"]` elements have non-empty trimmed text.

### Success Criteria

#### Automated Verification

- `npx tsc -p tsconfig.app.json --noEmit` exits 0 (data-testid additions are valid HTML attributes)
- `npm test` (Vitest) exits 0 (schedule-view component tests still pass with the HTML change)
- `npm run test:e2e` with env vars set exits 0 (both Playwright tests pass against the live Worker)

#### Manual Verification

- Local e2e run: redirect test completes in under 5 s; critical-journey test completes within 120 s
- The schedule view shows at least one card with a visible "Source: …" attribution line
- `playwright-report/index.html`: no retries triggered, both tests green

**Implementation Note**: After completing this phase, pause for manual confirmation before
proceeding to Phase 3.

---

## Phase 3: CI integration

### Overview

Extend `.github/workflows/ci.yml` with an `e2e` job that runs only on push to master, after
the existing `test` job passes. Document the six GitHub secrets that must be configured once.

### Changes Required

#### 1. Add e2e job to .github/workflows/ci.yml

**File**: `.github/workflows/ci.yml`

**Intent**: Wire the `npm run test:e2e` command into CI so every push to master verifies the
critical journey against the live Worker. The job is guarded to `push` events on `master` only —
PRs never trigger it, which keeps secrets out of fork PR logs.

**Contract**: add a new `e2e` job after the existing `test` job:

```yaml
e2e:
  if: github.event_name == 'push' && github.ref == 'refs/heads/master'
  runs-on: ubuntu-latest
  needs: test
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: npm
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npx playwright test
      env:
        PLAYWRIGHT_BASE_URL: ${{ secrets.PLAYWRIGHT_BASE_URL }}
        SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
        SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
        E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
```

#### 2. GitHub secrets (one-time setup, not a file change)

**Intent**: Document the six secrets that must be added to the repo via Settings → Secrets and
variables → Actions before the CI job can succeed.

| Secret name                 | Value                                           |
| --------------------------- | ----------------------------------------------- |
| `PLAYWRIGHT_BASE_URL`       | `https://drive-mate.marcinjaro95.workers.dev`   |
| `SUPABASE_URL`              | `https://hftjmsmkmfiasseubjpz.supabase.co`      |
| `SUPABASE_ANON_KEY`         | anon key from `src/environments/environment.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase project Settings → API            |
| `E2E_USER_EMAIL`            | email of the dedicated test account             |
| `E2E_USER_PASSWORD`         | password of the dedicated test account          |

### Success Criteria

#### Automated Verification

- `npx tsc -p tsconfig.app.json --noEmit` still exits 0 (YAML change doesn't affect TS)
- On push to master with secrets configured: `e2e` CI job appears and exits green

#### Manual Verification

- On a PR: the `e2e` job does not appear in the Actions list (if-condition works)
- On push to master: Actions log shows Playwright installing chromium, running two tests, and reporting a pass summary
- No secret values appear in the CI log output

---

## Testing Strategy

### Automated Tests

- Phase 1: `npx playwright test --list` confirms config is valid.
- Phase 2: `npm run test:e2e` runs both specs against the live Worker.
- Phase 3: the CI `e2e` job runs the same `npm run test:e2e` on every push to master.

### Manual Testing Steps

1. Populate `.env.e2e.local` with all six variables.
2. Ensure the dedicated test account exists in the Supabase production project.
3. Run `npm run test:e2e` locally.
4. Confirm test 1 (redirect) passes in under 5 s.
5. Confirm test 2 (critical journey) passes within 120 s and shows schedule cards with source attribution.
6. Open `playwright-report/index.html` — confirm zero retries.

## Migration Notes

- The dedicated e2e test account must be created once in Supabase before Phase 2 manual
  verification can pass. No database migration is needed.
- A dedicated `drive-mate-staging` Worker is the right long-term isolation path (requires:
  second `wrangler.toml` profile, updated CORS `ALLOWED_ORIGINS`, separate `OPENROUTER_API_KEY`,
  separate Supabase project). Deferred — not in scope for Phase 4.

## References

- Test plan Phase 4: `context/foundation/test-plan.md:75`
- Research: `context/changes/testing-e2e-critical-journey/research.md`
- Existing north-star spec (do not modify): `e2e/seed.spec.ts`
- RLS vehicle cleanup pattern: `tests/integration/rls.spec.ts:130–143`
- mat-select HTML: `src/app/vehicles/vehicle-add/vehicle-add.html:78–84`
- schedule-view HTML targets: `src/app/vehicles/schedule-view/schedule-view.html:55, 68`
- Current CI config: `.github/workflows/ci.yml:1–35`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.
> Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Playwright infrastructure setup

#### Automated

- [x] 1.1 `@playwright/test` present in `package.json` devDependencies — 39d6788
- [x] 1.2 `npm run test:e2e` defined in `package.json` scripts — 39d6788
- [x] 1.3 `npx playwright test --list` exits 0 — 39d6788
- [x] 1.4 `npx tsc -p tsconfig.app.json --noEmit` exits 0 — 39d6788

#### Manual

- [x] 1.5 `npm run test:e2e` (with `.env.e2e.local` populated) produces Playwright runner output — 39d6788

### Phase 2: HTML instrumentation + spec

#### Automated

- [x] 2.1 `npx tsc -p tsconfig.app.json --noEmit` exits 0 — fa8d70b
- [x] 2.2 `npm test` (Vitest) exits 0 — fa8d70b
- [x] 2.3 `npm run test:e2e` exits 0 (both tests pass against live Worker) — fd1ba64

#### Manual

- [x] 2.4 Redirect test completes in under 5 s — fa8d70b
- [x] 2.5 Critical-journey test completes within 120 s with schedule cards and source attribution visible — fd1ba64
- [x] 2.6 `playwright-report/index.html` shows zero retries — fd1ba64

### Phase 3: CI integration

#### Automated

- [x] 3.1 `npx tsc -p tsconfig.app.json --noEmit` exits 0 — 15ef4d8
- [x] 3.2 `e2e` CI job appears and exits green on push to master — 15ef4d8

#### Manual

- [x] 3.3 `e2e` job absent on PR builds — 15ef4d8
- [x] 3.4 Actions log shows Playwright passing; no secret values in log — 15ef4d8
