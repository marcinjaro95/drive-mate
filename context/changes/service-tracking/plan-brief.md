# Service Tracking (FR-006 Mark as Done) — Plan Brief

> Full plan: `context/changes/service-tracking/plan.md`

## What & Why

Add a "Mark as done" action to each AI schedule item so users can record when they had a service done. This closes the core tracking loop in the PRD: a user adds their car, gets a schedule, and can now record service events against it — building a service history over time.

## Starting Point

`ScheduleViewComponent` already displays AI-generated schedule items as cards, but is read-only. `ServiceRecordService` and the `service_records` table with RLS are fully implemented — the data layer is ready and needs no changes.

## Desired End State

Each schedule card shows a "Mark as done" button. Clicking it expands an inline form inside the card with a pre-filled date (today) and mileage (vehicle's current odometer). After saving, a `ServiceRecord` is created in Supabase, the vehicle's `current_mileage` is updated if the entered mileage is higher, and a dismissable banner prompts the user to regenerate the schedule.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Scope | FR-006 only | History list (FR-007) and edit (FR-008) deferred to keep this change focused and shippable |
| Form UX | Inline expansion inside the card | Keeps user in context without a modal; simpler state than a separate route |
| Mileage | Required | Both fields are load-bearing for future schedule recalculation accuracy |
| Mileage sync | Auto-update if higher | Vehicle odometer stays current automatically; matches the AI schedule's expectation |
| Schedule regen | Dismissable prompt, not auto | Avoids a surprise AI API call on every mark-done; user decides when to refresh |
| Error handling | Record-first, non-blocking mileage warning | Service record is the primary data; a failed odometer update is recoverable |
| Testing | Service layer spec only | Component already tested manually; existing ServiceRecordService spec is near-complete |

## Scope

**In scope:**
- "Mark as done" button + inline form per schedule card in `ScheduleViewComponent`
- `ServiceRecordService.createServiceRecord()` call on save
- Conditional `VehicleService.updateVehicle()` for mileage sync
- Regen prompt banner (dismissable)
- Non-blocking mileage sync warning
- ServiceRecordService spec gap-fill

**Out of scope:**
- FR-007: service history list
- FR-008: edit service record
- New routes
- DB migration (table already exists)

## Architecture / Approach

All changes are confined to `ScheduleViewComponent` (`.ts`, `.html`, `.scss`) plus a spec gap-fill pass. The component gains a `FormBuilder`-backed form group, five new signals tracking expand/save/prompt state, and a `saveMarkDone()` method that sequences two service calls. No routing changes; no new components.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Inline mark-done form | Full user-facing interaction in `ScheduleViewComponent` | Two-call save (record + mileage) needs careful error handling to avoid silent failures |
| 2. Spec coverage | `ServiceRecordService` spec verified and gap-filled | Minor — mostly verification; spec is already broad |

**Prerequisites:** Car-add-ai-schedule change must be merged (schedule view must exist and load items)
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- `MatFormFieldModule` and `MatInputModule` are already available via Angular Material — confirmed by `vehicle-add.ts` usage; no new package installs needed
- `<input type="date">` renders adequately on mobile browsers at 375px — assumed; no datepicker adapter required

## Success Criteria (Summary)

- User can mark any schedule item as done from the schedule view without leaving the page
- The resulting `ServiceRecord` row appears in Supabase with correct `vehicle_id`, `user_id`, `service_date`, `mileage`, and `label`
- Vehicle `current_mileage` updates when the saved mileage exceeds the prior value
