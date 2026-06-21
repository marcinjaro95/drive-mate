# AI Schedule Invalidation After Vehicle-Edit — Plan Brief

> Full plan: `context/changes/ai-schedule-on-edit/plan.md`
> Research: `context/changes/ai-schedule-on-edit/research.md`

## What & Why

After a user edits vehicle specs (make, model, year, engine capacity, fuel type, mileage) and saves, the cached `ai_schedule` is not cleared. `schedule-view` reuses the stale schedule without regeneration, displaying maintenance intervals based on pre-edit data. The fix is to null out `ai_schedule` in the update payload so `schedule-view`'s existing binary cache check triggers regeneration on the next load.

## Starting Point

`ai_schedule` is stored in the vehicle row (not a separate table). `schedule-view.ts:101-103` skips generation entirely if `ai_schedule` is non-null. `vehicle-edit.ts:onSubmit()` never includes `ai_schedule` in the payload — an explicit scope cut made during the vehicle-edit implementation.

## Desired End State

After saving any vehicle edit, the vehicle row has `ai_schedule = null`. When `schedule-view` mounts it finds null, triggers generation, and displays a fresh schedule reflecting the updated specs. The user sees a "Vehicle updated — regenerating AI schedule…" snackbar immediately after saving, before the route navigates.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Invalidation strategy | `ai_schedule: null` in update payload | Simpler and reliable regardless of nav path; router state would be lost on refresh or indirect navigation | Plan |
| VIN DB immutability | Out of scope | Keeps this change focused; VIN immutability is already application-layer enforced | Plan |
| UX feedback | Snackbar before navigate in vehicle-edit | Communicates cause and effect so user understands why the spinner appears in schedule-view | Plan |

## Scope

**In scope:**
- `vehicle-edit.ts`: add `ai_schedule: null` to `updateVehicle` payload
- `vehicle-edit.ts`: inject `MatSnackBar`, show notification before routing
- `vehicle-edit.spec.ts`: update payload assertion; add snackbar test

**Out of scope:**
- DB-level VIN immutability trigger
- Selective invalidation by field delta
- Any changes to `schedule-view.ts`

## Architecture / Approach

Single-component change. `vehicle-edit.ts` writes `ai_schedule: null` to Supabase alongside the user's edits, then fires a snackbar. Navigation hands off to `schedule-view`, which already handles the null case correctly by calling `generateSchedule()`. No new services, no schema changes, no cross-component state.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Production Code Fix | `vehicle-edit.ts` clears schedule + shows snackbar | MatSnackBar DI may need a test-setup tweak |
| 2. Test Update | Spec reflects new payload shape; new snackbar assertion | Existing `toEqual` will fail without the update |

**Prerequisites:** None — no migrations, no external dependencies.  
**Estimated effort:** ~1 session, 2 phases (both trivially small).

## Open Risks & Assumptions

- `VehicleService.updateVehicle` accepts `Partial<Vehicle>` — confirmed from research; `ai_schedule` is a valid field on the `Vehicle` model.
- Every vehicle edit (including mileage-only) will trigger a fresh AI call. This is intentional; selective invalidation is not worth the added complexity at current usage scale.

## Success Criteria (Summary)

- Editing any vehicle field and saving causes `schedule-view` to regenerate (not reuse the cached schedule)
- A snackbar confirms the save and signals pending regeneration
- `npm test` passes with the updated payload assertion and new snackbar test
