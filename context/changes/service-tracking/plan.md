# Service Tracking (FR-006 Mark as Done) Implementation Plan

## Overview

Add a "Mark as done" inline expand form to each schedule item card in `ScheduleViewComponent`. Submitting the form creates a `ServiceRecord` and optionally updates the vehicle's odometer reading. A `MatDialog` confirmation dialog appears after each successful save prompting the user to regenerate the schedule.

## Current State Analysis

- `ServiceRecordService` is fully implemented with CRUD operations at `src/app/core/service-records/service-record.service.ts`
- `ServiceRecordService.getServiceRecords(vehicleId)` returns records sorted by `service_date DESC` at `service-record.service.ts:13`
- `ServiceRecord` model has all required fields: `service_date`, `mileage`, `label`, `notes` at `src/app/core/models/service-record.model.ts`
- `ScheduleViewComponent` renders schedule items as `mat-card` cards with no user interaction — the natural host for the expand action at `src/app/vehicles/schedule-view/schedule-view.ts`
- `VehicleService.updateVehicle()` exists for the mileage sync step at `src/app/core/vehicles/vehicle.service.ts:47`
- `AiScheduleService.generateAndSave(vehicle, signal?)` builds the AI prompt via private `buildPrompt(vehicle)` at `src/app/core/ai-schedule/ai-schedule.service.ts:10` — currently no service history is passed
- No DB migration needed; `service_records` table and RLS policies are already live

## Desired End State

User visits the schedule view for a car, clicks "Mark as done" on any schedule item, fills in service date (pre-filled with today's date) and mileage (pre-filled with current odometer), optionally adds notes, and saves. The vehicle's odometer is updated if the entered mileage is higher than the stored value. A `MatDialog` opens after save with "Regenerate" and "Dismiss" actions.

### Key Discoveries:

- `schedule-view.ts:8-16` — already injects `VehicleService` and `AiScheduleService` via `inject()`; adding `ServiceRecordService` follows the same pattern
- `schedule-view.html:43` — `@for` over `scheduleItems()` renders each card; the inline form fits inside the card below `mat-card-content`
- `vehicle-add.ts:30-37` — `FormBuilder.group()` with typed `null` defaults is the established reactive form pattern in this project
- `service-record.service.ts:35-46` — `createServiceRecord` stamps `user_id` from auth; caller passes `vehicle_id`, `service_date`, `mileage`, `label`, `notes`
- `vehicle.service.ts:47-59` — `updateVehicle()` filters by both `id` and `user_id`; safe to call for the mileage sync

## What We're NOT Doing

- FR-007 (service history list) — deferred to the next change
- FR-008 (edit service record) — deferred
- Auto-regenerating the AI schedule on save — only a dismissable prompt; no automatic API call
- Adding a new route
- Any DB migration

## Implementation Approach

Extend `ScheduleViewComponent` with a `FormBuilder`-backed inline form, four new signals (`expandedItem`, `isSaving`, `saveError`, `mileageSyncWarning`), and a `saveMarkDone()` method that sequences `ServiceRecordService.createServiceRecord()` then a conditional `VehicleService.updateVehicle()`. The template expands the active card with form fields and save/cancel controls.

`generateSchedule()` is updated to fetch current service records via `getServiceRecords` and pass them to `generateAndSave` before every AI call — both on initial load and on user-triggered regen. `AiScheduleService.generateAndSave` gains an optional `serviceRecords` parameter; `buildPrompt` appends a "Service history" section listing completed services so the AI can adjust `next_due_km` and `next_due_date` accordingly.

## Phase 1: Inline mark-done form in ScheduleViewComponent

### Overview

Extend `ScheduleViewComponent` with the full "Mark as done" interaction: expand/collapse per card, form with date and mileage, save flow with two service calls and partial-failure handling, regen prompt, and mileage sync warning.

### Changes Required:

#### 1. Component class

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Add `ServiceRecordService`, `FormBuilder`, `MatDialog`, and `MatSnackBar` injections, the `markDoneForm` reactive group, four new signals, and three new methods (`openMarkDone`, `cancelMarkDone`, `saveMarkDone`). Update `generateSchedule()` to fetch service records before the AI call. Add `ReactiveFormsModule`, `MatFormFieldModule`, `MatInputModule`, `MatDialogModule`, and `MatSnackBarModule` to the component's `imports` array.

**Contract**:

New signals added as class fields:
- `expandedItem = signal<ScheduleItem | null>(null)` — which card is currently open; `null` means none
- `isSaving = signal(false)` — disables form controls during the async save sequence
- `saveError = signal<string | null>(null)` — inline error message if `createServiceRecord` throws
- `mileageSyncWarning = signal(false)` — shown when `updateVehicle` fails; non-blocking

Mark-done form (field `fb = inject(FormBuilder)` initialised before the form):
- `service_date: string` — `Validators.required`; pre-filled with today as `YYYY-MM-DD`
- `mileage: number | null` — `Validators.required`, `Validators.min(0)`; pre-filled with `vehicle().current_mileage ?? null`
- `notes: string | null` — no validators (optional)

`generateSchedule()` (updated): before calling `aiScheduleService.generateAndSave`, fetches `await serviceRecordService.getServiceRecords(vehicle()!.id)` and passes the result as the third argument. Errors from the fetch are non-blocking — on failure an empty array is used so schedule generation can still proceed.

`openMarkDone(item: ScheduleItem)`: resets form with today's date and vehicle's current mileage, clears `saveError`, sets `expandedItem(item)`.

`cancelMarkDone()`: sets `expandedItem(null)`, clears `saveError`.

`saveMarkDone()`:
1. Return if `markDoneForm.invalid` or `isSaving()` is true.
2. Set `isSaving(true)`, clear `saveError`.
3. Call `createServiceRecord({ vehicle_id: vehicle()!.id, label: expandedItem()!.item, service_date, mileage, notes: notes || null })`.
4. If step 3 throws: set `saveError`, unset `isSaving`, return (do not proceed).
5. If entered mileage > `vehicle()!.current_mileage ?? 0`, call `updateVehicle(vehicle()!.id, { current_mileage: mileage })`:
   - On success: update `vehicle` signal with the returned value.
   - On failure (catch): set `mileageSyncWarning(true)`.
6. Set `expandedItem(null)`, `isSaving(false)`.
7. Show `MatSnackBar` with message `"${item.item} recorded — ${service_date}, ${mileage} km"`, no action, duration 4000 ms.
8. Open `ConfirmDialogComponent` via `MatDialog` with: `title: 'Regenerate schedule?'`, `message: 'Service recorded. The AI schedule may be outdated — regenerate now to reflect the latest service history.'`, `confirmLabel: 'Regenerate'`, `onConfirm: async () => { await this.generateSchedule(); }`. "Cancel" in the dialog dismisses without regenerating.

#### 2. AiScheduleService

**File**: `src/app/core/ai-schedule/ai-schedule.service.ts`

**Intent**: Extend `generateAndSave` to accept an optional `serviceRecords` list and pass it to `buildPrompt`, so the AI prompt includes completed service history when regenerating after a mark-done event.

**Contract**:

`generateAndSave(vehicle: Vehicle, signal?: AbortSignal, serviceRecords: ServiceRecord[] = []): Promise<ScheduleItem[]>` — signature unchanged for existing callers; third param defaults to `[]`.

`buildPrompt(vehicle: Vehicle, serviceRecords: ServiceRecord[] = []): string` — prompt is in English. Appends a "Service history" block after the vehicle fields. Format:

- If `serviceRecords.length > 0`:
  ```
  Service history (n record[s]):
  - {label} ({service_date}, {mileage} km[, {notes}])
  ```
  Listed in the same `service_date DESC` order returned by `getServiceRecords`. `mileage` printed as `{n} km`; if `null`, print `mileage unknown`. Notes appended only if non-null.
- If empty: `No service history.`

The rules block includes: `- Use the service history to adjust "next_due_km" and "next_due_date" for each item`.

`ServiceRecord` type imported from `../models/service-record.model`.

#### 3. Component template

**File**: `src/app/vehicles/schedule-view/schedule-view.html`


**Intent**: Add a "Mark as done" button to each schedule card, a conditional inline form inside the expanded card, and one post-save banner (mileage sync warning). The regen prompt is handled by a `MatDialog` opened from the component class, not from the template.

**Contract**:

Inside the `@for (item of scheduleItems(); track item.item)` loop, after `</mat-card-content>`:
- Add `<mat-card-actions>` with a `mat-button` "Mark as done" shown when `expandedItem()?.item !== item.item`.
- Inside `mat-card-content`, add `@if (expandedItem()?.item === item.item)` block containing:
  - `<form [formGroup]="markDoneForm">` with:
    - `mat-form-field` → `<input type="date" matInput formControlName="service_date">` (required; error shown if touched and invalid)
    - `mat-form-field` → `<input type="number" matInput formControlName="mileage" min="0">` (required; error shown if touched and invalid)
    - `mat-form-field` → `<textarea matInput formControlName="notes">` (optional; no error)
  - Inline error `@if (saveError())` paragraph.
  - Save button (`mat-raised-button color="primary"`, `[disabled]="isSaving()"`, calls `saveMarkDone()`).
  - Cancel button (`mat-button`, `[disabled]="isSaving()"`, calls `cancelMarkDone()`).

After the `</div>` closing the `schedule-list`:
- `@if (mileageSyncWarning())` banner: message "Service recorded, but odometer was not updated." + Dismiss `mat-button` (sets `mileageSyncWarning(false)`).

#### 4. Component styles

**File**: `src/app/vehicles/schedule-view/schedule-view.scss`

**Intent**: Add styles for the inline form container inside the card and for the two post-save banners.

**Contract**: `.mark-done-form` — `padding-top: 16px`; `mat-form-field` blocks stacked vertically. `.mileage-warning` — light background banner with `padding: 12px 16px`, matching the visual weight of the existing `.error-card`. No styles needed for the regen dialog — it uses default `MatDialog` styling.

### Success Criteria:

#### Automated Verification:

- Build passes without errors: `npm run build`
- TypeScript strict check passes: `npx tsc --noEmit`

#### Manual Verification:

- "Mark as done" button appears on each schedule item card; absent until the schedule items load
- Clicking it expands the inline form within that card; all other cards remain unexpanded
- Form pre-fills today's date and the vehicle's current mileage (or blank if no mileage on record)
- Submitting with an empty date or mileage shows a validation error and does not call the service
- Successful save: a new `service_records` row appears in Supabase; vehicle `current_mileage` updates if the entered mileage is higher
- Snackbar appears immediately after save with message `"${label} recorded — ${date}, ${mileage} km"` and auto-dismisses after 4 s
- Regen dialog opens after save; "Regenerate" triggers `generateSchedule()` and closes the dialog; "Cancel" closes without regenerating
- After clicking "Regenerate", the outgoing request to `/api/ai` includes the saved service record(s) in the prompt body (verify in browser DevTools → Network)
- If vehicle mileage update fails (simulate via network tab), record is saved and mileage sync warning appears
- Cancel closes the form without saving; no service calls made

**Implementation Note**: After automated verification passes, pause here for manual testing confirmation before proceeding to Phase 2.

---

## Phase 2: ServiceRecordService spec coverage

### Overview

Review `service-record.service.spec.ts` for gaps in the data shape used by the mark-done flow. Add missing assertions if any are found.

### Changes Required:

#### 1. ServiceRecordService spec

**File**: `src/app/core/service-records/service-record.service.spec.ts`

**Intent**: Confirm `createServiceRecord` tests cover the full mark-done payload (`vehicle_id`, `service_date`, `mileage`, `label`, `notes: null`). Add a test if `notes: null` (optional field passthrough) or `mileage: 0` (minimum boundary) is not already asserted.

**Contract**: Any new test follows the existing `makeRecord()` factory pattern (`spec.ts:8-19`) and `createMockBuilder()` chaining pattern (`spec.ts:41`). At most two new `it` blocks — one for `notes: null` passthrough, one for `mileage: 0` boundary — only if not already present.

### Success Criteria:

#### Automated Verification:

- All tests pass: `npm test`

---

## Testing Strategy

### Unit Tests:

- `service-record.service.spec.ts` — CRUD coverage; notes nullable passthrough; mileage=0 boundary

### Manual Testing Steps:

1. Add a car, navigate to its schedule view
2. Click "Mark as done" on an item — verify inline form expands within that card
3. Leave date or mileage empty, click Save — verify required validation message, no service call
4. Fill both fields and save — verify `service_records` row in Supabase, vehicle `current_mileage` updated
5. Save a second record with lower mileage — verify `current_mileage` is NOT decreased
6. Verify snackbar appears immediately after save with the label, date, and mileage; auto-dismisses after ~4 s
7. Verify regen dialog opens after save; "Regenerate" triggers AI call and closes dialog; "Cancel" closes without regenerating
8. After clicking "Regenerate", open DevTools → Network and confirm the `/api/ai` request body contains the "Service history" section with the newly saved record
9. Fill notes and save — verify `notes` column populated in Supabase
8. Click Cancel — verify no row created, form closes

## Migration Notes

None. `service_records` table and RLS policies are already deployed.

## References

- ServiceRecordService: `src/app/core/service-records/service-record.service.ts`
- ServiceRecord model: `src/app/core/models/service-record.model.ts`
- ScheduleViewComponent: `src/app/vehicles/schedule-view/schedule-view.ts:1`
- VehicleService.updateVehicle: `src/app/core/vehicles/vehicle.service.ts:47`
- AiScheduleService: `src/app/core/ai-schedule/ai-schedule.service.ts`
- VehicleAddComponent (form pattern reference): `src/app/vehicles/vehicle-add/vehicle-add.ts:30`
- Data schema plan: `context/changes/data-schema-rls/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Inline mark-done form in ScheduleViewComponent

#### Automated

- [ ] 1.1 Build passes without errors: `npm run build`
- [ ] 1.2 TypeScript strict check passes: `npx tsc --noEmit`

#### Manual

- [ ] 1.3 "Mark as done" button visible on each loaded schedule card
- [ ] 1.4 Clicking expands inline form; other cards unaffected
- [ ] 1.5 Form pre-fills today's date and vehicle's current mileage
- [ ] 1.6 Empty date/mileage shows validation error; no service call fired
- [ ] 1.7 Successful save creates ServiceRecord row in Supabase and updates current_mileage
- [ ] 1.8 Snackbar appears after save with label, date, and mileage; auto-dismisses after ~4 s
- [ ] 1.9 Regen dialog opens after save; Regenerate triggers AI call and closes dialog; Cancel closes without regenerating
- [ ] 1.10 Mileage sync failure shows non-blocking warning; record still saved
- [ ] 1.11 Cancel closes form without saving
- [ ] 1.12 After Regenerate, /api/ai request body contains "Service history" with saved record(s) (verified in DevTools Network)

### Phase 2: ServiceRecordService spec coverage

#### Automated

- [ ] 2.1 All tests pass: `npm test`
