---
date: 2026-06-13T00:00:00+02:00
researcher: Marcin Jarosz
git_commit: 14f7c420630a272fc66030de5fbd3112173b075d
branch: master
repository: drive-mate
topic: 'Auth guard coverage, RLS enforcement at DB level, and app-layer ownership before AI proxy call (Phase 2 rollout)'
tags: [research, auth, rls, supabase, angular-router, ai-schedule, ownership, testing]
status: complete
last_updated: 2026-06-13
last_updated_by: Marcin Jarosz
---

# Research: Auth & Ownership Enforcement (Phase 2)

**Date**: 2026-06-13  
**Researcher**: Marcin Jarosz  
**Git Commit**: 14f7c420630a272fc66030de5fbd3112173b075d  
**Branch**: master  
**Repository**: drive-mate

---

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md`:

- **Risk #3** — Unauthenticated visitor accesses a protected route; auth guard absent or fails silently.
- **Risk #4** — RLS policies do not enforce per-user row ownership at the database.
- **Risk #5** — Schedule regeneration triggered for a vehicle the current user does not own; AI proxy called before the app-layer ownership check fires.

For each risk: locate the real failure path in code, verify or correct the response guidance from the test plan, identify existing tests, and name the cheapest useful test layer.

---

## Summary

**Risk #3** — The guard implementation is correct: `auth.guard.ts` awaits `auth.initialized` (a Promise) before checking `isAuthenticated()`, so there is no loading-state flash. The guard is applied to the root `/` route and all protected children inherit it. The gap is purely in test coverage: **`auth.guard.spec.ts` does not exist.** No test verifies the guard is wired, fires on unauthenticated navigation, or handles the pre-init state correctly.

**Risk #4** — All four CRUD operations (SELECT, INSERT, UPDATE, DELETE) have explicit RLS policies on both `vehicles` and `service_records` in the initial migration. Policy expressions use `user_id = auth.uid()`. The schema is correct. The gap is verification: **every existing ownership test mocks Supabase**; none runs against a real instance where a misconfigured policy would actually fail.

**Risk #5** — **The ownership check before the AI proxy call is missing.** `AiScheduleService.generateAndSave()` calls `fetch('/api/ai', ...)` at line 12 with no prior ownership verification. The Cloudflare Worker at `functions/worker.ts` has no auth either. The normal UI path is protected (RLS makes `getVehicle` return null for unowned vehicles, triggering a redirect), but the service itself has no guard — a direct service call triggers the proxy for any vehicle object regardless of ownership. The DB write is protected (both RLS and an explicit `.eq('user_id', ...)` in `updateVehicle`), but the proxy call is not. **Phase 2 must add the ownership check to the service and then test it.**

### Post-Research Backport Check

No corrections to `test-plan.md §2` Source column or risk wording are warranted:

- Risk #3's "must challenge" assumption (guard might not handle loading state) is disproved by the code — but the risk remains valid because it is completely untested. Test-plan wording is fine.
- Risk #4's migration-level evidence is confirmed.
- Risk #5's "ownership check missing" conclusion is confirmed; the risk response guidance ("verify ownership check exists before AI proxy call") correctly implies it may need to be created. The plan phase should include both adding the check and testing it.

---

## Detailed Findings

### Risk #3 — Auth Guard

#### Guard implementation

**File**: `src/app/core/auth/auth.guard.ts:1–12`

```
CanActivateFn — functional guard (Angular 14+ style)

Line 6:  inject(AuthService)
Line 7:  inject(Router)
Line 9:  await auth.initialized          ← blocks until Supabase getSession() resolves
Line 11: auth.isAuthenticated()
         └─ true  → return true
         └─ false → return router.createUrlTree(['/login'])
```

The guard correctly handles the pre-initialization window. `auth.initialized` is a Promise created in the `AuthService` constructor (line 17 of `auth.service.ts`) that resolves after `getSession()` completes and the `_isLoading` signal is set to `false` (line 24–25 of `auth.service.ts`). There is no flash risk in the current implementation.

#### AuthService state surface

**File**: `src/app/core/auth/auth.service.ts`

| Property          | Type                   | Line | Notes                         |
| ----------------- | ---------------------- | ---- | ----------------------------- |
| `currentUser`     | `Signal<User \| null>` | 10   | readonly                      |
| `isAuthenticated` | `Computed<boolean>`    | 11   | `currentUser !== null`        |
| `isLoading`       | `Signal<boolean>`      | 12   | `true` until init resolves    |
| `initialized`     | `Promise<void>`        | 14   | resolves after `getSession()` |

**Error contract (from `lessons.md`)**: `signIn`/`signUp` return `AuthError | null`; they do **not** throw. Data services throw on error. The guard test must not mix these patterns.

**Methods**: `signIn(email, password): Promise<AuthError | null>` (line 33), `signUp(email, password): Promise<AuthError | null>` (line 38), `signOut(): Promise<void>` (line 43).

#### Route wiring

**File**: `src/app/app.routes.ts`

| Route                   | Component               | Guard                 |
| ----------------------- | ----------------------- | --------------------- |
| `/login`                | `LoginComponent`        | none (public)         |
| `/signup`               | `SignupComponent`       | none (public)         |
| `/` (root)              | —                       | `authGuard` (line 15) |
| `/dashboard`            | `DashboardComponent`    | inherited             |
| `/` (empty, under root) | `VehicleListComponent`  | inherited             |
| `/vehicles/new`         | `VehicleAddComponent`   | inherited             |
| `/vehicles/:id`         | `ScheduleViewComponent` | inherited             |

No unprotected routes detected for protected content. All dashboard-area routes inherit from the root `/` parent. The guard is applied once (line 15) and covers all children.

#### Gap

No `auth.guard.spec.ts` exists. `auth.service.spec.ts` exists (lines 41–191) and covers service signal transitions, but never tests the guard itself or verifies it is wired to routes.

The `auth-scaffold` plan (`context/changes/auth-scaffold/plan.md:270–279`) explicitly deferred all integration and e2e auth tests: "no integration or e2e tests for auth UI — unit tests cover AuthService only."

#### Cheapest test layer

Angular TestBed with `provideRouter([routes])` + a fake `AuthService` stub. No browser or real Supabase needed. The test should:

1. Navigate to a protected route with an unauthenticated stub → assert redirect to `/login`.
2. Navigate to a protected route with an authenticated stub → assert navigation succeeds.
3. Navigate with a stub whose `initialized` Promise is pending → assert guard waits, then resolves correctly.
4. Test the root route to implicitly cover all children (they all share the same guard via inheritance).

**Anti-pattern to avoid**: testing the guard function in isolation (calling it directly with mocked arguments) without wiring it to an actual router config. That would not catch a removed `canActivate` reference in `app.routes.ts`.

---

### Risk #4 — RLS Enforcement

#### Migration file

**File**: `supabase/migrations/20260604000000_init_schema.sql`

```
Line 36:  ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
Lines 38–48: Four policies on vehicles:
  vehicles_select  — FOR SELECT USING (user_id = auth.uid())
  vehicles_insert  — FOR INSERT WITH CHECK (user_id = auth.uid())
  vehicles_update  — FOR UPDATE USING (user_id = auth.uid())
                               WITH CHECK (user_id = auth.uid())
  vehicles_delete  — FOR DELETE USING (user_id = auth.uid())

Line 71:  ALTER TABLE service_records ENABLE ROW LEVEL SECURITY;
Lines 73–83: Four policies on service_records (same pattern):
  service_records_select / _insert / _update / _delete
```

**Policy matrix**:

| Table             | SELECT                   | INSERT                   | UPDATE                   | DELETE                   |
| ----------------- | ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| `vehicles`        | `vehicles_select`        | `vehicles_insert`        | `vehicles_update`        | `vehicles_delete`        |
| `service_records` | `service_records_select` | `service_records_insert` | `service_records_update` | `service_records_delete` |

No missing policies. All four operations are covered on both tables. `service_records` carries its own `user_id` column (denormalized, not derived via `vehicle_id` FK), so its RLS policies are self-contained — no JOIN to `vehicles` needed.

#### Existing mock tests (insufficient for Risk #4)

| File                                                          | Lines   | What it asserts                                                             |
| ------------------------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| `src/app/core/vehicles/vehicle.service.spec.ts`               | 60–77   | `user_id` stamped from `AuthService` on create — client-side call assertion |
| `src/app/core/service-records/service-record.service.spec.ts` | 59–75   | same pattern for service records                                            |
| `src/app/core/service-records/service-record.service.spec.ts` | 145–153 | `.eq('user_id', ...)` called on read — client-side call assertion           |

These confirm the client sends the right query. They do **not** confirm the database rejects a cross-user query. A dropped or misconfigured RLS policy passes every one of these tests.

#### Local Supabase environment

**File**: `supabase/config.toml`

- Project ID: `drive-mate` (line 5)
- API port: 54321 (line 10)
- DB port: 54322 (line 29)
- Seed file: `./seed.sql` (line 65)
- Auth site URL: `http://127.0.0.1:3000` (line 154)

No Supabase CLI npm scripts exist in `package.json`. `supabase start` / `supabase db reset` must be run manually. The plan should either document this or add npm scripts.

The `data-schema-rls` plan (`context/changes/data-schema-rls/plan.md:281–289`) explicitly deferred real-DB integration testing: "Full round-trip against a local Supabase instance... Deferred — not a gate for this change."

#### Cheapest test layer

Two test sessions against a local Supabase instance (`supabase start`). Create a vehicle as User A. Query it as User B. Expect 0 rows on SELECT, rejected INSERT/UPDATE/DELETE. Repeat for `service_records`.

**Anti-pattern to avoid**: using `@supabase/supabase-js` mock builders. The mock passes because it returns what we tell it to. The gap we are closing is in the actual DB policy, not the client call.

**Additional note**: `VehicleService.getVehicle(id)` (lines 24–32) fetches by ID only — no explicit `user_id` filter on the client. This is intentional (RLS handles it), but it means a missing SELECT policy would silently return another user's vehicle. This is exactly the failure mode the integration test must catch.

---

### Risk #5 — App-Layer Ownership Before AI Proxy

#### AiScheduleService.generateAndSave

**File**: `src/app/core/ai-schedule/ai-schedule.service.ts`

```
Line 11: generateAndSave(vehicle: Vehicle, signal?: AbortSignal, serviceRecords: ServiceRecord[])
Line 12: fetch('/api/ai', { method: 'POST', body: ... })   ← AI proxy call, NO ownership check before this
Lines 23–34: response parsing and validation
Line 35: this.vehicleService.updateVehicle(vehicle.id, { ai_schedule: filtered })
```

There is **no ownership check** anywhere between line 11 and line 12. The service accepts any `Vehicle` object and immediately makes the expensive proxy call.

#### ScheduleViewComponent

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

```
Line 67: const id = this.route.snapshot.params['id'];
Line 69: const vehicle = await this.vehicleService.getVehicle(id);
Line 71: if (!vehicle) { this.router.navigate(['/dashboard']); return; }
         ↑ RLS-protected: getVehicle returns null for unowned vehicles → redirect fires
         But once vehicle is non-null, ownership is not re-checked before passing to generateAndSave
```

The component's normal UI path is safe: `getVehicle` relies on RLS, which returns null for unowned vehicles. The redirect at line 71 fires before the AI call can be triggered. The gap is at the **service layer** — `generateAndSave` can be called from any context with any `Vehicle` object.

#### VehicleService.getVehicle vs updateVehicle

**File**: `src/app/core/vehicles/vehicle.service.ts`

| Method                     | user_id filter                     | Line  |
| -------------------------- | ---------------------------------- | ----- |
| `getVehicle(id)`           | none — relies on RLS               | 24–32 |
| `updateVehicle(id, patch)` | `.eq('user_id', user.id)` explicit | 54    |

This means the DB write in `generateAndSave` (via `updateVehicle`) IS protected by both RLS and an explicit client-side filter. But the AI proxy call at line 12 happens BEFORE the write — the proxy is invoked with no protection.

#### Cloudflare Worker

**File**: `functions/worker.ts`, `handleAI()` at lines 191–227

- No request authentication
- No user context validation
- No vehicle ownership check
- Simply forwards the POST body to `https://openrouter.ai/api/v1/chat/completions` (line 209)

The worker trusts whatever the client sends. This is the expected design for a BFF (backend-for-frontend) proxy, but it places the ownership burden entirely on the SPA.

#### Attack path (confirmed)

1. Attacker navigates to `/vehicles/{victim-vehicle-id}` in their own session.
2. `getVehicle` returns null (RLS). Component redirects to dashboard. ✓ Protected via UI.
3. Attacker calls `AiScheduleService.generateAndSave(constructedVehicleObject)` directly.
4. Line 12 fires — AI proxy call for victim's vehicle. **No check prevents this.**
5. Line 35 fires — `updateVehicle` with `.eq('user_id', ...)` rejects at DB. ✓ Write protected.
6. Result: proxy invoked (API credits consumed, prompt contains victim's vehicle data), write rejected.

#### What Phase 2 must do for Risk #5

This is not test-only. **The ownership check must be added to `AiScheduleService.generateAndSave()` before line 12**, then tested. Recommended location:

```typescript
// Before line 12 in ai-schedule.service.ts:
const currentUserId = this.auth.currentUser()?.id;
if (!currentUserId || vehicle.user_id !== currentUserId) {
  throw new Error('Vehicle does not belong to the current user');
}
```

Then the unit test verifies: spy on `fetch`, call `generateAndSave` with a vehicle whose `user_id` differs from `AuthService.currentUser()`, expect the function to throw before `fetch` is called.

**Anti-pattern to avoid**: testing only the DB write rejection (RLS + `updateVehicle`). That test passes even without the ownership check, because the DB-level protection exists. The test must assert that `fetch` is **never called** when ownership fails.

---

## Code References

**Auth guard:**

- `src/app/core/auth/auth.guard.ts:5–12` — guard implementation
- `src/app/app.routes.ts:15` — guard applied to root `/` route; lines 18–41 for child routes
- `src/app/core/auth/auth.service.ts:10–26` — auth state signals and initialization promise
- `src/app/core/auth/auth.service.spec.ts:12–39` — mock builder available for reuse in guard tests

**RLS:**

- `supabase/migrations/20260604000000_init_schema.sql:36–83` — RLS ENABLE + all 8 policies
- `supabase/config.toml:5,10,29,65` — local instance config
- `src/app/core/vehicles/vehicle.service.ts:24–32` — `getVehicle` (RLS-only, no client-side user_id filter)
- `src/app/core/vehicles/vehicle.service.spec.ts:60–77` — existing mock ownership test
- `src/app/core/service-records/service-record.service.spec.ts:145–153` — existing mock ownership test

**AI schedule ownership:**

- `src/app/core/ai-schedule/ai-schedule.service.ts:11–35` — `generateAndSave` (proxy call at line 12, no ownership check)
- `src/app/vehicles/schedule-view/schedule-view.ts:67–74` — vehicle ID from route params, no re-verify
- `src/app/core/vehicles/vehicle.service.ts:54` — `updateVehicle` explicit `.eq('user_id', ...)` (write protected)
- `functions/worker.ts:191–227` — `handleAI` worker (no auth, no ownership)

---

## Architecture Insights

1. **The guard await pattern is correct but fragile**: `await auth.initialized` is the right design, but it couples the guard to a specific internal Promise on `AuthService`. If `AuthService` is ever refactored (e.g., to use a signal-based init instead of a Promise), the guard silently breaks. The test pins this contract.

2. **RLS as the only cross-user isolation layer**: `getVehicle(id)` has no client-side `user_id` filter. If an RLS SELECT policy is accidentally dropped, `getVehicle` returns any row — and the app has no second line of defence. This confirms the test plan's position: mock tests are not sufficient; the policy must be tested at the DB level.

3. **`service_records.user_id` denormalization is intentional**: Confirmed in `data-schema-rls` plan. The column exists specifically to make RLS policies self-contained on that table. Tests should verify this table independently, not assume the vehicle FK implies ownership.

4. **Two error contracts in play (from `lessons.md`)**: `AuthService` returns `AuthError | null`; data services throw. The guard test and any AI-schedule ownership test must not mix these — the ownership check in `generateAndSave` should throw (consistent with the data-service contract), not return an error value.

5. **Worker is trust-the-client by design**: The Cloudflare Worker at `functions/worker.ts` is a thin BFF proxy with no auth. This is the stated architecture (PRD §FR-005). The SPA must be the ownership gate. Risk #5 is about the SPA failing that duty.

---

## Historical Context

- `context/changes/auth-scaffold/plan.md:270–279` — Explicitly deferred all auth integration/e2e tests: "unit tests cover AuthService only." Phase 2 closes this debt.
- `context/changes/auth-scaffold/plan.md:23–29` — "No reverse auth guard" (authenticated users visiting `/login` not redirected) is an intentional MVP decision. Out of scope for Phase 2.
- `context/changes/data-schema-rls/plan.md:38–42` — `service_records.user_id` denormalization documented; UPDATE policy requires both USING and WITH CHECK confirmed.
- `context/changes/data-schema-rls/plan.md:281–289` — RLS integration test ("two sessions, cross-user query") was explicitly deferred: "not a gate for this change." Phase 2 closes this debt.

---

## Open Questions

1. **Risk #5 implementation scope**: Adding the ownership check to `AiScheduleService.generateAndSave()` is a code change, not just a test addition. The plan should treat this as a sub-phase: (a) add the guard, (b) add the unit test. Should the plan also add an ownership check to the component level (`ScheduleViewComponent`) as defence-in-depth, or is the service layer sufficient?

2. **RLS integration test tooling**: `package.json` has no Supabase CLI scripts. The plan should either add `supabase:start` / `supabase:reset` npm scripts or document the manual flow. Should these be added as a sub-phase, or treated as developer-setup docs in `§6.3`?

3. **Test isolation for RLS integration tests**: Creating two test users requires admin-level Supabase access or seed SQL. Should the integration tests use the Supabase service-role key (for setup only) and then verify with anon-role sessions? The seed file at `supabase/seed.sql` should be checked for existing user fixtures.

4. **Reverse guard out of scope?**: `auth-scaffold` deferred "authenticated users visiting `/login` are not redirected." Should Phase 2 cover this for completeness, or defer it again? Not a security risk but a UX gap.
