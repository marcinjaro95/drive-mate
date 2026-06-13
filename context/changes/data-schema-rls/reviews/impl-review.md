<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Data Schema and Row Level Security

- **Plan**: context/changes/data-schema-rls/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 4 warnings · 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Success Criteria

- `npm run build`: PASS — zero TypeScript errors
- `npm test`: PASS — 26/26 tests green
- Manual items: all confirmed (Supabase Studio check, RLS smoke test, cascade delete verified)

## Findings

### F1 — Non-null assertion on unauthenticated currentUser()

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/core/vehicles/vehicle.service.ts:33, src/app/core/service-records/service-record.service.ts:34
- **Detail**: Both createVehicle and createServiceRecord use `this.auth.currentUser()!.id`. If called without an active session (route guard race, direct service call, future background job), this throws an uncontrolled TypeError instead of a meaningful auth error. RLS INSERT policy is the hard backstop but the app layer should fail with intent.
- **Fix**: Replace the bang assertion with an explicit guard in both files:
  ```ts
  const user = this.auth.currentUser();
  if (!user) throw new Error('Unauthenticated');
  const user_id = user.id;
  ```
  - Strength: Matches defensive posture expected by AGENTS.md; callers get a typed, catchable error rather than a TypeError.
  - Tradeoff: 3-line change × 2 files; no test or schema impact.
  - Confidence: HIGH — direct improvement, no open questions.
  - Blind spot: None significant.
- **Decision**: FIXED

### F2 — update/delete rely solely on RLS for ownership enforcement

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/core/vehicles/vehicle.service.ts:43,51; src/app/core/service-records/service-record.service.ts:44,50
- **Detail**: updateVehicle, deleteVehicle, updateServiceRecord, deleteServiceRecord filter only on `.eq('id', id)`. Ownership enforced exclusively by RLS policy. createVehicle uses defence-in-depth (stamps user_id from session) but mutation methods do not mirror that posture. If the service client were ever used with a service_role key connection, these methods would operate without an ownership constraint.
- **Fix A ⭐ Recommended**: Add `.eq('user_id', userId)` alongside `.eq('id', id)` in all 4 mutation methods.
  - Strength: Mirrors the posture of the create path; catches misuse in non-RLS contexts (Edge Functions, tests with service_role key, future admin tooling).
  - Tradeoff: Requires reading currentUser() in update/delete too — 4 methods × 2 services, ~2 extra lines each.
  - Confidence: HIGH — consistent with AGENTS.md hard rule.
  - Blind spot: None significant.
- **Fix B**: Accept RLS as sufficient for an Angular SPA.
  - Strength: The SPA exclusively uses the anon key; service_role never reaches the browser. RLS handles the case.
  - Tradeoff: Any future server-side consumer of these services (Edge Functions, scripts) would need to add the filter manually or risk a silent data leak.
  - Confidence: MED — correct today, fragile as codebase grows.
  - Blind spot: Haven't audited whether Edge Function plans (FR-005 AI schedule) will reuse these services.
- **Decision**: FIXED via Fix A

### F3 — Unbounded list queries (no limit / pagination)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/core/vehicles/vehicle.service.ts:14; src/app/core/service-records/service-record.service.ts:14
- **Detail**: getVehicles() and getServiceRecords() issue `.select('*')` with no `.limit()`. A data import or long-term user could produce hundreds of rows returned in a single round-trip. PRD doesn't cap fleet size.
- **Fix A ⭐ Recommended**: Add a pragmatic default `.limit(100)` now and expose an optional `{ limit, offset }` parameter.
  - Strength: Prevents unbounded payloads without blocking S-01; interface is already extensible when pagination UI is designed.
  - Tradeoff: Arbitrary limit choice; callers relying on "all rows" would silently get a partial set. Requires updating specs.
  - Confidence: HIGH — standard safe default; limit can be raised.
  - Blind spot: S-01 (car-add UI) hasn't been designed yet.
- **Fix B**: Defer until pagination is designed with the car-add UI (S-01).
  - Strength: Avoids setting an arbitrary limit that might need changing when real UI constraints are understood.
  - Tradeoff: Unbounded queries go live with S-01 if not addressed there.
  - Confidence: MED — acceptable short-term, needs an explicit follow-up.
  - Blind spot: S-01 timeline is unknown.
- **Decision**: FIXED via Fix A

### F4 — smoke-test-rls.sql committed to repo root (unplanned)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: smoke-test-rls.sql (repo root)
- **Detail**: Not in the plan. Generated interactively during the RLS smoke test discussion and accidentally staged before being excluded from the phase 3 commit. Functionally harmless (uses ROLLBACK) but is an ad-hoc debug artifact at the repo root with no documented owner.
- **Fix A ⭐ Recommended**: Delete the file.
  - Strength: The RLS test it encodes is captured in Progress 1.5 and in CLI session notes. No information is lost.
  - Tradeoff: Loses a ready-to-run CLI smoke test.
  - Confidence: HIGH — it's a one-off debug artifact, not a test suite.
  - Blind spot: None significant.
- **Fix B**: Move to supabase/scripts/smoke-test-rls.sql.
  - Strength: Keeps the runnable artifact; co-locates with other Supabase tooling.
  - Tradeoff: Normalises an ad-hoc script as a maintained asset; no supabase/scripts/ convention exists yet.
  - Confidence: MED — only worth keeping if the team plans to run it as part of a migration verification routine.
  - Blind spot: No supabase/scripts/ convention exists yet in this repo.
- **Decision**: FIXED via Fix A

### F5 — No tests for updateVehicle / updateServiceRecord

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/core/vehicles/vehicle.service.spec.ts; src/app/core/service-records/service-record.service.spec.ts
- **Detail**: Both spec files cover getAll, getOne, create, and delete but have zero coverage for the update methods. If updateVehicle or updateServiceRecord regresses (e.g., ownership filter added incorrectly), no test will catch it.
- **Fix**: Add success + error cases for updateVehicle (vehicle.service.ts:43) and updateServiceRecord (service-record.service.ts:44), following the existing describe/it pattern.
- **Decision**: FIXED

### F6 — createMockBuilder helper duplicated across both spec files

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/core/vehicles/vehicle.service.spec.ts:9; src/app/core/service-records/service-record.service.spec.ts:9
- **Detail**: createMockBuilder and MOCK_USER are copy-pasted verbatim. A fix to the builder (e.g., adding a missing query method) must be applied in two places.
- **Fix**: Extract to src/app/core/testing/mock-supabase-builder.ts and import in both specs.
- **Decision**: FIXED

### F7 — Two error contracts in core/ (throw vs. return error)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/core/auth/auth.service.ts (returns AuthError | null) vs src/app/core/vehicles/vehicle.service.ts (throws PostgrestError)
- **Detail**: AuthService.signIn/signUp return the error as a value; the new data services throw. Callers using both must handle errors two different ways. The throw-on-error pattern is idiomatic for async/await and is the better model — but the divergence is undocumented.
- **Fix**: Add a note to AGENTS.md: "Data services (VehicleService, ServiceRecordService) throw on error; AuthService returns AuthError | null. Do not introduce a third pattern."
- **Decision**: FIXED + ACCEPTED-AS-RULE: Two error contracts in core services

### F8 — Missing CHECK constraints on vehicles columns

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260604000000_init_schema.sql:22
- **Detail**: year, engine_capacity, and fuel_type have no CHECK constraints. year could be 0 or negative; engine_capacity could be 0 or negative; fuel_type accepts any string.
- **Fix**: Add a new migration file (never edit the original) with:
  ```sql
  ALTER TABLE vehicles ADD CONSTRAINT year_range CHECK (year BETWEEN 1886 AND 2100);
  ALTER TABLE vehicles ADD CONSTRAINT engine_capacity_positive CHECK (engine_capacity > 0);
  ALTER TABLE vehicles ADD CONSTRAINT fuel_type_values CHECK (fuel_type IN ('gasoline','diesel','electric','hybrid','lpg'));
  ```
- **Decision**: FIXED

### F9 — update_updated_at() missing SET search_path guard

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260604000000_init_schema.sql:7
- **Detail**: PL/pgSQL functions without SET search_path are vulnerable to search_path injection in multi-schema deployments. Will appear as a warning in Supabase Studio's security advisor.
- **Fix**: Add a new migration that replaces the function:
  ```sql
  CREATE OR REPLACE FUNCTION update_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql
  SET search_path = ''
  AS $$ BEGIN NEW.updated_at = pg_catalog.now(); RETURN NEW; END; $$;
  ```
- **Decision**: FIXED
