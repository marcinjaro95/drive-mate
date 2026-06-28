# AI Schedule Invalidation After Vehicle-Edit Implementation Plan

## Overview

When a user edits vehicle properties (make, model, year, engine capacity, fuel type, mileage) and saves, the cached `ai_schedule` in the DB is not cleared. On next load, `schedule-view` sees a non-null schedule and reuses it without regeneration, silently showing a stale schedule based on pre-edit specs. The fix is to explicitly null out `ai_schedule` in the update payload and notify the user that regeneration will happen.

## Current State Analysis

`vehicle-edit.ts:onSubmit()` sends six editable fields to `updateVehicle()` but omits `ai_schedule`. `schedule-view.ts:101-103` short-circuits to cached items whenever `ai_schedule` is non-null — there is no staleness check of any kind. The cache-first strategy is a binary: either a schedule exists or it doesn't. Clearing the DB field is the only reliable way to invalidate it regardless of how the user navigates.

## Desired End State

After saving vehicle-edit, the vehicle row in Supabase has `ai_schedule = null`. When `schedule-view` mounts, it finds null and triggers `generateSchedule()`. The user sees a brief snackbar in `vehicle-edit` confirming the update and signalling that the schedule will regenerate, followed by the existing regeneration spinner in `schedule-view`.

### Key Discoveries

- `vehicle-edit.ts:85-95` — the six-field payload; `ai_schedule` is absent
- `schedule-view.ts:101-103` — `if (ai_schedule?.length) { …; return; }` — the cache check that prevents regeneration
- `vehicle-edit.spec.ts:69-88` — existing payload-shape test uses `toEqual` against the exact six-field object; adding `ai_schedule: null` to the production payload will break this test unless the expected object is updated to match
- `schedule-view.ts:232-237` — existing snackbar usage pattern with `{ duration: 5000 }` and no dismiss button

## What We're NOT Doing

- DB-level VIN immutability trigger (out of scope — separate change)
- Selective invalidation based on which fields changed (overkill — any edit warrants fresh schedule)
- Regenerating the schedule synchronously inside `vehicle-edit` (keep the boundary clean: edit saves data, schedule-view owns generation)
- Any changes to `schedule-view.ts` (the existing null check already handles this correctly once the DB value is cleared)

## Implementation Approach

One-line payload change in `vehicle-edit.ts` clears `ai_schedule` on every save. A snackbar (matching the existing pattern in `schedule-view.ts`) gives the user immediate feedback before the router navigation. Existing tests are updated to reflect the new expected payload; one new test covers the snackbar.

---

## Phase 1: Production Code Fix

### Overview

Update `vehicle-edit.ts` to null out `ai_schedule` in the update payload and show a snackbar before navigating to the schedule view.

### Changes Required

#### 1. Add MatSnackBar dependency

**File**: `src/app/vehicles/vehicle-edit/vehicle-edit.ts`

**Intent**: Import `MatSnackBar` and `MatSnackBarModule` so the component can show a notification, and inject the service using the existing `inject()` pattern already used for every other service in this file.

**Contract**: Add `MatSnackBarModule` to the component's `imports` array alongside the existing Material imports. Add `private readonly snackBar = inject(MatSnackBar);` after the existing `inject` declarations. Follow the same pattern as `schedule-view.ts:47`.

#### 2. Null out ai_schedule in the update payload

**File**: `src/app/vehicles/vehicle-edit/vehicle-edit.ts`

**Intent**: Ensure that every successful vehicle save clears the cached AI schedule so `schedule-view` is forced to regenerate with the updated specs.

**Contract**: In `onSubmit()`, add `ai_schedule: null` as a field in the object passed to `updateVehicle()`. The field must appear alongside the six existing fields. `VehicleService.updateVehicle` accepts `Partial<Vehicle>` so no type change is needed.

#### 3. Show snackbar before navigating

**File**: `src/app/vehicles/vehicle-edit/vehicle-edit.ts`

**Intent**: Inform the user that the vehicle was saved and that the AI schedule will regenerate, so they aren't confused by the spinner that appears in `schedule-view`.

**Contract**: After `updateVehicle` resolves successfully and before `router.navigate(...)`, call `this.snackBar.open('Vehicle updated — regenerating AI schedule…', undefined, { duration: 5000 })`. Match the duration and no-dismiss-button pattern from `schedule-view.ts:233-237`.

### Success Criteria

#### Automated Verification

- Type check passes: `npx tsc --noEmit`
- Lint passes: `npx prettier --check src/app/vehicles/vehicle-edit/vehicle-edit.ts`

#### Manual Verification

- Edit a vehicle (change fuel type or engine capacity), save — the route navigates to schedule-view and a snackbar "Vehicle updated — regenerating AI schedule…" appears briefly
- The schedule-view shows the generating spinner (not the old cached schedule)
- A new schedule is generated and displayed based on the updated vehicle specs
- Editing only `current_mileage` (all other fields unchanged) also clears and regenerates the schedule

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Test Update

### Overview

Update the existing payload-shape test to include `ai_schedule: null` and add a new test verifying the snackbar fires on a successful save.

### Changes Required

#### 1. Update payload assertion

**File**: `src/app/vehicles/vehicle-edit/vehicle-edit.spec.ts`

**Intent**: The existing `toEqual` assertion at line 79 checks the exact payload shape; it must include `ai_schedule: null` now that the production code sends it, otherwise the test will fail with a shape mismatch.

**Contract**: In the `'submit calls updateVehicle with editable fields only — no vin key'` test, add `ai_schedule: null` to the expected object in the `toEqual` call. Keep the `not.toHaveProperty('vin')` assertion unchanged.

#### 2. Add snackbar notification test

**File**: `src/app/vehicles/vehicle-edit/vehicle-edit.spec.ts`

**Intent**: Verify that `MatSnackBar.open` is called with the expected message and options when a save succeeds, so a future refactor can't silently remove the user notification.

**Contract**: Add a new `it` block after the navigate test. In the test body, obtain `MatSnackBar` from `TestBed.inject(MatSnackBar)`, spy on its `open` method with `vi.spyOn`, call `onSubmit()`, then assert `openSpy` was called with `('Vehicle updated — regenerating AI schedule…', undefined, { duration: 5000 })`.

### Success Criteria

#### Automated Verification

- All unit tests pass: `npm test`
- The updated payload test still asserts `not.toHaveProperty('vin')`
- The new snackbar test passes

#### Manual Verification

- `npm test` output shows the new snackbar test by name in the passing list

---

## Testing Strategy

### Unit Tests

- Updated: `'submit calls updateVehicle with editable fields only — no vin key'` — now includes `ai_schedule: null` in expected payload
- New: `'shows a schedule-regeneration snackbar on successful save'`

### Manual Testing Steps

1. Sign in and open any vehicle with an existing (non-null) `ai_schedule` in the DB
2. Navigate to vehicle-edit, change one field (e.g. fuel type), save
3. Confirm snackbar appears: "Vehicle updated — regenerating AI schedule…"
4. Confirm schedule-view shows the generating spinner (not cached items)
5. Confirm a new schedule appears; verify it reflects the changed spec in the AI-generated items
6. In Supabase Studio, confirm the vehicle row had `ai_schedule` set to `null` momentarily before the new schedule was written

## References

- Research: `context/changes/ai-schedule-on-edit/research.md`
- Cache check: `src/app/vehicles/schedule-view/schedule-view.ts:101-103`
- Payload (before fix): `src/app/vehicles/vehicle-edit/vehicle-edit.ts:85-95`
- Existing snackbar pattern: `src/app/vehicles/schedule-view/schedule-view.ts:232-237`
- Existing tests: `src/app/vehicles/vehicle-edit/vehicle-edit.spec.ts:69-88`
- Prior scope cut: `context/changes/vehicle-edit/plan.md` § "What We're NOT Doing"

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Production Code Fix

#### Automated

- [x] 1.1 Type check passes: `npx tsc --noEmit` — f95a53b
- [x] 1.2 Lint passes: `npx prettier --check src/app/vehicles/vehicle-edit/vehicle-edit.ts` — f95a53b

#### Manual

- [x] 1.3 Snackbar appears after save and schedule-view regenerates with updated specs — f95a53b
- [x] 1.4 Mileage-only edit also clears and regenerates the schedule — f95a53b

### Phase 2: Test Update

#### Automated

- [x] 2.1 All unit tests pass: `npm test`
- [x] 2.2 Updated payload test includes `ai_schedule: null` and still asserts `not.toHaveProperty('vin')`
- [x] 2.3 New snackbar test passes and appears in output by name
