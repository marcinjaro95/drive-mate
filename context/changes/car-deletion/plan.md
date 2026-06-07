# Car Deletion Implementation Plan

## Overview

Wire the existing `VehicleService.deleteVehicle()` into the UI by building a shared `ConfirmDialogComponent` and adding delete entry points to both the list (per-card button) and detail (schedule-view header button) views. The dialog owns the async delete lifecycle so that loading and error state stay inside it, away from the host components.

## Current State Analysis

- `VehicleService.deleteVehicle(id)` is fully implemented and RLS-guarded at `src/app/core/vehicles/vehicle.service.ts:61`
- The DB schema defines `ON DELETE CASCADE` on `service_records.vehicle_id → vehicles(id)` (`supabase/migrations/20260604000000_init_schema.sql:61`) — service records are cleaned up by Postgres automatically; no app-layer cascade needed
- No delete button or handler exists in `VehicleListComponent` or `ScheduleViewComponent`
- No `MatDialog` or any confirmation pattern exists anywhere in the codebase
- `provideAnimationsAsync()` is already in `app.config.ts` — MatDialog requires no config change
- No `src/app/shared/` directory exists yet

### Key Discoveries:

- `vehicle-list.html:15` — each card has `(click)="openVehicle(v.id)"`, so a delete button inside the card must call `event.stopPropagation()`
- `vehicle.service.ts:61-70` — `deleteVehicle` throws on error (follows the data-service contract from `lessons.md`)
- No existing Vitest spec files for either component

## Desired End State

- A "Delete" button appears on each vehicle card in the list and in the vehicle header on the schedule-view page
- Clicking Delete opens a Material dialog naming the vehicle and warning that service records will also be deleted
- The dialog shows a spinner while the delete is in flight and an inline error if it fails (dialog stays open, user can retry or cancel)
- On success: the card is removed in-place from the list signal (from list view) or the user is navigated to `/dashboard` (from detail view)

### Key Discoveries:

- VehicleService: `src/app/core/vehicles/vehicle.service.ts:61`
- DB cascade: `supabase/migrations/20260604000000_init_schema.sql:61`
- VehicleListComponent: `src/app/vehicles/vehicle-list/vehicle-list.ts`
- ScheduleViewComponent: `src/app/vehicles/schedule-view/schedule-view.ts`

## What We're NOT Doing

- App-layer service-record deletion — Postgres cascade handles it
- MatSnackBar success toast — not in scope; no snackbar infrastructure
- Undo / soft delete — permanent hard delete only
- Bulk deletion
- Vitest spec for `ConfirmDialogComponent` — pure UI, no domain logic to test

## Implementation Approach

Build a single reusable `ConfirmDialogComponent` that accepts an async `onConfirm` callback via `MAT_DIALOG_DATA` and owns the loading/error lifecycle. Both host components open the dialog and pass a closure that calls `vehicleService.deleteVehicle()` plus the appropriate post-success side effect. This keeps all async delete state inside the dialog rather than splitting it across host and dialog.

## Critical Implementation Details

**Event propagation**: The delete button on a list card lives inside a `<mat-card>` that has `(click)="openVehicle(v.id)"`. The `deleteCar` method must call `event.stopPropagation()` before opening the dialog; otherwise the navigation fires simultaneously.

**`onConfirm` is called inside the dialog**: The signal mutation (`vehicles.update`) and the router navigation happen inside the `onConfirm` callback, which runs before `dialogRef.close()`. Do not attempt to read `afterClosed()` in the host and react there — that adds async complexity for no benefit and makes the error-in-dialog path impossible to implement cleanly.

---

## Phase 1: ConfirmDialogComponent

### Overview

Create the shared dialog component and its template. No existing files are modified in this phase.

### Changes Required:

#### 1. Dialog component

**File**: `src/app/shared/confirm-dialog/confirm-dialog.ts`

**Intent**: Standalone Angular component that accepts a title, message, and async `onConfirm` callback; renders Cancel and Delete buttons; handles loading and error state internally.

**Contract**: Inject `MAT_DIALOG_DATA` typed as:
```ts
{ title: string; message: string; confirmLabel?: string; onConfirm: () => Promise<void> }
```
Inject `MatDialogRef<ConfirmDialogComponent>`. Declare two signals: `isDeleting = signal(false)` and `error = signal<string | null>(null)`. The confirm handler sets `isDeleting(true)`, calls `data.onConfirm()`, on success calls `dialogRef.close()`, on error sets `error` to the message and resets `isDeleting(false)`. The cancel handler calls `dialogRef.close()` immediately (disabled while `isDeleting()`). Imports: `MatDialogModule`, `MatButtonModule`, `MatProgressSpinnerModule`.

#### 2. Dialog template

**File**: `src/app/shared/confirm-dialog/confirm-dialog.html`

**Intent**: Render the dialog header, body (message + conditional error), and action buttons with correct disabled/loading states.

**Contract**: Structure:
- `<h2 mat-dialog-title>` — `data.title`
- `<mat-dialog-content>` — `data.message` paragraph; when `error()` is non-null, a second paragraph styled as an error
- `<mat-dialog-actions align="end">` — "Cancel" flat button (disabled when `isDeleting()`); confirm button labeled `data.confirmLabel ?? 'Delete'`, `color="warn"`, disabled when `isDeleting()`; when `isDeleting()` the button shows a `<mat-progress-spinner mode="indeterminate" diameter="20">` instead of the label

### Success Criteria:

#### Automated Verification:

- `npm run build` compiles without errors

#### Manual Verification:

- Dialog can be opened (via a temporary button or browser devtools) and renders title, message, Cancel and Delete buttons
- Cancel closes the dialog immediately

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Delete on VehicleListComponent

### Overview

Add a delete button to each vehicle card and wire it through the confirm dialog. On confirm, the service call runs and the card is removed from the local signal.

### Changes Required:

#### 1. VehicleListComponent class

**File**: `src/app/vehicles/vehicle-list/vehicle-list.ts`

**Intent**: Inject `MatDialog`, add a `deleteCar` method that stops click propagation, opens the confirm dialog, and passes a callback that deletes the vehicle and removes it from the signal.

**Contract**: Add `inject(MatDialog)` to existing injections. Add `MatDialogModule` to the component `imports` array. Add method:
```ts
deleteCar(event: MouseEvent, vehicle: Vehicle): void {
  event.stopPropagation();
  this.dialog.open(ConfirmDialogComponent, {
    data: {
      title: `Delete ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      message: `Deleting this car will also permanently remove all its service records. This cannot be undone.`,
      onConfirm: async () => {
        await this.vehicleService.deleteVehicle(vehicle.id);
        this.vehicles.update(list => list.filter(c => c.id !== vehicle.id));
      },
    },
  });
}
```

#### 2. VehicleListComponent template

**File**: `src/app/vehicles/vehicle-list/vehicle-list.html`

**Intent**: Add a "Delete" action button inside each vehicle card that calls `deleteCar` with the click event (for propagation stop) and the vehicle object.

**Contract**: Inside each `<mat-card>`, after the `@if (v.current_mileage !== null)` block, add:
```html
<mat-card-actions>
  <button mat-stroked-button color="warn" (click)="deleteCar($event, v)">Delete</button>
</mat-card-actions>
```

### Success Criteria:

#### Automated Verification:

- `npm run build` compiles without errors
- `npm test` passes (no regressions)

#### Manual Verification:

- "Delete" button appears on each vehicle card
- Clicking Delete opens the confirmation dialog with the correct vehicle name and the service-records cascade warning
- Clicking card body (not Delete) still navigates into the vehicle — event propagation is stopped correctly
- Confirming deletes the car; the card disappears from the list immediately (no page reload)
- Cancelling closes the dialog; the car remains
- When the service throws (temporarily break `deleteVehicle`), the dialog stays open and shows the error message

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Delete on ScheduleViewComponent

### Overview

Add a "Delete car" button to the vehicle detail page. On confirm, the vehicle is deleted and the user is navigated to `/dashboard`.

### Changes Required:

#### 1. ScheduleViewComponent class

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Inject `MatDialog`, add an `openDeleteDialog` method that opens the confirm dialog with a callback that deletes the vehicle and navigates away.

**Contract**: Add `inject(MatDialog)` to existing injections. Add `MatDialogModule` to component `imports`. Add method:
```ts
openDeleteDialog(): void {
  const v = this.vehicle();
  if (!v) return;
  this.dialog.open(ConfirmDialogComponent, {
    data: {
      title: `Delete ${v.year} ${v.make} ${v.model}`,
      message: `Deleting this car will also permanently remove all its service records. This cannot be undone.`,
      onConfirm: async () => {
        await this.vehicleService.deleteVehicle(v.id);
        await this.router.navigate(['/dashboard']);
      },
    },
  });
}
```

#### 2. ScheduleViewComponent template

**File**: `src/app/vehicles/schedule-view/schedule-view.html`

**Intent**: Add a "Delete car" button to the vehicle header area, visible when the vehicle is loaded.

**Contract**: Inside the `@if (v)` block in the `vehicle-header` div, add after the `<p>` line:
```html
<button mat-stroked-button color="warn" (click)="openDeleteDialog()">Delete car</button>
```

### Success Criteria:

#### Automated Verification:

- `npm run build` compiles without errors
- `npm test` passes

#### Manual Verification:

- "Delete car" button appears in the vehicle header on the schedule-view page
- Dialog opens with the correct vehicle name and cascade warning
- Confirming deletes the car and navigates to `/dashboard`; the car is no longer visible in the list
- Cancelling dismisses the dialog and the user stays on the schedule-view page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Tests

### Overview

Write Vitest specs for the delete flow in both host components. Cover: dialog opens with correct data, `onConfirm` mutates state or navigates, cancel does nothing, service error propagates through `onConfirm`.

### Changes Required:

#### 1. VehicleListComponent spec

**File**: `src/app/vehicles/vehicle-list/vehicle-list.spec.ts`

**Intent**: Verify that `deleteCar` opens the dialog with the correct vehicle title in `data`, that `onConfirm` removes the vehicle from the list signal, and that a service error thrown inside `onConfirm` propagates to the caller (so the dialog can display it).

**Contract**: Configure `TestBed` with `provideAnimationsAsync()` and `provideRouter([])`. Stub `MatDialog` with a spy on `open` that returns a mock `MatDialogRef`. Test cases:
1. `deleteCar(mouseEvent, vehicle)` calls `dialog.open` with `data.title` containing the vehicle's make and model
2. Capturing and calling the `data.onConfirm` callback invokes `vehicleService.deleteVehicle(vehicle.id)`
3. After `onConfirm` resolves, `component.vehicles()` no longer contains the deleted vehicle
4. When `vehicleService.deleteVehicle` rejects, `onConfirm()` rejects (error propagates — dialog will catch and display it)

#### 2. ScheduleViewComponent spec

**File**: `src/app/vehicles/schedule-view/schedule-view.spec.ts`

**Intent**: Verify that `openDeleteDialog` opens the dialog with correct vehicle data, that `onConfirm` calls `deleteVehicle` and navigates, and that a service error propagates.

**Contract**: Same stub pattern as above. Test cases:
1. `openDeleteDialog()` calls `dialog.open` with `data.title` containing the vehicle's make and model
2. Calling `data.onConfirm` invokes `vehicleService.deleteVehicle(vehicle.id)` and `router.navigate(['/dashboard'])`
3. When `vehicleService.deleteVehicle` rejects, `onConfirm()` rejects

### Success Criteria:

#### Automated Verification:

- `npm test` reports all new specs passing
- `npm run build` compiles without errors

#### Manual Verification:

- Test descriptions read clearly in `npm test` output
- No unexpected console errors in the test runner

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `VehicleListComponent`: dialog opens with correct data, `onConfirm` removes vehicle from signal, error propagation
- `ScheduleViewComponent`: dialog opens with correct data, `onConfirm` deletes + navigates, error propagation

### Manual Testing Steps:

1. Open the car list — each card shows a "Delete" button
2. Click Delete on a card — dialog appears with car name and service-record warning
3. Click Cancel — dialog closes, car still in list, card is still clickable (navigates normally)
4. Click Delete in dialog — spinner appears, car disappears from list on success
5. Open a car's schedule-view — "Delete car" button visible in the header
6. Click Delete car — same dialog; confirm navigates to `/dashboard` with car gone from list
7. Temporarily make `deleteVehicle` throw — confirm that the dialog stays open and shows the error message

## Performance Considerations

None — single-row Supabase delete with no client-side caching layer to invalidate.

## References

- `VehicleService.deleteVehicle`: `src/app/core/vehicles/vehicle.service.ts:61`
- DB cascade definition: `supabase/migrations/20260604000000_init_schema.sql:61`
- Error contract (data services throw): `context/foundation/lessons.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: ConfirmDialogComponent

#### Automated

- [ ] 1.1 npm run build compiles without errors

#### Manual

- [ ] 1.2 Dialog renders correctly when opened and shows title, message, Cancel and Delete buttons
- [ ] 1.3 Cancel closes the dialog immediately

### Phase 2: Delete on VehicleListComponent

#### Automated

- [ ] 2.1 npm run build compiles without errors
- [ ] 2.2 npm test passes (no regressions)

#### Manual

- [ ] 2.3 Delete button appears on each vehicle card
- [ ] 2.4 Clicking Delete opens the confirmation dialog with correct vehicle name and cascade warning
- [ ] 2.5 Clicking card body still navigates into the vehicle
- [ ] 2.6 Confirming deletes the car and removes the card immediately from the list
- [ ] 2.7 Cancelling closes the dialog; the car remains
- [ ] 2.8 A service error keeps the dialog open and shows the error message

### Phase 3: Delete on ScheduleViewComponent

#### Automated

- [ ] 3.1 npm run build compiles without errors
- [ ] 3.2 npm test passes

#### Manual

- [ ] 3.3 Delete car button appears in the vehicle header on the schedule-view page
- [ ] 3.4 Dialog opens with correct vehicle name and cascade warning
- [ ] 3.5 Confirming deletes the car and navigates to /dashboard; car absent from list
- [ ] 3.6 Cancelling keeps the user on the schedule-view page

### Phase 4: Tests

#### Automated

- [ ] 4.1 npm test reports all new specs passing
- [ ] 4.2 npm run build compiles without errors

#### Manual

- [ ] 4.3 Test descriptions read clearly in npm test output
- [ ] 4.4 No unexpected console errors in the test runner
