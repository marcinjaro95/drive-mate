# FR-009: Edit Vehicle Fields — Plan Brief

> Full plan: `context/changes/vehicle-edit/plan.md`

## What & Why

A user who makes a typo in their vehicle's make, model, year, engine capacity, or fuel type currently has no way to correct it without deleting the car — which destroys all service history. FR-009 adds a non-destructive edit flow limited to the five identity fields (plus optional mileage). VIN is shown for reference but cannot be changed once set.

## Starting Point

`VehicleService.updateVehicle()` already exists and is tested. `VehicleAddComponent` provides the exact form shape, validators, and Material template to mirror. No edit component or route exists today.

## Desired End State

An Edit button appears on each vehicle card in the list view. Clicking it opens `/dashboard/vehicles/:id/edit` with a form prefilled from the vehicle's current data. Saving calls `updateVehicle` and returns to the schedule view. Cancelling returns without writing. The VIN field is visible but locked.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Edit entry point | Edit button on vehicle card (list view) | Fewest clicks; user sees all cars at once | Plan |
| Edit surface | Dedicated route `/vehicles/:id/edit` | User-requested; allows bookmarking and clean navigation | Plan |
| VIN in edit form | Read-only with lock icon + hint | User sees their VIN for reference; immutability is explicit | Plan |
| `current_mileage` | Included as optional field | Matches add-form; lets user fix typos without a fake service record | Plan |
| Tests | Unit test for `VehicleEditComponent` | Covers prefill, VIN locked, payload shape, navigation contracts | Plan |

## Scope

**In scope:**
- New `VehicleEditComponent` at `src/app/vehicles/vehicle-edit/`
- New route `vehicles/:id/edit` in `app.routes.ts`
- Edit button on each vehicle card in `vehicle-list.html`
- `editCar()` method in `VehicleListComponent`
- `vehicle-edit.spec.ts` unit test

**Out of scope:**
- VIN editing
- AI schedule regeneration on save
- Schema or RLS changes
- Inline editing on the card or schedule view

## Architecture / Approach

Mirror `VehicleAddComponent` without the VIN decode flow. Load the vehicle via `ActivatedRoute` + `VehicleService.getVehicle()` on init, `patchValue` into the form, and call `updateVehicle` on submit with VIN excluded from the payload. Three new files, one updated route file, two updated list files.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. VehicleEditComponent | Working edit form at the new route | VIN accidentally included in `updateVehicle` payload |
| 2. Route + Entry Point | Edit button on card wired to new route | Card click fires both `openVehicle` and `editCar` if `stopPropagation` missing |
| 3. Unit Tests | Spec covering prefill, VIN lock, payload shape, navigation | N/A — low risk once Phase 1 is correct |

**Prerequisites:** None — `updateVehicle` is already implemented and tested.  
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- VIN field uses `{ value: null, disabled: true }` form init — `getRawValue()` will return the VIN value, so the submit handler must explicitly exclude it from the payload.

## Success Criteria (Summary)

- User can open the edit form, change a field, save, and see the updated value in the vehicle card and schedule view
- VIN field is always disabled; its value is never sent to `updateVehicle`
- All new unit test cases pass; no regressions in existing specs
