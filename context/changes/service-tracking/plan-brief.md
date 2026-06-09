# Service Tracking (FR-006 Mark as Done) — Plan Brief

> Full plan: `context/changes/service-tracking/plan.md`

## What & Why

Add a "Mark as done" action to each AI schedule item so users can record when they had a service done. This closes the core tracking loop in the PRD: a user adds their car, gets a schedule, and can now record service events against it — building a service history over time.

## Starting Point

`ScheduleViewComponent` already displays AI-generated schedule items as cards, but is read-only. `ServiceRecordService` and the `service_records` table with RLS are fully implemented — the data layer is ready and needs no changes.

## Desired End State

Each schedule card shows a "Mark as done" button. Clicking it expands an inline form inside the card with a pre-filled date (today) and mileage (vehicle's current odometer). After saving, a `ServiceRecord` is created in Supabase, the vehicle's `current_mileage` is updated if the entered mileage is higher, and a `MatDialog` opens prompting the user to regenerate the schedule ("Regenerate" / "Dismiss").

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Scope | FR-006 only | History list (FR-007) and edit (FR-008) deferred to keep this change focused and shippable |
| Form UX | Inline expansion inside the card | Keeps user in context without a modal; simpler state than a separate route |
| Mileage | Required | Both fields are load-bearing for future schedule recalculation accuracy |
| Mileage sync | Auto-update if higher | Vehicle odometer stays current automatically; matches the AI schedule's expectation |
| Save feedback | `MatSnackBar` (4 s) | Instant, non-blocking confirmation of what was recorded before the regen dialog opens |
| Schedule regen | `ConfirmDialogComponent` via `MatDialog`, not auto | Avoids a surprise AI API call on every mark-done; dialog forces an explicit user choice (Regenerate / Cancel) |
| Error handling | Record-first, non-blocking mileage warning | Service record is the primary data; a failed odometer update is recoverable |
| Testing | Service layer spec only | Component already tested manually; existing ServiceRecordService spec is near-complete |
| Saved state key | item label (`item.item`) | Already the de-facto item identifier in the component; template check is trivial (`savedItems().has(item.item)`) |
| Saved state scope | Component-scoped signal | Ephemeral by design — resets on navigation; no extra infrastructure needed |
| Saved UX | Static "Saved ✓" label, no re-mark | Clear confirmation; re-marking would risk duplicate records; FR-008 handles corrections |

## Scope

**In scope:**
- "Mark as done" button + inline form per schedule card in `ScheduleViewComponent`
- `ServiceRecordService.createServiceRecord()` call on save
- Conditional `VehicleService.updateVehicle()` for mileage sync
- `MatSnackBar` confirmation after save (label + date + mileage, 4 s auto-dismiss)
- `ConfirmDialogComponent` via `MatDialog` for regen prompt (Regenerate / Cancel)
- `ServiceRecordService.getServiceRecords()` fetch inside `generateSchedule()` before every AI call
- `AiScheduleService.generateAndSave` + `buildPrompt` extended to include service history in the AI prompt
- Non-blocking mileage sync warning
- ServiceRecordService spec gap-fill

**Out of scope:**
- FR-007: service history list
- FR-008: edit service record
- New routes
- DB migration (table already exists)

## Architecture / Approach

Changes span `ScheduleViewComponent` (`.ts`, `.html`, `.scss`), `AiScheduleService`, and a spec gap-fill pass. The component gains a `FormBuilder`-backed form group, four new signals tracking expand/save state, and a `saveMarkDone()` method that sequences two service calls. `generateSchedule()` is updated to fetch service records before every AI call and pass them to `AiScheduleService.generateAndSave`. `AiScheduleService.buildPrompt` gains a `serviceRecords` parameter and appends a "Historia serwisowa" block so the AI can adjust `next_due_km` / `next_due_date` based on what's already been done. No routing changes; no new components; no DB migration.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Inline mark-done form | Full user-facing interaction in `ScheduleViewComponent` | Two-call save (record + mileage) needs careful error handling to avoid silent failures |
| 2. Spec coverage | `ServiceRecordService` spec verified and gap-filled | Minor — mostly verification; spec is already broad |
| 3. Session-persistent "Saved ✓" | Cards show "Saved ✓" after save for the rest of the page visit | None — single signal + template branch |

**Prerequisites:** Car-add-ai-schedule change must be merged (schedule view must exist and load items)
**Estimated effort:** ~1 session across 3 phases (Phases 1 & 2 already implemented)

## Open Risks & Assumptions

- `MatFormFieldModule` and `MatInputModule` are already available via Angular Material — confirmed by `vehicle-add.ts` usage; no new package installs needed
- `<input type="date">` renders adequately on mobile browsers at 375px — assumed; no datepicker adapter required

## Success Criteria (Summary)

- User can mark any schedule item as done from the schedule view without leaving the page
- The resulting `ServiceRecord` row appears in Supabase with correct `vehicle_id`, `user_id`, `service_date`, `mileage`, and `label`
- Vehicle `current_mileage` updates when the saved mileage exceeds the prior value
- Snackbar appears after save with the recorded label, date, and mileage
- After "Regenerate", the `/api/ai` prompt body contains the "Service history" section with all saved records for that vehicle
