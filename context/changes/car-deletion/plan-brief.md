# Car Deletion — Plan Brief

> Full plan: `context/changes/car-deletion/plan.md`

## What & Why

Add a delete action for cars so users can permanently remove a vehicle they no longer own or entered by mistake. The backend service method and database RLS policy already exist; this plan wires them into the UI through a reusable confirmation dialog.

## Starting Point

`VehicleService.deleteVehicle(id)` is fully implemented and throws on error (`vehicle.service.ts:61`). Neither the list view nor the detail view has any delete button or handler. No confirmation dialog infrastructure exists in the app.

## Desired End State

Users can delete a car from both the vehicle list (per-card Delete button) and the schedule-view detail page (Delete car button in the header). Before the deletion executes, a Material dialog names the vehicle and explicitly warns that all service records will also be permanently deleted. The dialog shows a spinner during the operation and keeps itself open with an error message if the server rejects the request.

## Key Decisions Made

| Decision                     | Choice                                                 | Why (1 sentence)                                                                      | Source |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------ |
| Where delete button appears  | Both list card + schedule-view                         | Power users skip navigating into a car just to delete it                              | Plan   |
| Confirmation UX              | MatDialog modal                                        | Standard Material pattern; clear focus surface with no ambiguity                      | Plan   |
| Cascade warning copy         | Explicit — mentions service records                    | Users deserve informed consent before permanent data loss                             | Plan   |
| Post-delete from list        | Remove card in-place via signal                        | No network round-trip; matches existing signals pattern in the list                   | Plan   |
| Post-delete from detail      | Navigate to /dashboard                                 | Avoids showing stale data on a page for a vehicle that no longer exists               | Plan   |
| Error display                | Inline in the dialog                                   | User stays in context and can retry without reopening the dialog                      | Plan   |
| Who owns the async lifecycle | ConfirmDialogComponent                                 | Keeps loading + error state co-located; avoids splitting state across host and dialog | Plan   |
| Test scope                   | Component tests only; skip ConfirmDialogComponent spec | Tests the integration that matters; dialog is pure UI                                 | Plan   |

## Scope

**In scope:**

- New `ConfirmDialogComponent` in `src/app/shared/confirm-dialog/`
- Delete button on each vehicle card in `VehicleListComponent`
- Delete car button in vehicle header in `ScheduleViewComponent`
- Vitest specs for both host components

**Out of scope:**

- App-layer service-record deletion (Postgres cascade handles it)
- MatSnackBar success toast
- Soft delete / undo
- Bulk deletion
- `ConfirmDialogComponent` Vitest spec

## Architecture / Approach

`ConfirmDialogComponent` is a standalone Angular component opened via `MatDialog.open()` by both host components. It receives the vehicle's display name, the warning message, and an `onConfirm: () => Promise<void>` callback via `MAT_DIALOG_DATA`. The callback is a closure in the host that calls `vehicleService.deleteVehicle(id)` plus the appropriate side effect (signal mutation or router navigation). The dialog calls the callback on confirm click, owns the `isDeleting` and `error` signals, and closes itself on success.

The delete button on the list card calls `event.stopPropagation()` to prevent the card's click-to-navigate handler from firing.

## Phases at a Glance

| Phase                              | What it delivers                                       | Key risk                                                  |
| ---------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| 1. ConfirmDialogComponent          | Reusable dialog with loading + error lifecycle         | MatDialog setup / animation provider already required     |
| 2. Delete on VehicleListComponent  | Delete button on each card; signal mutation on success | event.stopPropagation() needed to prevent card navigation |
| 3. Delete on ScheduleViewComponent | Delete button in vehicle header; navigation on success | Must guard against null vehicle signal                    |
| 4. Tests                           | Vitest specs for both host component delete flows      | MatDialog stub setup in TestBed                           |

**Prerequisites:** `provideAnimationsAsync()` is already in `app.config.ts`. No new providers needed.
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- MatDialog requires `provideAnimationsAsync()` — confirmed present in `app.config.ts:3`
- DB cascade deletes service records atomically with the vehicle — verified in migration file; no app-layer cleanup needed
- The `onConfirm` approach (passing an async callback into dialog data) is idiomatic for standalone Angular Material but may surprise reviewers expecting `afterClosed()` observable handling

## Success Criteria (Summary)

- Deleting a car from the list removes it immediately from the UI without a page reload
- Deleting a car from the detail page navigates the user to `/dashboard`
- A service-layer error keeps the dialog open with a human-readable error message
