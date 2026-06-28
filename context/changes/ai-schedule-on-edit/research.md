---
date: 2026-06-21T00:00:00+02:00
researcher: Marcin Jarosz
git_commit: 95c25c3289758f837f236184926c69c58d292854
branch: master
repository: drive-mate
topic: 'AI schedule reload after vehicle-edit; VIN immutability rationale'
tags: [research, vehicle-edit, ai-schedule, vin, cache-invalidation]
status: complete
last_updated: 2026-06-21
last_updated_by: Marcin Jarosz
---

# Research: AI schedule reload after vehicle-edit; VIN immutability rationale

**Date**: 2026-06-21  
**Git Commit**: 95c25c3289758f837f236184926c69c58d292854  
**Branch**: master  
**Repository**: drive-mate

## Research Question

> "edycja danych pojazu powinna powodować przeładowanie ai schedule, czemu vin nie może zostać zmieniony"
>
> (Editing vehicle data should cause reloading of the AI schedule. Why can't VIN be changed?)

---

## Summary

Two separate questions, two separate answers:

1. **AI schedule does NOT reload after vehicle-edit** — confirmed gap. This was an _explicit design decision_ in the vehicle-edit plan, but it produces a UX bug: edited vehicle specs (fuel type, engine capacity, year) make the cached schedule stale, yet the user sees no indication of this. The simplest fix is to clear `ai_schedule: null` in the update payload, which forces schedule-view to regenerate on next load.

2. **VIN is immutable by intentional business rule** — documented in the PRD, enforced via disabled form control + payload exclusion (but not at the DB layer). The rationale is that VIN is the anchor for service history; allowing changes would break that link.

---

## Detailed Findings

### 1. AI Schedule Does Not Reload After Edit (Confirmed Gap)

#### The cache check in schedule-view

[`src/app/vehicles/schedule-view/schedule-view.ts:101-103`](https://github.com/marcinjaro95/drive-mate/blob/95c25c3289758f837f236184926c69c58d292854/src/app/vehicles/schedule-view/schedule-view.ts#L101)

```typescript
if (vehicleForInit.ai_schedule?.length) {
  this.scheduleItems.set(vehicleForInit.ai_schedule!);
  return; // exits — no regeneration
}
```

If `ai_schedule` is non-empty in the DB, schedule-view always uses it and never calls `generateSchedule()`. There is no staleness check of any kind.

#### What vehicle-edit saves

[`src/app/vehicles/vehicle-edit/vehicle-edit.ts:85-95`](https://github.com/marcinjaro95/drive-mate/blob/95c25c3289758f837f236184926c69c58d292854/src/app/vehicles/vehicle-edit/vehicle-edit.ts#L85)

```typescript
await this.vehicleService.updateVehicle(this.vehicleId, {
  make,
  model,
  year,
  engine_capacity,
  fuel_type,
  current_mileage,
  // ai_schedule is NOT in the payload — old schedule stays in DB
});
```

After `updateVehicle`, the router navigates to `/dashboard/vehicles/:id`, which mounts schedule-view. The DB record has the new vehicle specs but the old `ai_schedule`. The cache check triggers, and the user sees a stale schedule.

#### Design decision that created the gap

[`context/changes/vehicle-edit/plan.md`](https://github.com/marcinjaro95/drive-mate/blob/95c25c3289758f837f236184926c69c58d292854/context/changes/vehicle-edit/plan.md) — "What We're NOT Doing" section:

> "No AI schedule regeneration on save — schedule regeneration remains an explicit user action."

This was an intentional scope cut during implementation. The gap is real and documented.

#### AI schedule generation depends on the edited fields

[`src/app/core/ai-schedule/ai-schedule.service.ts`](https://github.com/marcinjaro95/drive-mate/blob/95c25c3289758f837f236184926c69c58d292854/src/app/core/ai-schedule/ai-schedule.service.ts) — `generateAndSave()` uses:

- `vehicle.year`, `vehicle.make`, `vehicle.model`
- `vehicle.engine_capacity`, `vehicle.fuel_type`
- `vehicle.current_mileage`

All of these are editable. A change to any of them should produce a different schedule.

---

### 2. VIN Is Immutable — Intentional Business Rule

#### PRD declaration

[`context/foundation/prd.md:84`](https://github.com/marcinjaro95/drive-mate/blob/95c25c3289758f837f236184926c69c58d292854/context/foundation/prd.md#L84):

> "Edit must be non-destructive and limited to the five identity fields; **VIN is immutable once set.**"
>
> Resolution of FR-009 Socrates commentary: "Delete-and-re-add destroys all associated service history — an unacceptable data-loss risk for a correction of a typo. Edit must be non-destructive … VIN is immutable once set."

VIN serves as the stable anchor for a vehicle's entire service history. Changing it would break the logical link between the vehicle record and its accumulated records.

#### UI enforcement

[`src/app/vehicles/vehicle-edit/vehicle-edit.html:13-18`](https://github.com/marcinjaro95/drive-mate/blob/95c25c3289758f837f236184926c69c58d292854/src/app/vehicles/vehicle-edit/vehicle-edit.html#L13):

```html
<input matInput formControlName="vin" type="text" />
<mat-icon matSuffix>lock</mat-icon>
<mat-hint>VIN cannot be changed</mat-hint>
```

Lock icon + hint text communicate immutability to the user.

#### Form + payload enforcement (double layer)

[`src/app/vehicles/vehicle-edit/vehicle-edit.ts:42`](https://github.com/marcinjaro95/drive-mate/blob/95c25c3289758f837f236184926c69c58d292854/src/app/vehicles/vehicle-edit/vehicle-edit.ts#L42): `vin: [{ value: null, disabled: true }]`

Plus: `vin` is never destructured out of `getRawValue()` into the `updateVehicle()` payload. Even if `disabled` were accidentally removed, the key would be absent from the update.

#### Test coverage

[`src/app/vehicles/vehicle-edit/vehicle-edit.spec.ts:60-88`](https://github.com/marcinjaro95/drive-mate/blob/95c25c3289758f837f236184926c69c58d292854/src/app/vehicles/vehicle-edit/vehicle-edit.spec.ts#L60):

- Test 1: VIN control is `disabled: true`
- Test 2: submit payload does NOT have a `vin` key

#### DB layer: no constraint

[`supabase/migrations/20260604000000_init_schema.sql:30`](https://github.com/marcinjaro95/drive-mate/blob/95c25c3289758f837f236184926c69c58d292854/supabase/migrations/20260604000000_init_schema.sql#L30): `vin text` — no UNIQUE constraint, no immutability trigger. Immutability is application-layer only.

---

## Code References

| File                                                 | Lines                  | What's there                                                |
| ---------------------------------------------------- | ---------------------- | ----------------------------------------------------------- |
| `src/app/vehicles/schedule-view/schedule-view.ts`    | 101-103                | Cache check — reuses old schedule if non-empty, **the gap** |
| `src/app/vehicles/schedule-view/schedule-view.ts`    | 70-106                 | Full ngOnInit, including the regeneration branch            |
| `src/app/vehicles/vehicle-edit/vehicle-edit.ts`      | 85-95                  | onSubmit — list of fields sent to updateVehicle             |
| `src/app/core/ai-schedule/ai-schedule.service.ts`    | 15-54                  | generateAndSave — fields it reads from Vehicle              |
| `src/app/vehicles/vehicle-edit/vehicle-edit.html`    | 13-18                  | VIN field: disabled input + lock icon + hint                |
| `src/app/vehicles/vehicle-edit/vehicle-edit.ts`      | 42                     | Form init: `vin: [{ value: null, disabled: true }]`         |
| `src/app/vehicles/vehicle-edit/vehicle-edit.spec.ts` | 60-88                  | VIN disabled + payload exclusion tests                      |
| `context/changes/vehicle-edit/plan.md`               | "What We're NOT Doing" | Explicit scope cut — no auto-regeneration                   |
| `context/foundation/prd.md`                          | 84                     | "VIN is immutable once set"                                 |
| `supabase/migrations/20260604000000_init_schema.sql` | 30                     | `vin text` — no DB-level constraint                         |

---

## Architecture Insights

- `ai_schedule` is stored **in the vehicle row** (not in a separate table), which is why clearing it is a simple `updateVehicle({ ai_schedule: null })` call.
- The regeneration trigger in schedule-view is a simple null/empty check — there is no hash, version, or timestamp to detect staleness. Any cache invalidation strategy must work within this binary: either there is a schedule or there isn't.
- VIN immutability being application-layer only is a design risk: direct DB access (Supabase Studio, SQL editor, edge function) can still change VIN. A UNIQUE constraint would not fix mutability, but an immutability trigger could.

---

## Historical Context

- `context/changes/vehicle-edit/plan.md` — full implementation plan for FR-009. The "What We're NOT Doing" section explicitly deferred AI schedule regeneration.
- `context/changes/car-add-ai-schedule/` — original AI schedule generation change. The cache-first strategy (`if ai_schedule?.length → return`) was introduced here and was correct for add flow; it becomes problematic for edit flow.

---

## Open Questions

1. **Fix strategy for AI schedule invalidation**: The cleanest fix is to add `ai_schedule: null` to the `updateVehicle` payload in vehicle-edit's `onSubmit`. This forces schedule-view to regenerate on next load. Alternative: skip the cache check when navigating from vehicle-edit (e.g. query param or router state flag). The first approach is simpler and more reliable.

2. **Should "current_mileage only" edits also invalidate the schedule?** Mileage affects schedule recommendations. Probably yes.

3. **DB-level VIN immutability**: Worth adding a Postgres trigger or check constraint to make VIN truly immutable, protecting against direct DB access.
