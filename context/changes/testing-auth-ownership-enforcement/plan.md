# Auth & Ownership Enforcement Tests — Implementation Plan

## Overview

Phase 2 of the test rollout closes three deferred risks:

- **Risk #3** — prove the auth guard fires on every protected route and redirects unauthenticated
  visitors without a loading-state flash.
- **Risk #4** — prove RLS rejects cross-user queries at the database level, not just at the client
  call level.
- **Risk #5** — add an ownership check to `AiScheduleService.generateAndSave()` (code change) so
  the AI proxy is never called for an unowned vehicle, then test the check.

Risk #5 is unusual: it requires a production code change before a test can be written.

## Current State Analysis

**Risk #3 — guard exists, tests do not.**
`auth.guard.ts` is correct: it `await`s `auth.initialized` (a Promise that resolves after
`getSession()` completes) before checking `isAuthenticated()`. The guard is wired once on the root
`''` route in `app.routes.ts:15`; all dashboard-area children inherit it. No `auth.guard.spec.ts`
exists. The `auth-scaffold` plan explicitly deferred all guard tests.

**Risk #4 — policies exist, real-DB tests do not.**
`supabase/migrations/20260604000000_init_schema.sql` defines all 8 RLS policies (SELECT, INSERT,
UPDATE, DELETE on both `vehicles` and `service_records`) using `user_id = auth.uid()`. Every
existing ownership assertion mocks the Supabase client — none runs against a real instance. A
dropped policy would pass all current tests silently. The `data-schema-rls` plan explicitly
deferred real-DB integration testing.

**Risk #5 — proxy call unprotected.**
`AiScheduleService.generateAndSave()` calls `fetch('/api/ai', ...)` at line 12 with no prior
ownership check. `AuthService` is not currently injected into the service. The normal UI path is
safe (RLS makes `getVehicle` return null for unowned vehicles, triggering a redirect before the
service is called), but the service itself can be called directly from any context with any
`Vehicle` object. The DB write at line 35 is protected (both RLS and an explicit
`.eq('user_id', ...)` in `updateVehicle`), but the proxy call is not — API credits are consumed
before the write is rejected.

## Desired End State

1. `src/app/core/auth/auth.guard.spec.ts` exists and passes: an unauthenticated navigation to any
   dashboard-area route redirects to `/login`; an authenticated navigation succeeds; the guard
   correctly awaits the initialization Promise.
2. `AiScheduleService.generateAndSave()` throws before calling `fetch` when the vehicle's
   `user_id` does not match the current user's ID. A unit test verifies `fetch` is never called on
   ownership failure.
3. `tests/integration/rls.spec.ts` exists and passes against a local Supabase instance: all 8
   cross-user query combinations (SELECT, INSERT, UPDATE, DELETE × `vehicles`,
   `service_records`) are rejected at the database level; own-user operations succeed.
4. `package.json` has `supabase:start`, `supabase:stop`, `supabase:reset`, and
   `test:integration` scripts.
5. `§6.2` and `§6.3` of `context/foundation/test-plan.md` are filled in with the canonical test
   patterns for guard tests and RLS integration tests.

### Key Discoveries

- `auth.guard.ts` uses `await auth.initialized` which is a Promise created in `AuthService`'s
  constructor (line 17 of `auth.service.ts`). This is a correct pattern but couples the guard to
  that Promise — the test pins this contract.
- `AiScheduleService` currently injects only `VehicleService`. Adding `AuthService` as a
  constructor dependency means all 14 existing tests in `ai-schedule.service.spec.ts` will fail
  DI unless `AuthService` is added to their `providers` in `beforeEach`.
- `Vehicle.user_id` is a non-nullable `string` on the model — the ownership comparison is a
  simple string equality check.
- The `service_records` table carries its own `user_id` column (denormalized) — its RLS policies
  are self-contained, not derived from the `vehicles` FK.
- `VehicleService.getVehicle(id)` has no client-side `user_id` filter — it relies entirely on the
  RLS SELECT policy. A dropped policy silently returns another user's vehicle with no app-layer
  fallback.
- Local Supabase instance API port: 54321. Service-role key is obtained from `supabase status`.
- `supabase/seed.sql` does not exist. Test users must be provisioned programmatically.

## What We're NOT Doing

- **Reverse guard** — authenticated user visiting `/login` is not redirected. Deferred for the
  third time; it is a UX gap, not a security risk, and not in the risk map.
- **E2e tests** — excluded per §7 of the test plan.
- **Component-level ownership check** — the service layer is the single enforcement point. The
  component's RLS-null redirect already prevents the normal UI path from reaching `generateAndSave`
  with an unowned vehicle; a second check there would duplicate logic.
- **Cloudflare Worker auth** — the worker is a trust-the-client BFF proxy by design (PRD §FR-005).
  Ownership enforcement is the SPA's responsibility.

## Implementation Approach

Three sequential phases, each independently verifiable:

1. **Phase 1** — pure test addition (no production code change). Write `auth.guard.spec.ts` using
   Angular TestBed with `provideRouter` and a fake `AuthService` stub.
2. **Phase 2** — code change first, then test. Add `AuthService` injection and the ownership guard
   to `AiScheduleService.generateAndSave()`, then extend the existing spec.
3. **Phase 3** — environment bootstrap then tests. Add npm scripts, create
   `vitest.integration.config.ts`, provision test users via the service-role key, write the RLS
   spec.

Cookbook entries (§6.2 and §6.3) are written as the final sub-step of Phase 1 and Phase 3
respectively.

## Critical Implementation Details

**AuthService injection ripples through the existing spec (Phase 2).**
`AiScheduleService` currently has one constructor argument: `VehicleService`. Adding `AuthService`
as a second argument means Angular's TestBed will fail to inject the service in all 14 existing
tests unless an `AuthService` mock is added to `beforeEach`'s `providers`. The mock must return a
`currentUser()` signal with `id: 'user-abc'` — matching `makeVehicle()`'s default `user_id` — so
every existing test continues to pass the new ownership check without modification.

**Guard test: assert URL not rendered component.**
`app.routes.ts` uses `loadComponent` (lazy-loaded) throughout. The unauthenticated test is safe
because the guard returns a `UrlTree` before `loadComponent` fires. For the authenticated test,
assert the final `router.url` rather than whether the component rendered; lazy loading in TestBed
may silently succeed or fail depending on component dependencies, but the URL is always reliable.

**Integration test: service-role client is setup-only.**
The service-role Supabase client (created with `SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS. It is
used exclusively in `beforeAll`/`afterAll` to create and clean up test users and fixtures. All
cross-user assertions must use anon/user-session clients so that RLS policies actually fire.

---

## Phase 1: Auth Guard Integration Test

### Overview

Create `src/app/core/auth/auth.guard.spec.ts` that uses Angular TestBed with `provideRouter` and a
controllable `AuthService` fake. Covers all three cases: unauthenticated redirect, authenticated
pass-through, and guard waiting for the initialization Promise. Then fill in `§6.2` of the
cookbook.

### Changes Required

#### 1. Auth guard spec file

**File**: `src/app/core/auth/auth.guard.spec.ts`

**Intent**: Verify the guard fires, redirects unauthenticated visitors to `/login`, allows
authenticated visitors through, and correctly awaits `auth.initialized` — without testing any
rendered component output.

**Contract**: Import `routes` from `app.routes.ts` and supply them to `provideRouter(routes)` so
the test verifies the guard is wired to the actual route config, not a test-only stub. Provide a
fake `AuthService` with:

- `initialized` — a `Promise<void>` whose resolution the test controls
- `isAuthenticated` — a computed signal the test controls

Three test cases:

| Case | Stub state | Navigate to | Assert |
|------|------------|-------------|--------|
| Unauthenticated | `initialized` resolved, `isAuthenticated` → false | `/dashboard` | `router.url` is `/login` |
| Authenticated | `initialized` resolved, `isAuthenticated` → true | `/dashboard` | `router.url` is `/dashboard` |
| Pre-init | `initialized` is a pending Promise, then resolves as unauthenticated | `/dashboard` | guard waits; after resolution `router.url` is `/login` |

The `auth.service.spec.ts:6–38` mock builder (`makeMockSupabase`) is a useful reference pattern
but should NOT be imported here — the guard test only needs `AuthService`, not `SupabaseService`.
Define a minimal `AuthService` fake inline in this file.

#### 2. Cookbook §6.2 update

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD — see §3 Phase 2` placeholder in §6.2 with the canonical pattern for
writing Angular router / guard integration tests in this project.

**Contract**: Document the fake `AuthService` shape, `provideRouter(routes)` setup, the
`router.navigateByUrl()` + `router.url` assertion pattern, and a note that `loadComponent` routes
are safe to use in the unauthenticated case because the guard fires before lazy loading.

### Success Criteria

#### Automated Verification

- `npm test` passes with zero failures (new spec included automatically by the test runner)
- TypeScript compiles without errors: `npm run build -- --no-emit` (or typecheck equivalent)

#### Manual Verification

- Read the spec and confirm it tests the guard via a real router config (not the guard function
  in isolation), and that the pre-init case genuinely exercises the `await auth.initialized`
  suspension.

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: App-Layer Ownership Guard + Test

### Overview

Add `AuthService` as a constructor dependency to `AiScheduleService` and insert the ownership
check before the `fetch` call. Then extend the existing spec with ownership tests, updating the
providers to keep all existing tests green.

### Changes Required

#### 1. Add AuthService dependency and ownership check

**File**: `src/app/core/ai-schedule/ai-schedule.service.ts`

**Intent**: Inject `AuthService` and guard `generateAndSave()` so it throws before making the HTTP
request when the vehicle is not owned by the current user.

**Contract**: Add `AuthService` as a constructor parameter. Before the `fetch(...)` call at line
12, add the check:

```typescript
const currentUserId = this.auth.currentUser()?.id;
if (!currentUserId || vehicle.user_id !== currentUserId) {
  throw new Error('Vehicle does not belong to the current user');
}
```

This is consistent with the data-service error contract (throw, not return an error value) and
consistent with the existing throw pattern on lines 22, 25, and 28 of the same file.

#### 2. Update existing spec — providers and new ownership tests

**File**: `src/app/core/ai-schedule/ai-schedule.service.spec.ts`

**Intent**: (a) Add `AuthService` to `beforeEach` providers so the 14 existing tests continue to
compile and pass; (b) add two new ownership test cases that confirm the guard fires before `fetch`.

**Contract**:

Add to `TestBed.configureTestingModule` providers:
```typescript
{
  provide: AuthService,
  useValue: { currentUser: signal<User | null>({ id: 'user-abc' } as User) },
}
```
The `id: 'user-abc'` matches `makeVehicle()`'s default `user_id`, so no existing test needs
modification.

Add two new tests in the existing `describe('AiScheduleService', ...)` block:

- **Ownership rejected**: call `generateAndSave(makeVehicle({ user_id: 'attacker-id' }))` with
  the default stub returning `currentUser().id === 'user-abc'`; assert the promise rejects with
  `'Vehicle does not belong to the current user'`; assert the `fetch` spy was never called.
- **Ownership accepted**: call `generateAndSave(makeVehicle({ user_id: 'user-abc' }))` with a
  valid fetch stub; assert the promise resolves (no ownership throw); the existing
  `vi.stubGlobal('fetch', ...)` pattern applies.

The `fetch` assertion for the "rejected" case requires `vi.stubGlobal('fetch', fetchSpy)` before
calling `generateAndSave`, then `expect(fetchSpy).not.toHaveBeenCalled()`.

### Success Criteria

#### Automated Verification

- `npm test` passes with zero failures (14 existing tests + 2 new ownership tests)
- TypeScript compiles without errors

#### Manual Verification

- Confirm the rejection test asserts both the throw message AND that `fetch` was not called — a
  test that only checks the throw would pass even if the check fires after the proxy call.

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: RLS Integration Tests

### Overview

Add Supabase CLI npm scripts, a standalone Vitest integration config, and
`tests/integration/rls.spec.ts` that runs all 8 cross-user query combinations against a real local
Supabase instance. Test users are provisioned via the service-role key in `beforeAll` and cleaned
up in `afterAll`. Conclude by filling in §6.3 of the cookbook.

### Changes Required

#### 1. npm scripts

**File**: `package.json`

**Intent**: Give developers a single place to start/stop the local Supabase instance and run
integration tests.

**Contract**: Add to the `"scripts"` block:

```json
"supabase:start": "supabase start",
"supabase:stop":  "supabase stop",
"supabase:reset": "supabase db reset",
"test:integration": "vitest run --config vitest.integration.config.ts"
```

#### 2. Vitest integration config

**File**: `vitest.integration.config.ts` (repo root)

**Intent**: Separate integration tests from the Angular unit/component suite so `npm test` (via
the Angular builder) does not pick up files that require a running Supabase instance.

**Contract**: Define a standalone Vitest config that:
- sets `environment: 'node'`
- includes only `tests/integration/**/*.spec.ts`
- sets `testTimeout` to at least 30000 ms (real DB operations)
- loads `.env.test.local` from the repo root for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

Do not extend or merge with the Angular builder's config.

#### 3. Developer environment file documentation

**File**: `.env.test.local` (gitignored — document in the spec file's JSDoc or a top comment)

**Intent**: Give the developer the values they need to run integration tests.

**Contract**: `.env.test.local` should contain:
```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<value from `supabase status`>
```

Add `.env.test.local` to `.gitignore` if not already covered by an existing pattern. Add a
top-of-file comment in `tests/integration/rls.spec.ts` that documents the prerequisite: run
`npm run supabase:start` and create `.env.test.local` before running `npm run test:integration`.

#### 4. RLS integration spec

**File**: `tests/integration/rls.spec.ts`

**Intent**: Prove that RLS policies actually reject cross-user queries at the database level for
all four CRUD operations on both tables, and that own-user operations succeed (positive path).

**Contract**:

`beforeAll`:
1. Create a service-role client using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
2. Create User A (`userA@test.local`) and User B (`userB@test.local`) via
   `serviceClient.auth.admin.createUser(...)` with `email_confirm: true`.
3. Obtain User A's session by signing in with the service-role client (or anon client) using the
   test credentials.
4. Insert one `vehicles` row and one `service_records` row as User A (using User A's session
   client, so `auth.uid()` is set correctly for the INSERT RLS check).
5. Store User A's session client and User B's session client for use in tests.

`afterAll`: delete the test rows and the two test users via the service-role client.

Test matrix (`describe('vehicles table')` and `describe('service_records table')` blocks):

| Test | Client | Operation | Assert |
|------|--------|-----------|--------|
| cross-user SELECT | User B session | `.select().eq('id', userARowId)` | `data.length === 0` |
| cross-user INSERT | User B session | `.insert({ user_id: userA.id, ... })` | `error` is non-null (policy violation) |
| cross-user UPDATE | User B session | `.update({...}).eq('id', userARowId)` | `data.length === 0` or `count === 0` |
| cross-user DELETE | User B session | `.delete().eq('id', userARowId)` | `data.length === 0` or `count === 0` |
| own-user SELECT | User A session | `.select().eq('id', userARowId)` | `data.length === 1` |
| own-user INSERT | User A session | `.insert({ user_id: userA.id, ... })` | `error` is null |

The `service_records` table has a FK to `vehicles.id`; the own-user INSERT test must reference a
valid `vehicle_id` from the vehicle row created in `beforeAll`.

Do NOT use the service-role client for the cross-user assertion queries — the service-role client
bypasses RLS by design and would make every test pass regardless of policy state.

#### 5. Cookbook §6.3 update

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD — see §3 Phase 2` placeholder in §6.3 with the canonical pattern for
writing Supabase RLS integration tests in this project.

**Contract**: Document the `vitest.integration.config.ts` + `.env.test.local` setup, the
service-role / user-session client distinction, the `beforeAll` provisioning pattern, the
`npm run supabase:start` + `npm run test:integration` run sequence, and a one-line note that the
service-role client must never be used for the assertion queries.

### Success Criteria

#### Automated Verification

- `npm run supabase:start` starts the local instance without error
- `npm run test:integration` passes with all cross-user queries rejected and own-user queries
  succeeding (requires a running local Supabase instance)
- `npm test` still passes and does not pick up the integration spec

#### Manual Verification

- Temporarily comment out one RLS policy in the migration (e.g., `vehicles_select`) and run
  `npm run supabase:reset && npm run test:integration` — the cross-user SELECT test for
  `vehicles` must fail. This confirms the tests would catch a real policy regression, not just
  green-light any state.
- Restore the policy and re-run to confirm green.

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation (including the policy-removal regression test) before declaring Phase
2 of the rollout complete.

---

## Testing Strategy

### Unit Tests (Phases 1 and 2)

- `src/app/core/auth/auth.guard.spec.ts` — 3 router integration cases; run via `npm test`
- `src/app/core/ai-schedule/ai-schedule.service.spec.ts` — 14 existing + 2 new ownership cases

### Integration Tests (Phase 3)

- `tests/integration/rls.spec.ts` — 12 cross-user + own-user cases; run via
  `npm run test:integration`; requires `npm run supabase:start` first

### Manual Testing

1. Start the app (`npm start`) and verify redirect: open a private/incognito window, navigate
   directly to `http://localhost:4200/dashboard` — confirm redirect to `/login`.
2. Sign in and navigate to a vehicle's schedule view — confirm normal generation flow still works
   (Phase 2 should not break it).
3. Run the policy-removal regression test documented in Phase 3's manual verification.

## Migration Notes

No database schema changes in this plan. The RLS policies already exist in
`supabase/migrations/20260604000000_init_schema.sql` — this plan adds tests that verify them, not
new migrations.

## References

- Research: `context/changes/testing-auth-ownership-enforcement/research.md`
- Auth guard: `src/app/core/auth/auth.guard.ts:5–12`
- Route wiring: `src/app/app.routes.ts:15`
- AuthService mock pattern: `src/app/core/auth/auth.service.spec.ts:12–38`
- AiScheduleService: `src/app/core/ai-schedule/ai-schedule.service.ts:11–36`
- Existing service spec: `src/app/core/ai-schedule/ai-schedule.service.spec.ts`
- RLS migration: `supabase/migrations/20260604000000_init_schema.sql:36–83`
- Supabase local config: `supabase/config.toml:5,10,29`
- Prior deferred debt: `context/archive/auth-scaffold/plan.md:270–279`,
  `context/archive/data-schema-rls/plan.md:281–289`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.
> Do not rename step titles.

### Phase 1: Auth Guard Integration Test

#### Automated

- [x] 1.1 `npm test` passes with zero failures (new auth.guard.spec.ts included) — 2b8ef67
- [x] 1.2 TypeScript compiles without errors — 2b8ef67

#### Manual

- [x] 1.3 Spec exercises the guard via real router config (not guard function in isolation) — 2b8ef67
- [x] 1.4 Pre-init test case genuinely suspends on `await auth.initialized` — 2b8ef67

### Phase 2: App-Layer Ownership Guard + Test

#### Automated

- [x] 2.1 `npm test` passes with zero failures (14 existing + 2 new ownership tests) — ced4f3e
- [x] 2.2 TypeScript compiles without errors — ced4f3e

#### Manual

- [x] 2.3 Rejection test asserts both the throw message AND that `fetch` was never called — ced4f3e
- [x] 2.4 Normal schedule generation flow works end-to-end in the running app — ced4f3e

### Phase 3: RLS Integration Tests

#### Automated

- [x] 3.1 `npm run supabase:start` completes without error
- [x] 3.2 `npm run test:integration` passes (all 12 cross-user + own-user cases green)
- [x] 3.3 `npm test` does not pick up the integration spec (still passes, no new failures)

#### Manual

- [x] 3.4 Policy-removal regression test: comment out `vehicles_select` policy, reset and rerun
      integration tests — cross-user SELECT for `vehicles` fails
- [x] 3.5 Restore policy, rerun — all tests green again
