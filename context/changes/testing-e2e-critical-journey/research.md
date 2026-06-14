---
date: 2026-06-14T00:00:00+02:00
researcher: Claude Sonnet 4.6
git_commit: 3b6a775b57d894f4a0dc143283206b2e5dd5a5d7
branch: master
repository: drive-mate
topic: 'E2E Playwright test for the critical new-user journey (sign-up → vehicle → AI schedule)'
tags: [research, e2e, playwright, cloudflare-workers, supabase, github-actions, testing]
status: complete
last_updated: 2026-06-14
last_updated_by: Claude Sonnet 4.6
---

# Research: E2E Playwright Test — Critical New-User Journey

**Date**: 2026-06-14  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: `3b6a775b57d894f4a0dc143283206b2e5dd5a5d7`  
**Branch**: master  
**Repository**: drive-mate (https://github.com/marcinjaro95/drive-mate)

---

## Research Question

Ground rollout Phase 4 of `context/foundation/test-plan.md`: verify the full new-user flow
(sign-up → add vehicle → AI schedule renders with visible source attribution) works end-to-end
in a real browser against a deployed environment. Specifically answer:

1. How to provision/teardown a real Supabase staging user in Playwright `beforeAll`/`afterAll`.
2. Whether Cloudflare Pages preview URLs are stable enough for CI targeting.
3. How to store secrets (`SUPABASE_SERVICE_ROLE_KEY`, `PLAYWRIGHT_BASE_URL`) in GitHub Actions
   without leaking them in PR logs.
4. Whether the AI Cloudflare Worker proxy is deployed alongside each Pages preview or is a
   shared staging endpoint.

---

## Summary

**The most important finding is architectural:** DriveMate is **not deployed on Cloudflare Pages**.
It is a Cloudflare **Worker** (with static asset binding via `workers_dev = true`). There is one
live URL — `https://drive-mate.marcinjaro95.workers.dev` — and no automatic preview deployment
system. Questions 2 and 4 from the change.md as written do not apply to the current
infrastructure. The plan must address this before writing a spec.

**Recommended target for Phase 4**: the existing production Worker URL. The test should run only
on `push` to `master` (never on PRs), which eliminates fork-security risk and keeps test-user
creation scoped to pushes the team controls. A dedicated staging Worker is the right long-term
path but is not required to ship Phase 4.

**Existing provisioning pattern is directly reusable.** `tests/integration/rls.spec.ts` already
has the Supabase Admin API user-creation, sign-in, and cleanup pattern. The Playwright
`globalSetup` can mirror it exactly, then save browser auth state to `playwright/.auth/user.json`
so individual tests start pre-authenticated.

**UI has no `data-testid` attributes.** All selectors must use Angular `formControlName`
attributes and Angular Material class names. The plan should include a sub-phase to add
`data-testid` attributes for selector stability — or commit to the `formControlName`-based
approach with a documented risk note.

**mat-select requires special Playwright handling.** The fuel-type dropdown is an Angular
Material `<mat-select>`, not a native `<select>`. Playwright must click to open the overlay,
then click the desired `mat-option`.

**The AI proxy call is real and free-tier.** Every e2e run makes a real OpenRouter API call
using the `gpt-oss-120b:free` model. The test must use a generous timeout (60 s+) for schedule
generation and must NOT assert schedule content — only that at least one `mat-card.schedule-card`
exists with a non-empty `<small>Source: …</small>` element.

---

## Detailed Findings

### 1. Deployment Architecture — NOT Cloudflare Pages

**This finding invalidates question 2 ("Cloudflare Pages preview URL determinism") as written.**

`wrangler.toml` (lines 1–13) shows a **Cloudflare Worker** deployment:

```toml
name = "drive-mate"
main = "functions/worker.ts"
compatibility_date = "2026-05-23"
workers_dev = true

[assets]
directory = "dist/drive-mate/browser"
binding = "ASSETS"
not_found_handling = "single-page-application"
```

- Deployed via `npx wrangler deploy` (not `wrangler pages deploy`).
- Live URL: `https://drive-mate.marcinjaro95.workers.dev`
- The Worker serves **both** the Angular SPA (via `ASSETS` binding) and the API endpoints
  (`/api/ai`, `/api/vin`). There is no separate AI proxy — it is all one Worker.
- No Cloudflare Pages project exists; the external research on Pages preview URL patterns
  does not apply.

**Implications for Phase 4:**

| Option                                             | Target URL                                            | Setup cost                                  | Test-data isolation                                |
| -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| A — Production Worker (recommended for now)        | `https://drive-mate.marcinjaro95.workers.dev`         | None                                        | Test user created/deleted in prod Supabase project |
| B — Separate staging Worker (`drive-mate-staging`) | `https://drive-mate-staging.marcinjaro95.workers.dev` | New wrangler deploy + secrets + CORS update | True isolation                                     |

Option A is the right call for Phase 4 because the project has one environment today. The plan
should note that Option B is the eventual target once traffic justifies it.

---

### 2. CORS Restriction in the Worker

`functions/worker.ts` (lines 1–16):

```typescript
const ALLOWED_ORIGINS = new Set([
  'https://drive-mate.marcinjaro95.workers.dev',
  'http://localhost:4200',
]);
```

The Playwright browser will make requests from `https://drive-mate.marcinjaro95.workers.dev` to
`/api/ai` — same origin, so CORS is not an issue for Option A. If a staging Worker is ever
deployed at a different subdomain, `ALLOWED_ORIGINS` must be updated.

---

### 3. Playwright Selectors — All Four Flows

No `data-testid` attributes exist anywhere in the app. All selectors below use `formControlName`
(Angular reactive forms) or Angular Material class names.

#### Sign-up (`/signup`) — `src/app/auth/signup/signup.html`

| Field          | Selector                            | Line |
| -------------- | ----------------------------------- | ---- |
| Email input    | `input[formControlName="email"]`    | 7    |
| Password input | `input[formControlName="password"]` | 12   |
| Submit button  | `button[type="submit"]`             | 15   |

Button text cycles: `'Create account'` → `'Creating account…'` (disabled while `isSubmitting()`).

#### Login (`/login`) — `src/app/auth/login/login.html`

| Field          | Selector                            | Line |
| -------------- | ----------------------------------- | ---- |
| Email input    | `input[formControlName="email"]`    | 7    |
| Password input | `input[formControlName="password"]` | 12   |
| Submit button  | `button[type="submit"]`             | 15   |

Button text: `'Sign in'` → `'Signing in…'`.

#### Add Vehicle (`/dashboard/vehicles/new`) — `src/app/vehicles/vehicle-add/vehicle-add.html`

Full-page form (not a modal).

| Field           | Selector                                   | Notes                                            |
| --------------- | ------------------------------------------ | ------------------------------------------------ |
| Make            | `input[formControlName="make"]`            | Required                                         |
| Model           | `input[formControlName="model"]`           | Required                                         |
| Year            | `input[formControlName="year"]`            | Required; number; 1900–next year                 |
| Engine capacity | `input[formControlName="engine_capacity"]` | Required; number; 0.1–20                         |
| Fuel type       | `mat-select[formControlName="fuel_type"]`  | **mat-select** — needs special handling (see §5) |
| VIN             | `input[formControlName="vin"]`             | Optional; skip in e2e                            |
| Submit          | `button[type="submit"]`                    | Text: `'Save car'`                               |

**Minimum required fields to submit:** make, model, year, engine_capacity, fuel_type.

#### Schedule View (`/dashboard/vehicles/:id`) — `src/app/vehicles/schedule-view/schedule-view.html`

| Element                 | Selector                                       | Notes                                    |
| ----------------------- | ---------------------------------------------- | ---------------------------------------- |
| Initial loading spinner | `.spinner-container` or `mat-progress-spinner` | Line 20 — hide before asserting items    |
| AI generation skeleton  | `.skeleton-card`                               | Line 26 — hide before asserting items    |
| Schedule item card      | `mat-card.schedule-card`                       | Line 54 — the positive assertion target  |
| Source attribution      | `mat-card.schedule-card small`                 | Line 68 — text shape: `"Source: <text>"` |
| Error state card        | `mat-card.error-card`                          | Line 35 — assert this is NOT present     |
| Filtered-out notice     | text `All schedule items were filtered`        | Line 42 — assert this is NOT present     |

**Playwright wait strategy:**

```typescript
// 1. Wait for initial data load to finish
await page.waitForSelector('.spinner-container', { state: 'hidden', timeout: 10_000 });
// 2. If generation triggers, wait for skeleton to disappear (AI call can take 30–60 s)
await page.waitForSelector('.skeleton-card', { state: 'hidden', timeout: 90_000 });
// 3. Assert at least one schedule card exists
await expect(page.locator('mat-card.schedule-card').first()).toBeVisible();
// 4. Assert source attribution is non-empty
const source = page.locator('mat-card.schedule-card small').first();
await expect(source).toHaveText(/^Source: .+$/);
```

---

### 4. Supabase User Provisioning Pattern

The existing pattern in `tests/integration/rls.spec.ts` is directly reusable. Key lines:

```typescript
// rls.spec.ts:37–39 — service-role client for admin ops
serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// rls.spec.ts:42–47 — clean up leftover test users first
const { data: existing } = await serviceClient.auth.admin.listUsers();
for (const u of existing?.users ?? []) {
  if (u.email === USER_A_EMAIL) await serviceClient.auth.admin.deleteUser(u.id);
}

// rls.spec.ts:50–56 — create user with confirmed email
const { data: aData } = await serviceClient.auth.admin.createUser({
  email: USER_A_EMAIL,
  password: TEST_PASSWORD,
  email_confirm: true,
});
```

**For Playwright, the recommended approach is `globalSetup` + `storageState`:**

1. `globalSetup.ts` — create the test user via Admin API, then drive a headless browser through
   the sign-up form (or call Supabase `signInWithPassword` directly and inject the session).
   Save browser state: `await page.context().storageState({ path: 'playwright/.auth/user.json' })`.
2. `playwright.config.ts` — set `use.storageState: 'playwright/.auth/user.json'` so all test
   workers start pre-authenticated.
3. `globalTeardown.ts` — delete the test user via Admin API.

This avoids signing in on every test and keeps the critical-path spec focused on the user
journey (add vehicle → schedule), not on auth mechanics.

**Env vars** — mirror the existing integration test pattern:

| Variable                    | Source in CI                              | Source locally                                |
| --------------------------- | ----------------------------------------- | --------------------------------------------- |
| `SUPABASE_URL`              | GitHub secret `SUPABASE_URL`              | `.env.test.local`                             |
| `SUPABASE_ANON_KEY`         | GitHub secret `SUPABASE_ANON_KEY`         | `.env.test.local`                             |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub secret `SUPABASE_SERVICE_ROLE_KEY` | `.env.test.local`                             |
| `PLAYWRIGHT_BASE_URL`       | GitHub secret / hardcoded staging URL     | `https://drive-mate.marcinjaro95.workers.dev` |

The `.env.test.local` file already exists with local Supabase values. A separate
`.env.e2e.local` (gitignored) should hold the production Supabase keys for local e2e runs.

---

### 5. mat-select Interaction in Playwright

`mat-select` is an Angular Material overlay component, not a native `<select>`. Playwright
interaction pattern:

```typescript
// Click to open the overlay
await page.click('mat-select[formControlName="fuel_type"]');
// Wait for the option panel to appear in the DOM (it's appended to body)
await page.waitForSelector('mat-option', { state: 'visible' });
// Click the desired option
await page.click('mat-option:has-text("Gasoline")');
// Wait for panel to close
await page.waitForSelector('mat-option', { state: 'hidden' });
```

This is the standard pattern for Angular Material selects with Playwright.

---

### 6. GitHub Actions CI — Current State and Required Additions

**Current CI** (`.github/workflows/ci.yml`, lines 1–35):

- Trigger: `push` and `pull_request` to `master`
- Steps: checkout → Node 22 → `npm ci` → prettier → tsc → `npm test`
- **No secrets. No deploy step. No e2e step.**

**Required additions for Phase 4:**

```yaml
# New job: e2e (runs only on push to master, not PRs)
e2e:
  if: github.event_name == 'push' && github.ref == 'refs/heads/master'
  runs-on: ubuntu-latest
  needs: test
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npx playwright test
      env:
        PLAYWRIGHT_BASE_URL: ${{ secrets.PLAYWRIGHT_BASE_URL }}
        SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
        SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

**GitHub secrets to add** (via repo Settings → Secrets → Actions):

| Secret name                 | Value                                                      |
| --------------------------- | ---------------------------------------------------------- |
| `PLAYWRIGHT_BASE_URL`       | `https://drive-mate.marcinjaro95.workers.dev`              |
| `SUPABASE_URL`              | `https://hftjmsmkmfiasseubjpz.supabase.co`                 |
| `SUPABASE_ANON_KEY`         | the publishable key from `src/environments/environment.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase project Settings → API                       |

**Security model**: `push`-only trigger means no fork can trigger this job. Secrets are
automatically masked in logs. The `SUPABASE_SERVICE_ROLE_KEY` never appears in PR review logs
because the job does not run on `pull_request`.

---

### 7. Playwright Config (Remote URL, No Local Server)

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  testDir: './tests/e2e',
  timeout: 120_000, // 2 min per test — AI generation can take 60+ s
  retries: 1,
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://drive-mate.marcinjaro95.workers.dev',
    storageState: 'playwright/.auth/user.json',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

Current stable `@playwright/test` version: **v1.50.x** (mid-2026). Pin it in `devDependencies`
to avoid unexpected test framework changes.

The `playwright/.auth/` directory is already gitignored (confirmed in `.gitignore` lines 54–56).

---

### 8. Existing Test Infrastructure

**vitest.integration.config.ts** — node environment, 30 s timeout, `tests/integration/**/*.spec.ts`
glob, env loaded via Vite `loadEnv('test', cwd, '')`.

**tests/integration/rls.spec.ts** — fully implemented (246 lines); two-user RLS isolation test.
No helper utilities — everything is inline.

**tests/integration/seed.spec.ts** — file is untracked but exists per `git status`. Content not
confirmed; likely a seed fixture experiment.

**No existing Playwright config, no `tests/e2e/` directory.** Everything must be created from
scratch in Phase 4.

---

### 9. Risk Response Verification Against Test Plan §2

| Risk                            | Test plan claim                                                      | Research verdict                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 AI schedule resilience       | E2e catches live proxy contract, network errors, full browser render | **Confirmed.** The Worker's `/api/ai` handler calls real OpenRouter. E2e hitting the deployed Worker will use `gpt-oss-120b:free` (free tier).                        |
| #2 Source attribution guardrail | Assert in DOM, not service layer                                     | **Confirmed.** `<small>Source: {{ item.source }}</small>` at line 68 of `schedule-view.html`. The filter-out notice at line 42 provides a ready-made error assertion. |
| #3 Unauthenticated redirect     | Deployed environment, not TestBed                                    | **Confirmed.** Playwright navigating to `/dashboard` unauthenticated should redirect to `/login`. This is simple to assert without auth state.                        |

---

## Code References

- `wrangler.toml:1–13` — Worker deployment config (NOT Pages)
- `functions/worker.ts:1–16` — CORS `ALLOWED_ORIGINS` set
- `functions/worker.ts:190–226` — AI proxy handler (`/api/ai`)
- `src/app/auth/signup/signup.html:4–15` — sign-up form selectors
- `src/app/auth/login/login.html:4–15` — login form selectors
- `src/app/vehicles/vehicle-add/vehicle-add.html:5–110` — add-vehicle form
- `src/app/vehicles/schedule-view/schedule-view.html:20–68` — loading states + schedule cards + source attribution
- `src/environments/environment.ts:1–5` — Supabase URL and anon key (same for prod)
- `tests/integration/rls.spec.ts:37–56, 68–80, 130–143` — Supabase Admin API provisioning pattern
- `vitest.integration.config.ts:1–14` — integration test config
- `.github/workflows/ci.yml:1–35` — current CI (no deploy, no e2e)
- `.gitignore:49–56` — confirms `.env.*.local` and `playwright/.auth/` are excluded

---

## Architecture Insights

1. **One artifact, two roles.** The Cloudflare Worker is simultaneously the Angular SPA host
   and the AI/VIN proxy. There is no seam to intercept at the "staging API" vs "staging app"
   level — they are the same deploy unit.

2. **Supabase is shared.** Both dev (`environment.ts`) and prod (`environment.prod.ts`) point at
   the same Supabase project. The e2e test user will be created and immediately deleted from the
   production Supabase project. This is acceptable given Admin API cleanup, but the plan must
   note it.

3. **mat-select needs overlay handling.** Angular Material overlays are appended to `<body>`,
   not to the form's DOM subtree. All mat-select interactions need the click-wait-click pattern.

4. **No `data-testid` attributes exist.** The spec can use `formControlName` selectors for form
   inputs (stable while the reactive form model exists) but should add `data-testid` to dynamic
   elements like `mat-card.schedule-card` and the source `<small>` for maintainability.

---

## Historical Context

- `context/changes/testing-ai-schedule-hardening/` — Phase 1: unit + component tests for AI
  schedule resilience; established `make*` helper pattern in `ai-schedule.service.spec.ts`.
- `context/changes/testing-auth-ownership-enforcement/` — Phase 2: guard integration tests and
  Supabase RLS integration tests (the `rls.spec.ts` pattern this phase will mirror).
- `context/changes/testing-ci-test-gate/` — Phase 3: wired `npm test` to CI; established the
  current `.github/workflows/ci.yml` structure that Phase 4 will extend.
- `context/foundation/test-plan.md` §6.3 — Supabase provisioning cookbook that documents the
  exact Admin API pattern already in `rls.spec.ts`.

---

## Open Questions

1. **Staging vs production Worker**: Phase 4 is scoped to the existing production Worker URL.
   The plan should flag that a dedicated `drive-mate-staging` Worker is the right long-term
   separation, and note what would need to change (CORS update, second Wrangler deploy, separate
   `OPENROUTER_API_KEY` secret). Should the plan include a sub-phase for this, or defer it?

2. **data-testid sub-phase**: Should the plan add a sub-phase to add `data-testid` attributes to
   `schedule-view.html` (and optionally the form components) before writing the Playwright spec?
   This makes selectors more stable but adds an Angular change to the scope.

3. **AI proxy real-call cost**: The `gpt-oss-120b:free` model is free on OpenRouter, but every
   CI run will make a live network call. This adds 30–90 s to the `e2e` CI job and creates a
   dependency on OpenRouter availability. Should the plan include a fast-path that detects the
   test environment and uses a fixed fixture response, or is real-call verification the whole
   point?

4. **`seed.spec.ts` status**: `tests/integration/seed.spec.ts` is untracked in git. If it
   contains seed fixtures needed for the e2e test (e.g., a pre-seeded vehicle), the plan should
   account for it. Content should be verified before planning.
