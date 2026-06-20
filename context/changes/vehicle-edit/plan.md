# FR-009: Edit Vehicle Fields — Implementation Plan

## Overview

Add the ability for a user to edit an existing vehicle's identity fields (make, model, year, engine capacity, fuel type, and optionally current mileage). The entry point is a new Edit button on each vehicle card in the list view. The edit form opens on a dedicated route (`/dashboard/vehicles/:id/edit`) and is prefilled with the current vehicle data. VIN is displayed as a read-only field and is never sent in the update payload. On save, the existing `VehicleService.updateVehicle()` is called and the user is navigated back to the schedule view.

## Current State Analysis

- `VehicleService.updateVehicle(id, VehicleUpdate)` exists and is fully tested (`vehicle.service.ts:47–59`).
- `VehicleUpdate` is `Partial<Omit<NewVehicle, 'user_id'>>` — all editable fields are already part of the type; VIN is included in the type but will be omitted from the payload by this feature (`vehicle.model.ts:19`).
- `VehicleAddComponent` (`vehicle-add.ts`) uses the identical field set with reactive forms and Angular Material — the edit form can mirror this structure almost exactly.
- `VehicleListComponent` already has a Delete button per card in `mat-card-actions` (`vehicle-list.html:27`); the Edit button slots in next to it.
- App routes (`app.routes.ts:33–36`) have `vehicles/:id` for the schedule view. The new `vehicles/:id/edit` route has more path segments and will not conflict.
- No `VehicleEditComponent` exists yet.

## Desired End State

A user can click "Edit" on any vehicle card, arrive at `/dashboard/vehicles/:id/edit` with a form prefilled from the vehicle's current data, change any of the five identity fields and/or mileage, save, and be returned to the schedule view with the updated values visible. VIN is shown for reference but cannot be changed. Cancelling also returns to the schedule view without any write.

### Key Discoveries

- `VehicleAddComponent` (`vehicle-add.ts:35–49`) defines the exact same form group; the edit form reuses the same validators unchanged.
- `ActivatedRoute` + `VehicleService.getVehicle(id)` is the fetch pattern used in `ScheduleViewComponent` (`schedule-view.ts:75–95`) — follow the same init pattern.
- `MatIconModule` with the `lock` icon is available globally; use it as the suffix on the VIN field to communicate immutability.
- The `VehicleUpdate` type already accepts all editable fields including `current_mileage` and `vin`. The component must **not** include `vin` in the payload sent to `updateVehicle`.

## What We're NOT Doing

- No inline editing on the card or within schedule-view — the dedicated route is the only surface.
- No VIN editing — the field is shown but disabled; it is excluded from the `updateVehicle` payload.
- No AI schedule regeneration on save — schedule regeneration remains an explicit user action.
- No changes to the Supabase schema or RLS policies — `updateVehicle` already enforces ownership at both the application and database layer.

## Implementation Approach

Create a `VehicleEditComponent` that mirrors `VehicleAddComponent` without the VIN decode flow, adds a disabled VIN display field, and calls `updateVehicle` on submit. Wire it to a new `vehicles/:id/edit` route. Add an Edit button to the vehicle card in `vehicle-list.html` that navigates to the new route.

## Critical Implementation Details

- **Route ordering**: Place `vehicles/:id/edit` before `vehicles/:id` in the children array of `app.routes.ts`. Although different segment counts prevent a match conflict, this ordering makes intent explicit and avoids surprises if future routes are added.
- **VIN in payload**: The disabled VIN control's value is accessible via `getRawValue()`. The submit handler must destructure it out and never pass it to `updateVehicle` — the payload must only contain the six editable fields.
- **Form initialisation timing**: `getVehicle()` is async. Initialise the form with empty/null values (same types as the add form) and `patchValue` once the vehicle resolves. This avoids a null-reference on the template before the vehicle loads.

---

## Phase 1: VehicleEditComponent

### Overview

Create the three files of the edit component (`vehicle-edit.ts`, `vehicle-edit.html`, `vehicle-edit.scss`). The component loads the vehicle from the URL parameter, prefills the form, and calls `updateVehicle` on submit.

### Changes Required

#### 1. Component class

**File**: `src/app/vehicles/vehicle-edit/vehicle-edit.ts`

**Intent**: Standalone Angular component that resolves `:id` from `ActivatedRoute`, loads the vehicle via `VehicleService.getVehicle()`, patches a reactive form, and calls `updateVehicle` on submit. Signals drive `isLoading`, `isSubmitting`, and `error` state. On success, navigate to `/dashboard/vehicles/:id`. On cancel, navigate to the same path without writing.

**Contract**: The form group shape mirrors `VehicleAddComponent.form` exactly, with the addition of a `vin` control initialised as `{ value: null, disabled: true }`. The submit handler calls `this.form.getRawValue()`, destructures `vin` out, and passes the remaining six fields to `updateVehicle`. The component selector is `app-vehicle-edit`.

#### 2. Component template

**File**: `src/app/vehicles/vehicle-edit/vehicle-edit.html`

**Intent**: Full-page form identical in structure to `vehicle-add.html`, replacing the VIN decode block with a single disabled `mat-form-field` for VIN that has a `matSuffix` lock icon and a `mat-hint` reading "VIN cannot be changed". The page heading is "Edit car". The submit button label is "Save changes". The cancel anchor links to `/dashboard/vehicles/{{vehicle().id}}`.

**Contract**: Loading state renders `<mat-progress-spinner>` filling the page. The vehicle load error renders an inline error paragraph. The VIN field uses `<mat-icon matSuffix>lock</mat-icon>` and requires `MatIconModule` in the component's `imports` array.

#### 3. Component styles

**File**: `src/app/vehicles/vehicle-edit/vehicle-edit.scss`

**Intent**: Copy `vehicle-add.scss` verbatim — the layout is identical.

### Success Criteria

#### Automated Verification

- `npm run build` compiles without errors
- `npm test` passes (no failures in existing specs)

#### Manual Verification

- Navigating directly to `/dashboard/vehicles/:id/edit` shows the form prefilled with the vehicle's current values
- VIN field is visibly disabled with a lock icon; its value is the vehicle's VIN (or empty if null)
- Submitting the form with a changed make updates the vehicle and redirects to the schedule view showing the new make
- Cancelling redirects to the schedule view without any change

**Implementation Note**: After Phase 1 automated checks pass, manually verify the prefill, VIN lock, and round-trip save before starting Phase 2.

---

## Phase 2: Route and Entry Point

### Overview

Register the new route in `app.routes.ts` and add an Edit button to the vehicle card in `vehicle-list.html` that navigates to the edit page.

### Changes Required

#### 1. New route

**File**: `src/app/app.routes.ts`

**Intent**: Register `vehicles/:id/edit` as a lazy-loaded child route under `/dashboard`, before the existing `vehicles/:id` entry.

**Contract**:
```typescript
{
  path: 'vehicles/:id/edit',
  loadComponent: () =>
    import('./vehicles/vehicle-edit/vehicle-edit').then((m) => m.VehicleEditComponent),
},
```
Insert this object at line 32, immediately before the `vehicles/:id` route.

#### 2. Edit button in vehicle list

**File**: `src/app/vehicles/vehicle-list/vehicle-list.html`

**Intent**: Add an "Edit" stroked button inside `mat-card-actions` for each vehicle card, next to the existing Delete button. Clicking it must not trigger `openVehicle`.

**Contract**: The button calls `editCar($event, v.id)` with `event.stopPropagation()` to prevent card-click navigation. Place it before the Delete button. Use `mat-stroked-button` without a colour attribute (neutral style).

#### 3. `editCar` method

**File**: `src/app/vehicles/vehicle-list/vehicle-list.ts`

**Intent**: Add a method `editCar(event: MouseEvent, id: string): void` that stops event propagation and navigates to `/dashboard/vehicles/:id/edit`.

### Success Criteria

#### Automated Verification

- `npm run build` compiles without errors
- `npm test` passes

#### Manual Verification

- Each vehicle card shows an Edit button alongside Delete
- Clicking Edit navigates to the edit form for that vehicle without opening the schedule view
- Clicking the card body (outside the buttons) still opens the schedule view

**Implementation Note**: After verifying the entry point and routing manually, proceed to Phase 3.

---

## Phase 3: Unit Tests

### Overview

Write a Vitest spec for `VehicleEditComponent` covering the key behavioural contracts.

### Changes Required

#### 1. Spec file

**File**: `src/app/vehicles/vehicle-edit/vehicle-edit.spec.ts`

**Intent**: Test the component in Angular `TestBed` with `VehicleService` and `Router` mocked. Cover: form is prefilled from the loaded vehicle; VIN control is disabled; submit calls `updateVehicle` with the correct payload (no VIN); successful update navigates to schedule view; service error is displayed; cancel navigates without calling `updateVehicle`.

**Contract**: Mock `VehicleService` with `{ getVehicle: vi.fn(), updateVehicle: vi.fn() }`. Provide `ActivatedRoute` with a `paramMap` observable emitting `{ id: 'test-id' }`. Use `provideRouter([])` with disabled initial navigation (same pattern as `auth.guard.spec.ts:14–20`). Assert `updateVehicle` is called with an object that does **not** contain a `vin` key.

### Success Criteria

#### Automated Verification

- `npm test` passes with all new spec cases green
- No existing spec regressions

#### Manual Verification

- N/A — this phase is fully automated

---

## Testing Strategy

### Unit Tests

- `vehicle-edit.spec.ts` covers: prefill, VIN disabled, submit payload shape, navigation on success, error display, cancel navigation

### Manual Testing Steps

1. Add a vehicle, then click Edit — verify all fields prefill correctly including mileage
2. Change the make and save — verify the card in the list shows the new make
3. Edit a vehicle that has no VIN — verify the VIN field shows empty and disabled
4. Edit a vehicle that has a VIN — verify the VIN field shows the VIN with lock icon
5. Submit with a blank required field — verify validation errors appear and submit is blocked
6. Click Cancel from the edit form — verify you land on the schedule view with no changes applied

## References

- FR-009 definition: `context/foundation/prd.md:85–93`
- `VehicleService.updateVehicle`: `src/app/core/vehicles/vehicle.service.ts:47–59`
- `VehicleUpdate` type: `src/app/core/models/vehicle.model.ts:19`
- Add form (reference shape): `src/app/vehicles/vehicle-add/vehicle-add.ts`
- Add form template (reference shape): `src/app/vehicles/vehicle-add/vehicle-add.html`
- Route config: `src/app/app.routes.ts`
- Vehicle list entry point: `src/app/vehicles/vehicle-list/vehicle-list.ts:46–58`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: VehicleEditComponent

#### Automated

- [x] 1.1 `npm run build` compiles without errors — 128ee7a
- [x] 1.2 `npm test` passes (no regressions) — 128ee7a

#### Manual

- [x] 1.3 Navigating to `/dashboard/vehicles/:id/edit` shows form prefilled with vehicle's current values — 128ee7a
- [x] 1.4 VIN field is disabled with lock icon — 128ee7a
- [x] 1.5 Saving a change updates the vehicle and redirects to schedule view — 128ee7a
- [x] 1.6 Cancel redirects to schedule view without any write — 128ee7a

### Phase 2: Route and Entry Point

#### Automated

- [x] 2.1 `npm run build` compiles without errors — bada794
- [x] 2.2 `npm test` passes — bada794

#### Manual

- [x] 2.3 Each vehicle card shows an Edit button alongside Delete — bada794
- [x] 2.4 Clicking Edit navigates to the edit form (not the schedule view) — bada794
- [x] 2.5 Clicking the card body still opens the schedule view — bada794

### Phase 3: Unit Tests

#### Automated

- [x] 3.1 `npm test` passes with all new `vehicle-edit.spec.ts` cases green — cbccb2d
- [x] 3.2 No regressions in existing specs — cbccb2d
