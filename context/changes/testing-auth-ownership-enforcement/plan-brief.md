# Auth & Ownership Enforcement Tests — Plan Brief

> Full plan: `context/changes/testing-auth-ownership-enforcement/plan.md`
> Research: `context/changes/testing-auth-ownership-enforcement/research.md`

## What & Why

Phase 2 of the test rollout closes three deferred security risks: an unauthenticated visitor
bypassing the auth guard (Risk #3), cross-user data access via a missing or misconfigured RLS
policy (Risk #4), and the AI proxy being called for an unowned vehicle before the DB write
rejects it (Risk #5). Risk #5 requires a production code change — adding an ownership check to
`AiScheduleService.generateAndSave()` — before its test can be written.

## Starting Point

The auth guard implementation is correct and already handles the pre-initialization window. RLS
policies are correctly defined in the initial migration for both tables, all four operations. The
gaps are entirely in test coverage: no guard spec exists, all ownership assertions mock Supabase,
and `AiScheduleService` has no ownership check at all.

## Desired End State

Three things are true when this plan is done: (1) `auth.guard.spec.ts` verifies the guard fires
on every protected route and never flashes protected content; (2) `AiScheduleService.generateAndSave()`
throws before calling the AI proxy for an unowned vehicle, proven by a unit test that asserts
`fetch` was never called; (3) `tests/integration/rls.spec.ts` rejects all 8 cross-user query
combinations against a real local Supabase instance, and `npm run test:integration` is the
canonical command to run them.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| Risk #5 ownership check location | Service layer only (`AiScheduleService`) | Single enforcement point consistent with the data-service error contract; component path is already gated by RLS-null redirect | Plan |
| RLS test user provisioning | Service-role key in `beforeAll`/`afterAll` | Self-contained, no seed file drift, users cleaned up after each run | Plan |
| RLS test file location | `tests/integration/rls.spec.ts` (separate directory) | Prevents `npm test` from failing for developers without a local Supabase instance | Plan |
| Supabase CLI entry points | Add `supabase:start/stop/reset` + `test:integration` npm scripts | Documented, discoverable entry points reduce onboarding friction | Plan |
| Reverse guard (auth'd user → /login) | Deferred again | UX gap, not a security risk; not in the risk map | Plan |

## Scope

**In scope:**
- `src/app/core/auth/auth.guard.spec.ts` (new) — 3 Angular router integration test cases
- `src/app/core/ai-schedule/ai-schedule.service.ts` (modify) — add `AuthService` dep + ownership check
- `src/app/core/ai-schedule/ai-schedule.service.spec.ts` (modify) — add `AuthService` mock to providers; add 2 ownership tests
- `tests/integration/rls.spec.ts` (new) — 12 real-DB cross-user + own-user assertions
- `vitest.integration.config.ts` (new) — standalone Vitest config for integration suite
- `package.json` (modify) — 4 new npm scripts
- `context/foundation/test-plan.md` §6.2 and §6.3 (update) — fill in cookbook placeholders

**Out of scope:**
- Reverse auth guard, e2e tests, visual tests
- Cloudflare Worker auth (trust-the-client by design)
- Component-level ownership check (service layer is sufficient)

## Architecture / Approach

Phase 1 is pure test addition using Angular TestBed + `provideRouter(routes)` with a fake
`AuthService`. The guard is tested via navigation outcome (final `router.url`), not by calling the
guard function in isolation — this catches a missing `canActivate` reference in `app.routes.ts`.
Phase 2 adds `AuthService` as a constructor argument to `AiScheduleService`; all 14 existing spec
tests need an `AuthService` mock added to their `providers` (its `currentUser()` must return
`id: 'user-abc'` to match `makeVehicle()`'s default). Phase 3 uses separate service-role and
user-session Supabase clients: the service-role client is setup-only (bypasses RLS); all
assertion queries use user-session clients so policies actually fire.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Auth guard integration test | `auth.guard.spec.ts` proves guard fires and redirects correctly | Lazy-loaded routes in TestBed; mitigated by asserting `router.url`, not rendered component |
| 2. Ownership check + unit test | Service rejects unowned vehicles before proxy call; test asserts `fetch` not called | Adding `AuthService` dep breaks all 14 existing tests unless providers are updated in `beforeEach` |
| 3. RLS integration tests | `tests/integration/rls.spec.ts` validates real DB isolation | Local Supabase not running; mitigated by `npm run supabase:start` script + helpful error if unreachable |

**Prerequisites:** Supabase CLI installed globally (`supabase` in PATH); local instance started
via `npm run supabase:start` before running Phase 3; `.env.test.local` created with URL and
service-role key from `supabase status`.

**Estimated effort:** ~2–3 sessions across 3 phases (Phase 3 is the most involved due to
environment setup + 12 test cases).

## Open Risks & Assumptions

- Angular 21 TestBed handles `loadComponent` (lazy-loaded) routes in navigation tests without
  additional configuration; if not, Phase 1 will need a simplified inline route config.
- The local Supabase instance's `supabase db reset` re-applies migrations correctly and the RLS
  policies survive a reset cycle (expected but not yet verified).
- `vite`'s `loadEnv` (available as `@angular/build` is already a dep) can load `.env.test.local`
  in `vitest.integration.config.ts` without adding `dotenv` as an explicit devDependency.

## Success Criteria (Summary)

- `npm test` passes with all new guard and ownership unit tests green.
- `npm run test:integration` passes against a local Supabase instance with all cross-user queries
  rejected at the DB level.
- Temporarily dropping one RLS policy causes the corresponding integration test to fail — proving
  the tests would catch a real regression.
