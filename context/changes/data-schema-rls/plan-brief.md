# Data Schema and Row Level Security — Plan Brief

> Full plan: `context/changes/data-schema-rls/plan.md`

## What & Why

DriveMate's data layer is currently empty — the auth scaffold exists but there are no tables, migrations, types, or services. This change creates the two core database tables (`vehicles` and `service_records`) with Row Level Security enforced, TypeScript domain types, and Angular CRUD services. Without it, no downstream feature slice (car-add, service tracking, deletion) can be built.

## Starting Point

`SupabaseService` and `AuthService` are in place (F-01 complete). The Supabase project `drive-mate` is live with credentials wired in `environment.ts`. Zero migration files, domain interfaces, or data services exist.

## Desired End State

Two tables exist in Supabase with RLS active: every row is scoped to the owning user's `auth.uid()` — a user can never read or touch another user's data. Typed `Vehicle` and `ServiceRecord` interfaces live in `src/app/core/models/`. `VehicleService` and `ServiceRecordService` provide a typed CRUD API; feature components never call `supabase.client` directly.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Migration delivery | Supabase CLI files in repo | Reproducible, version-controlled schema history — `supabase db push` applies to remote | Plan |
| VIN column | Nullable `text` on `vehicles` now | S-03 (VIN lookup) can populate it later without a schema migration | Plan |
| Delete strategy | Hard delete + `ON DELETE CASCADE` | Simpler than soft-delete; FR-003 compliance; confirmation dialog is S-04's responsibility | Plan |
| Mileage in service_records | `NOT NULL` | Both date and mileage feed schedule recalculation; friction is worth accuracy | Plan |
| Service record extra fields | `label text NOT NULL` + `notes text` | Aligns with AI schedule item labels (S-01); notes for freeform user comments | Plan |
| Current mileage | `current_mileage integer` (nullable) on `vehicles` | Schedule needs a "now" reference without scanning all service records | Plan |
| Types location | `src/app/core/models/` | Consistent with existing `core/` pattern (auth service, supabase service) | Plan |
| Service scope | Schema + RLS + types + Angular services | S-01 can focus on UI + AI logic without building a data layer | Plan |

## Scope

**In scope:**
- `supabase/migrations/20260604000000_init_schema.sql` — full DDL + RLS + indexes + `updated_at` trigger
- `src/app/core/models/vehicle.model.ts` + `service-record.model.ts` — interfaces + mutation helpers
- `src/app/core/vehicles/vehicle.service.ts` + spec
- `src/app/core/service-records/service-record.service.ts` + spec

**Out of scope:**
- UI components (S-01)
- VIN lookup integration (S-03)
- AI schedule generation (S-01)
- Soft-delete (closed)
- `supabase gen types typescript` automation

## Architecture / Approach

SQL migration → TypeScript types → Angular services, each layer depending on the one before. RLS is enforced at the database level (not just in application code); the service layer adds a second layer by auto-stamping `user_id` from `AuthService.currentUser()`. Feature components call `VehicleService` / `ServiceRecordService`; they never construct raw Supabase queries.

`service_records` carries a denormalized `user_id` column (not just `vehicle_id`) so RLS policies are self-contained — no JOIN to `vehicles` needed in policy expressions.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. SQL Schema & RLS | `vehicles` + `service_records` tables live in Supabase with RLS active | RLS policy syntax error (INSERT needs `WITH CHECK`, not `USING`) |
| 2. TypeScript Types | Typed interfaces + mutation helpers in `core/models/` | Column name mismatch between SQL and TS |
| 3. Angular Services | `VehicleService` + `ServiceRecordService` with CRUD + Vitest specs | Supabase mock complexity in tests; `user_id` injection accidentally accepted from callers |

**Prerequisites:** F-01 (auth scaffold) complete — ✓ done. Supabase CLI installed and `supabase link --project-ref hftjmsmkmfiasseubjpz` run once.

**Estimated effort:** ~1 focused session across 3 phases.

## Open Risks & Assumptions

- `supabase db push` requires the CLI to be linked to the remote project — first-time setup step before Phase 1's automated check passes.
- Supabase returns PostgreSQL `numeric` as a JS `number` — no special parsing needed, but verify if `engine_capacity` values like `1.6` round-trip correctly.

## Success Criteria (Summary)

- `supabase db push` applies cleanly; RLS smoke test confirms user B sees 0 rows from user A's vehicle.
- `npm run build` and `npm test` pass with no errors.
- `VehicleService.createVehicle` inserts a row with `user_id` from the authenticated session, visible in Supabase Studio.
