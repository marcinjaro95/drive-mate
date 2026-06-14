# E2E Critical User Journey — Plan Brief

> Full plan: `context/changes/testing-e2e-critical-journey/plan.md`
> Research: `context/changes/testing-e2e-critical-journey/research.md`

## What & Why

Add one Playwright spec that proves the critical new-user flow — sign-in → add vehicle → AI
schedule renders with source attribution — works end-to-end in a real browser against the live
Cloudflare Worker. This is Phase 4 of the test plan: the layer below (unit + integration) can't
verify the real AI proxy contract, CORS handling, or the full browser render path.

## Starting Point

The project has no `playwright.config.ts` and `@playwright/test` is not in `devDependencies`.
An untracked `e2e/seed.spec.ts` exists with a draft north-star test, but it has two bugs (a
`mat-select` interaction that fails at runtime, and `data-testid` selectors referencing
attributes that don't exist in the HTML yet). That file is left untouched; a new
`e2e/critical-journey.spec.ts` is written instead.

## Desired End State

`e2e/critical-journey.spec.ts` contains two passing tests: (1) unauthenticated navigation to
`/dashboard` redirects to `/login`, (2) an authenticated user can sign in, add a vehicle, wait
for the AI schedule to generate, and see at least one `mat-card` with a non-empty source
attribution string. The spec runs locally via `npm run test:e2e` and in CI on every push to
master via a new `e2e` GitHub Actions job.

## Key Decisions Made

| Decision               | Choice                        | Why (1 sentence)                                                                                          | Source   |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| Auth flow              | Sign-in, not sign-up          | Sign-up requires email confirmation loop; sign-in covers the same Risks #1–#3 in practice                 | Plan     |
| User provisioning      | Static dedicated test account | No globalSetup latency; aligns with existing `seed.spec.ts` approach; cleanup is per-test via `afterEach` | Plan     |
| mat-select interaction | Click-open-overlay pattern    | `.selectOption()` only works on native `<select>`; Angular Material appends overlay to `<body>`           | Research |
| data-testid scope      | schedule-item + source only   | Form fields use stable ARIA `getByRole()` selectors; only dynamic card elements need testids              | Plan     |
| AI proxy               | Live call, no stub            | The whole point of this e2e test is to verify the real Worker→OpenRouter path works                       | Plan     |
| CI trigger             | Push to master only           | PRs can't access secrets safely; fork PRs would fail or be blocked                                        | Research |
| Deployment target      | Production Worker URL         | There is no staging Worker; one environment is the current reality                                        | Research |
| seed.spec.ts           | Leave untouched               | User direction; new test goes in its own file                                                             | Plan     |

## Scope

**In scope:**

- `playwright.config.ts` (new)
- `package.json` — add `@playwright/test` + `test:e2e` script
- `e2e/critical-journey.spec.ts` (new) — two tests
- `schedule-view.html` — two `data-testid` attributes added
- `.github/workflows/ci.yml` — new `e2e` job
- Documentation of required `.env.e2e.local` vars and six GitHub secrets

**Out of scope:**

- Modifying `e2e/seed.spec.ts`
- Testing sign-up UI
- Staging Worker setup
- `data-testid` on form inputs
- Fixture/stub path for AI proxy

## Architecture / Approach

Each test starts unauthenticated (no `storageState`). Test 1 navigates to `/dashboard` and
asserts the redirect. Test 2 signs in using env-var credentials, fills the add-vehicle form
(using ARIA selectors + mat-select overlay pattern for fuel type), registers a `waitForResponse`
intercept for `/api/ai` **before** clicking submit (race condition fix), then waits for the AI
response and asserts schedule cards via `data-testid`. `afterEach` deletes the test user's
vehicles via the Supabase service-role client, mirroring `rls.spec.ts:130–143`.

## Phases at a Glance

| Phase               | What it delivers                                    | Key risk                                                     |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| 1. Playwright setup | Config, devDep, npm script, env var docs            | Config typo fails silently (`--list` catches it)             |
| 2. HTML + spec      | data-testid attrs, two-test spec, local e2e passing | mat-select overlay timing; AI free-tier quota; 120 s timeout |
| 3. CI integration   | `e2e` job on push-to-master; secrets documented     | Secrets not yet added to repo Settings block the first run   |

**Prerequisites:** Dedicated test account must be created once in Supabase production before
Phase 2 manual verification. Six GitHub secrets must be set before Phase 3 manual verification.

**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- OpenRouter `gpt-oss-120b:free` is free but has no SLA — CI e2e job will fail if the model is
  unavailable or the response exceeds 90 s.
- The production Supabase project and the production Worker are the test environment — test
  vehicles are created and deleted in prod. Cleanup failure leaves orphan rows.
- A future staging Worker would require CORS `ALLOWED_ORIGINS` update plus a separate
  `OPENROUTER_API_KEY` secret — not blocking Phase 4 but worth tracking.

## Success Criteria (Summary)

- `npm run test:e2e` exits 0 locally with both tests green
- The critical-journey test triggers a real AI call and asserts a schedule card with non-empty source attribution
- The `e2e` CI job passes on push to master and is absent on PR builds
