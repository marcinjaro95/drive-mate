# Frame Brief: AI Schedule Item Identity + Traceability

> Framing step before /10x-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

AI schedule items stored in `vehicles.ai_schedule` (JSONB array) have no structural
link to `service_records`. When a user marks an item as done, `ServiceRecord.label`
is set to the schedule item's `item` name string — a string match, not a FK. There
is no `id` field on `ScheduleItem`.

## Initial Framing (preserved)

- **User's stated cause or approach**: The JSONB column is architecturally wrong — it
  prevents per-item links to service records, per-item state tracking, and individual
  item modification/deletion without regenerating the entire schedule.
- **User's proposed direction**: Replace `ai_schedule` JSONB column with a separate
  `ai_schedule_items` table whose rows link (FK) to `service_records`.
- **Pre-dispatch narrowing**: Primary concern is no durable link between AI schedule
  items and service records — "No FK, just a fragile string match on label."

## Dimension Map

The observation could originate at any of these dimensions:

1. **Fragile string-match identity** — `ScheduleItem` has no `id`; `ServiceRecord.label`
   matches `item.item` by name only. Regeneration with different AI wording silently
   orphans service records.
2. **JSONB prevents per-item addressability** ← initial framing — the schedule is an
   atomic blob; no individual item can be addressed, linked, or mutated independently.
3. **Derived done-state is already achievable** — `service_records` already contains
   `label` matching `ScheduleItem.item`; cross-session done state could be derived on
   load from existing data. The gap is in component usage, not the schema.
4. **Regeneration semantics conflict with normalization** — the proposed table introduces
   a hard design problem: regeneration is a full overwrite; rows with FK links to
   service_records can't be deleted without breaking traceability.

## Hypothesis Investigation

| Hypothesis                                                      | Evidence                                                                                                                                                                                                                                                                                                                     | Verdict |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **H-A: String-match is the only identity**                      | `schedule-item.model.ts:3-10` — no `id` field. `ai-schedule.service.ts:46-74` — prompt produces free-form item names, no fixed enum. `schedule-view.ts:162` — `label: item.item`. Template commit history: `track item.item` → `track $index` as defensive refactor ("duplicate label safety").                              | STRONG  |
| **H-B: JSONB blocks per-item addressability** ← initial framing | True: JSONB is an atomic blob; any mutation requires reading the full array, splicing, and writing back. No DB-level address per item.                                                                                                                                                                                       | STRONG  |
| **H-C: Done state is derivable from existing data**             | `schedule-view.ts:66-87` — `ngOnInit` does NOT call `getServiceRecords`. `service-record.service.ts:13-23` — `getServiceRecords` returns full records incl. `label`. `savedItems` signal is never seeded from DB on load — only populated within the session. Zero schema changes needed to derive cross-session done state. | STRONG  |
| **H-D: Normalized table creates regeneration complexity**       | `ai-schedule.service.ts:30` — `updateVehicle({ ai_schedule: filtered })` is a full atomic overwrite. Three regeneration strategies with a table each have hard costs: DELETE+re-insert loses FK links; soft-delete requires audit overhead; merge-by-identity still depends on the same fragile string match.                | STRONG  |

## Narrowing Signals

- User confirmed the service-tracking feature is implemented and in use — the reset-on-reload behavior is observed, not theoretical.
- User explicitly said the primary concern is bidirectional FK traceability ("No FK, just a fragile string match"), not just ephemeral done state.
- The template already switched from `track item.item` to `track $index` as a recognized defensive patch — confirming the string-match fragility is a known problem in the codebase.
- Roadmap parks FR-007 (service history list) and FR-008 (edit service record) with "delete-and-re-add is the v1 workaround" — no roadmap item requires per-item CRUD on AI schedule items for MVP S-02.

## Cross-System Convention

`service_records` has `vehicle_id uuid REFERENCES vehicles(id) ON DELETE CASCADE` and
`user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE` — proper FKs for stable
entities with stable IDs. The `vehicles.ai_schedule` JSONB carries data that conceptually
should have its own identity but doesn't because it's embedded. The convention in this
schema is: rows that need references get a table; data that is a property of another row
uses JSONB. AI schedule items cross this line — they now need to be referenced.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: `ScheduleItem` has no stable identity —
> there is no UUID on each item — so string-match is the only available link between
> a completed service record and the schedule item that prompted it, and this link
> silently breaks across regenerations when the AI words an item differently.

The initial framing (JSONB is the problem) is partially correct: JSONB prevents proper
identity. But the proposed solution (full table normalization) doesn't resolve the
identity problem on its own — it merely relocates it. All three regeneration strategies
for a normalized table still require either losing FK links on regeneration or re-solving
the identity problem via merge-by-name.

A lighter path resolves the identity problem with less regeneration complexity: **add a
generated UUID to `ScheduleItem` (persisted inside the JSONB) and a `schedule_item_id`
column to `service_records`.** This gives genuine UUID-based traceability, requires a
single migration (one new nullable column), and sidesteps regeneration semantics because
old service records simply retain their UUID snapshot — a historical reference to an item
that may no longer exist in the current schedule, which is accurate and acceptable. The
full table is justified later if per-item CRUD or richer state (snooze, dismiss) is
required — but that's not in the current roadmap.

## Confidence

**MEDIUM** — the reframe (UUID in JSONB + FK column on service_records) is well-supported
by evidence from all four hypotheses. The lighter path is cleaner for the current MVP
scope. However, the user explicitly mentioned modifying and deleting service tracking
records and richer per-item state — if those are requirements for a near-term slice, the
full table is the right call. The plan should resolve this scope question before choosing
the approach.

## What Changes for /10x-plan

The plan should not be "replace JSONB with a table." Instead, it should be scoped to
**establish stable item identity** — either (a) UUID in JSONB + `schedule_item_id` FK on
`service_records` (lighter, addresses traceability, avoids regeneration complexity) or
(b) full `ai_schedule_items` table (heavier, required if per-item state/CRUD is in scope).
The plan must first settle the scope question: is per-item CRUD or richer state needed
for any planned roadmap slice?

## References

- `src/app/core/models/schedule-item.model.ts:3-10` — no `id` field on ScheduleItem
- `src/app/core/ai-schedule/ai-schedule.service.ts:30,46-74` — full overwrite; free-form item names
- `src/app/vehicles/schedule-view/schedule-view.ts:58,66-87,162,186-194` — ephemeral savedItems; no DB-seeded done state
- `src/app/core/service-records/service-record.service.ts:13-23` — label field available in getServiceRecords
- `supabase/migrations/20260604000000_init_schema.sql:59-90` — service_records FK pattern
- `supabase/migrations/20260607000000_add_ai_schedule_column.sql` — ai_schedule JSONB column
- `context/foundation/roadmap.md` — FR-007/FR-008 parked; S-02 scope
- Investigation tasks: #1 (H-A), #2 (H-B/C), #3 (H-D)
