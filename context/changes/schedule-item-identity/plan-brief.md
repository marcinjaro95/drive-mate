# Schedule Item Identity + Traceability — Plan Brief

> Full plan: `context/changes/schedule-item-identity/plan.md`
> Frame brief: `context/changes/car-add-ai-schedule/frame.md`

## What & Why

`ScheduleItem` has no stable identity — the only link between a completed service record and the
schedule item that prompted it is a string match on `label` vs `item.item`. When the AI rewords an
item on regeneration, the link silently breaks. Additionally, done state lives only in memory and
resets on every page reload. This change adds a UUID to every schedule item (persisted inside JSONB)
and records that UUID on `service_records`, enabling durable traceability and cross-session done
state.

## Starting Point

S-01 (`car-add-ai-schedule`) is complete. Every `ScheduleItem` is stored as a JSONB blob on
`vehicles.ai_schedule` with no `id` field. `service_records.label` holds the item name string.
`savedItems` in `schedule-view.ts` is an in-memory `Set<string>` keyed by item name that vanishes
on navigation.

## Desired End State

Every JSONB schedule item carries a stable UUID (`id: string`). When a user marks an item done,
`service_records.schedule_item_id` is populated with that UUID. On every subsequent load of the
schedule view, service records are fetched and `savedItems` is seeded from `schedule_item_id`
values — so done state persists across navigations and sign-out/sign-in cycles.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Identity approach | UUID in JSONB (not a normalized table) | Avoids regeneration complexity — old service records become a historical UUID snapshot, no FK breakage | Frame / Plan |
| UUID assignment point | `generateAndSave()` after source/urgency filter | Only surviving items get an identity; no UUIDs wasted on items that don't reach the DB | Plan |
| Backfill strategy | SQL migration with `jsonb_build_object('id', gen_random_uuid()::text)` | Existing vehicles get stable IDs at migration time — no client-side patching required | Plan |
| Done state seeding | Load `getServiceRecords` unconditionally on `ngOnInit` | Schedule view always reflects DB truth; avoids the early-return path that skipped record loading | Plan |
| Regeneration semantics | No change — old `schedule_item_id` values are historical snapshots | Correct: the record linked to an item that *existed at that time*; new schedule items get new UUIDs | Frame |
| `label` field on service_records | Kept alongside `schedule_item_id` | Useful for human-readable service history display (FR-007); both fields can coexist | Plan |

## Scope

**In scope:** DB migration (add `schedule_item_id` column + JSONB UUID backfill), `ScheduleItem` model (`id: string`), `ServiceRecord` model (`schedule_item_id: string | null`), `AiScheduleService` UUID injection + spec update, `ScheduleView` ngOnInit seeding + `saveMarkDone` UUID link + template key update

**Out of scope:** Full `ai_schedule_items` table normalization, per-item edit/delete, snooze/dismiss state, service history list UI (FR-007), editing existing service records

## Architecture / Approach

The UUID travels with the item: generated in `AiScheduleService.generateAndSave()` via
`crypto.randomUUID()`, persisted inside the JSONB blob, returned to `ScheduleViewComponent`. On
mark-done, `schedule_item_id` is written to `service_records` alongside the existing `label`. On
every schedule view load, `getServiceRecords()` is called first; its `schedule_item_id` values seed
the `savedItems` Set. No new service or API surface needed — three layers updated in sequence.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB Migration + Models | `schedule_item_id` column; JSONB UUID backfill; TS type updates | Backfill SQL must handle null/non-array ai_schedule rows without erroring |
| 2. AiScheduleService UUID Injection | UUIDs on every generated item; spec coverage | TypeScript must accept `crypto.randomUUID()` without an import |
| 3. ScheduleView — Cross-session Done State | Persistent done badges; UUID-keyed service record links | Double service-record load on first visit (mitigated by passing pre-loaded records to generateSchedule) |

**Prerequisites:** S-01 (`car-add-ai-schedule`) complete — ✓  
**Estimated effort:** ~1–2 sessions across 3 phases

## Open Risks & Assumptions

- `crypto.randomUUID()` availability: Angular targets modern browsers and Node 14.17+; this is safe for the project's target environment but should be confirmed if the project supports older browsers
- After the backfill migration, existing service records predating this change have `schedule_item_id = NULL` — they will not contribute to done-state seeding, which is correct and acceptable
- If a user's `ai_schedule` JSONB was manually set to a non-array value (e.g., malformed JSON), the backfill `WHERE jsonb_typeof = 'array'` guard skips that row safely

## Success Criteria (Summary)

- Every new AI-generated schedule item has a UUID `id` field persisted in the DB
- Marking an item done writes `schedule_item_id` to `service_records`; done state survives page reload and sign-out
- Historical service records retain their `schedule_item_id` after schedule regeneration — no data loss
