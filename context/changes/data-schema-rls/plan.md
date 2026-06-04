# Data Schema and Row Level Security Implementation Plan

## Overview

Create the two core database tables (`vehicles` and `service_records`), enforce Row Level Security policies, define TypeScript domain types, and build CRUD Angular data services. This is foundation change F-02 — it directly unblocks S-01 (car-add + AI schedule), S-02 (service tracking), and S-04 (car deletion).

## Current State Analysis

The Supabase project (`drive-mate`) is live with credentials wired in `src/environments/environment.ts`. Auth is complete (F-01): `SupabaseService` and `AuthService` are in place. Zero database schema, migration files, TypeScript domain types, or data services exist. `supabase/migrations/` does not yet exist.

## Desired End State

After this plan:
- Two tables (`vehicles`, `service_records`) exist in Supabase with RLS enabled; every SELECT/INSERT/UPDATE/DELETE is scoped to `auth.uid()` — a user can never read or touch another user's rows.
- TypeScript interfaces in `src/app/core/models/` allow all downstream slices to write typed Supabase queries without reinventing the schema.
- `VehicleService` and `ServiceRecordService` provide a typed CRUD API that injects `user_id` automatically from auth state; feature components never call `supabase.client` directly.
- S-01 can build the car-add UI without touching schema or services.

### Key Discoveries

- `src/app/core/supabase.service.ts` exposes `.client` — data services inject this via `inject(SupabaseService).client`.
- `AuthService.currentUser()` returns the Supabase `User` object with `.id`, which equals `auth.uid()` for RLS purposes.
- `supabase/config.toml` exists (project ID `drive-mate`), but `supabase/migrations/` does not — the directory must be created alongside the first migration file.

## What We're NOT Doing

- No AI schedule logic (S-01).
- No UI components.
- No VIN lookup (S-03 — blocked on VIN API selection).
- No soft-delete — hard delete + `ON DELETE CASCADE` is the chosen strategy (OQ-2 resolved).
- No `service_types` reference table — `label` is free text for MVP.
- No `supabase gen types typescript` auto-generation — hand-written interfaces are the contract.

## Implementation Approach

Three sequential phases following the data-layer hierarchy: (1) SQL schema first so the DB is ready; (2) TypeScript types that mirror the schema exactly; (3) Angular services that consume both. Each phase has a clear automated verification gate before moving on.

## Critical Implementation Details

- **`user_id` denormalization on `service_records`**: The table carries its own `user_id` column (not just `vehicle_id`) as deliberate denormalization. This keeps RLS policies on `service_records` self-contained — no JOIN to `vehicles` is needed in the policy expression. It also provides a second isolation layer if vehicle cascade is ever bypassed. The service layer must always stamp `user_id` from `auth.currentUser()`, never from call arguments.

- **RLS INSERT vs UPDATE syntax**: `INSERT` policies use `WITH CHECK (user_id = auth.uid())`, not `USING`. `UPDATE` policies require *both* `USING (user_id = auth.uid())` (which rows can be touched) *and* `WITH CHECK (user_id = auth.uid())` (what new values are allowed). Using only `USING` on an `UPDATE` leaves the `WITH CHECK` wide open.

---

## Phase 1: SQL Schema and RLS Policies

### Overview

Create `supabase/migrations/20260604000000_init_schema.sql` defining both tables, RLS policies, an `updated_at` trigger, and performance indexes. Apply the migration to the remote Supabase project.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/20260604000000_init_schema.sql`

**Intent**: Define the complete initial schema — both tables with all constraints, RLS policies, trigger function, and indexes. This is the schema contract all downstream slices depend on.

**Contract**: Exact column shapes the rest of the plan and all future slices will rely on:

```sql
-- vehicles
id              uuid         PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
make            text         NOT NULL
model           text         NOT NULL
year            integer      NOT NULL
engine_capacity numeric      NOT NULL
fuel_type       text         NOT NULL
vin             text                         -- nullable; populated by S-03 VIN lookup
current_mileage integer                      -- nullable; user-reported "now" reference for schedule
created_at      timestamptz  NOT NULL DEFAULT now()
updated_at      timestamptz  NOT NULL DEFAULT now()

-- service_records
id           uuid        PRIMARY KEY DEFAULT gen_random_uuid()
vehicle_id   uuid        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE
user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
service_date date        NOT NULL
mileage      integer     NOT NULL CHECK (mileage >= 0)
label        text        NOT NULL             -- e.g. 'Oil change'
notes        text                             -- nullable user comment
created_at   timestamptz NOT NULL DEFAULT now()
updated_at   timestamptz NOT NULL DEFAULT now()
```

RLS policy pattern (replicate for both tables; note INSERT uses `WITH CHECK`, UPDATE uses both clauses):

```sql
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicles_select" ON vehicles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "vehicles_insert" ON vehicles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "vehicles_update" ON vehicles
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "vehicles_delete" ON vehicles
  FOR DELETE USING (user_id = auth.uid());
```

Indexes: `CREATE INDEX ON vehicles(user_id)`, `CREATE INDEX ON service_records(vehicle_id)`, `CREATE INDEX ON service_records(user_id)`.

`updated_at` trigger: a single `update_updated_at()` PL/pgSQL function sets `NEW.updated_at = now()` on `BEFORE UPDATE`, attached to both tables.

### Success Criteria

#### Automated Verification

- `supabase link --project-ref hftjmsmkmfiasseubjpz` succeeds (one-time; links CLI to remote project).
- `supabase db push` applies the migration to the remote project with zero errors.

#### Manual Verification

- Supabase Studio → Tables: both `vehicles` and `service_records` visible with correct column names and types.
- Supabase Studio → Authentication → Policies: 4 policies per table, all shown as active.
- RLS smoke test: using two separate browser sessions (or Supabase SQL editor with `SET LOCAL role = anon` + different JWTs), verify that a row inserted by user A returns 0 results when queried by user B.

**Implementation Note**: After completing Phase 1 and all automated verification passes, pause for manual confirmation (Supabase Studio check + RLS smoke test) before proceeding to Phase 2.

---

## Phase 2: TypeScript Domain Types

### Overview

Define `Vehicle` and `ServiceRecord` interfaces mirroring the SQL schema exactly, plus lightweight mutation helper types. Place them in `src/app/core/models/`.

### Changes Required

#### 1. Vehicle model

**File**: `src/app/core/models/vehicle.model.ts`

**Intent**: Typed representation of a `vehicles` row, plus helper types for create and update operations so caller sites don't need to reconstruct the shape.

**Contract**:

```typescript
export interface Vehicle {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number;
  engine_capacity: number;
  fuel_type: string;
  vin: string | null;
  current_mileage: number | null;
  created_at: string;
  updated_at: string;
}

export type NewVehicle = Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>;
export type VehicleUpdate = Partial<Omit<NewVehicle, 'user_id'>>;
```

`engine_capacity` is `number` — Supabase returns PostgreSQL `numeric` as a JS number. `vin` and `current_mileage` are nullable.

#### 2. ServiceRecord model

**File**: `src/app/core/models/service-record.model.ts`

**Intent**: Typed representation of a `service_records` row with mutation helper types.

**Contract**:

```typescript
export interface ServiceRecord {
  id: string;
  vehicle_id: string;
  user_id: string;
  service_date: string;   // ISO date string, e.g. '2026-06-04'
  mileage: number;
  label: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NewServiceRecord = Omit<ServiceRecord, 'id' | 'created_at' | 'updated_at'>;
export type ServiceRecordUpdate = Partial<Omit<NewServiceRecord, 'user_id' | 'vehicle_id'>>;
```

### Success Criteria

#### Automated Verification

- `npm run build` completes with zero TypeScript errors.

**Implementation Note**: Both model files must compile before Phase 3 starts, since the services import from them.

---

## Phase 3: Angular Data Services

### Overview

Create `VehicleService` and `ServiceRecordService` as `providedIn: 'root'` Angular services. Each method wraps a Supabase query and throws on error. `user_id` is always stamped from `AuthService.currentUser()`, never accepted from callers. Write Vitest specs alongside each service.

### Changes Required

#### 1. VehicleService

**File**: `src/app/core/vehicles/vehicle.service.ts`

**Intent**: Encapsulate all Supabase queries for the `vehicles` table. Feature components import this service and never call `supabase.client` directly.

**Contract**: Public method signatures (services return `Promise`, not `Observable`):

```typescript
getVehicles(): Promise<Vehicle[]>
getVehicle(id: string): Promise<Vehicle | null>
createVehicle(payload: Omit<NewVehicle, 'user_id'>): Promise<Vehicle>
updateVehicle(id: string, payload: VehicleUpdate): Promise<Vehicle>
deleteVehicle(id: string): Promise<void>
```

`createVehicle` stamps `user_id: this.auth.currentUser()!.id` before inserting. `getVehicles` orders by `created_at` descending. All methods throw the Supabase `PostgrestError` on failure (no swallowing — callers handle UI feedback). Uses `.maybeSingle()` for `getVehicle` (returns `null` if not found, throws if >1 row).

#### 2. VehicleService spec

**File**: `src/app/core/vehicles/vehicle.service.spec.ts`

**Intent**: Verify `user_id` injection behaviour and error propagation using mocked Supabase and auth dependencies. No real DB required.

**Contract**: Mock `SupabaseService` so `.client.from('vehicles')` returns a controllable spy chain. Key test cases:
- `createVehicle` inserts a row containing `user_id` taken from `AuthService.currentUser().id`, not from the caller's payload.
- When Supabase returns `{ data: null, error: { message: '…' } }`, the method throws the error.
- `getVehicles` returns a typed `Vehicle[]` on success.

#### 3. ServiceRecordService

**File**: `src/app/core/service-records/service-record.service.ts`

**Intent**: Encapsulate all Supabase queries for the `service_records` table. Same design contract as `VehicleService`.

**Contract**: Public method signatures:

```typescript
getServiceRecords(vehicleId: string): Promise<ServiceRecord[]>
getServiceRecord(id: string): Promise<ServiceRecord | null>
createServiceRecord(payload: Omit<NewServiceRecord, 'user_id'>): Promise<ServiceRecord>
updateServiceRecord(id: string, payload: ServiceRecordUpdate): Promise<ServiceRecord>
deleteServiceRecord(id: string): Promise<void>
```

`getServiceRecords` filters by `vehicle_id` and orders by `service_date` descending. `createServiceRecord` stamps `user_id`. Same error-throwing contract as `VehicleService`.

#### 4. ServiceRecordService spec

**File**: `src/app/core/service-records/service-record.service.spec.ts`

**Intent**: Same coverage goals as `VehicleService` spec — `user_id` injection and error propagation.

**Contract**: Mock-based, same pattern as vehicle spec. Key case: `createServiceRecord` stamps `user_id` from auth, not from the caller.

### Success Criteria

#### Automated Verification

- `npm run build` passes.
- `npm test` passes — all new Vitest specs green.

#### Manual Verification

- Temporarily inject `VehicleService` into `DashboardComponent`, call `createVehicle` with test data on init, and confirm the row appears in Supabase Studio with the correct `user_id`.
- Delete the test vehicle and confirm its `service_records` cascade-delete if any exist (create one first to verify).
- Remove the temporary wiring before committing.

**Implementation Note**: After completing Phase 3 and all automated verification passes, run the manual confirmation steps above before closing out the change.

---

## Testing Strategy

### Unit Tests

- Mock `SupabaseService.client` query chain for both data services.
- Verify `user_id` is stamped from `AuthService.currentUser().id`, not from caller arguments.
- Verify that `{ data: null, error: { … } }` responses cause the service to throw.
- Verify typed return values on success paths.

### Integration Tests

- Full round-trip against a local Supabase instance (`supabase start` + `supabase db reset`): insert a vehicle as user A; query as user B; expect 0 rows. Deferred — not a gate for this change, but the smoke test in Phase 1 manual verification covers it.

### Manual Testing Steps

1. Run `supabase db push` — confirm zero errors.
2. Open Supabase Studio → Tables; verify both tables with correct column types.
3. Open Supabase Studio → Authentication → Policies; verify 4 policies per table.
4. Sign up as user A via the app's signup form.
5. Sign up as user B (different email) in a separate incognito window.
6. As user A: insert a test vehicle (via Dashboard temporary wiring or Studio SQL editor).
7. As user B: `SELECT * FROM vehicles` in Studio SQL editor using B's JWT — confirm 0 rows.
8. As user A: add a service record to the test vehicle; then delete the vehicle; confirm the service record is gone (cascade confirmed).

## Performance Considerations

At MVP scale (small data volume per the PRD), the three indexes on `user_id` and `vehicle_id` are sufficient. No query planning concerns for the current scope.

## Migration Notes

`supabase/migrations/20260604000000_init_schema.sql` is the sole source of truth for the initial schema. Apply to remote via `supabase db push`. All subsequent schema changes land as new numbered migration files — the original migration is never edited.

## References

- PRD: `context/foundation/prd.md` — FR-002, FR-003, FR-006, data-isolation guardrail
- Roadmap: `context/foundation/roadmap.md` — F-02 outcome specification
- Auth service: `src/app/core/auth/auth.service.ts`
- Supabase service: `src/app/core/supabase.service.ts`
- Auth scaffold plan: `context/changes/auth-scaffold/plan.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: SQL Schema and RLS Policies

#### Automated

- [x] 1.1 `supabase link` succeeds for remote project — 8139496
- [x] 1.2 `supabase db push` applies migration with zero errors — 8139496

#### Manual

- [x] 1.3 Both tables visible in Supabase Studio with correct columns and types — 8139496
- [x] 1.4 4 RLS policies per table visible and active in Supabase Studio — 8139496
- [x] 1.5 RLS smoke test: user B cannot see user A's vehicle row — 8139496

### Phase 2: TypeScript Domain Types

#### Automated

- [x] 2.1 `npm run build` passes with zero TypeScript errors — 89a33b3

### Phase 3: Angular Data Services

#### Automated

- [x] 3.1 `npm run build` passes
- [x] 3.2 `npm test` passes (all new Vitest specs green)

#### Manual

- [x] 3.3 VehicleService.createVehicle creates row with correct `user_id` visible in Supabase Studio
- [x] 3.4 Deleting a vehicle cascades to its service records (confirmed manually)
