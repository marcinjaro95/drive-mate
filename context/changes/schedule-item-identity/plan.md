# Schedule Item Identity + Traceability Implementation Plan

## Overview

Stable UUID identity for `ScheduleItem` entries stored in `vehicles.ai_schedule` JSONB. Each item
gets a `crypto.randomUUID()` UUID assigned at generation time and persisted inside the JSONB blob.
`service_records` gains a `schedule_item_id uuid` column that records this UUID when the user marks
an item done — replacing the current fragile string-match on `label`. The schedule view seeds its
`savedItems` signal from the DB on every load so done state survives navigation and sign-out.

## Current State Analysis

S-01 (`car-add-ai-schedule`) is complete and impl-reviewed. The current state:

- `ScheduleItem` has no `id` field — items are identified only by the `item` string (free-form AI text)
- `service_records.label` is set to `item.item` on mark-done (line 162 of `schedule-view.ts`) — a string match that silently breaks when AI rewording changes the text across regenerations
- `savedItems = signal<Set<string>>(new Set())` is in-memory only; the set is never seeded from the DB, so done state resets on every reload
- `ngOnInit` early-returns without loading service records when a cached schedule exists — the DB record load only happens during `generateSchedule()`

## Desired End State

After this plan:

- Every `ScheduleItem` stored in `ai_schedule` JSONB carries a stable `id: string` UUID
- `service_records` has a `schedule_item_id uuid` column populated on mark-done
- `schedule-view.ts` loads service records unconditionally on init and seeds `savedItems` from `schedule_item_id` values
- Done state persists across page navigations and sign-out/sign-in cycles
- Historical service records retain their `schedule_item_id` UUID after schedule regeneration — an accurate historical snapshot pointing to the item that existed at the time

### Key Discoveries

- `schedule-view.ts:58` — `savedItems = signal<Set<string>>(new Set())` — string key, in-memory
- `schedule-view.ts:162` — `createServiceRecord({ label: item.item })` — string-match link only
- `schedule-view.ts:75-82` — early return when `ai_schedule?.length` is truthy, before service records are loaded
- `schedule-view.ts:97-105` — `generateSchedule()` already loads service records internally
- `service-record.service.ts:13-19` — `getServiceRecords` does `select('*')` — will automatically return `schedule_item_id` once the column exists
- Migration convention: timestamp `20260607000000` is the latest; new migration uses `20260611000000`
- `crypto.randomUUID()` is available natively in Angular's browser target (no import needed)

## What We're NOT Doing

- Full `ai_schedule_items` table normalization (deferred — JSONB UUID satisfies current traceability needs)
- Per-item CRUD (edit/delete individual schedule items)
- Per-item richer state (snooze, dismiss)
- Changing the regeneration flow — regeneration overwrites the JSONB array with fresh items each carrying new UUIDs; old service records' `schedule_item_id` values become historical snapshots (correct and intentional)
- Loading the schedule-view template with done state from pre-existing `label`-matched records — only `schedule_item_id` UUID matches seed done state going forward

## Implementation Approach

Three sequential phases. Phase 1 is purely schema + models; Phase 2 wires UUID injection into the
service; Phase 3 updates the component. Each phase has a verification gate.

## Phase 1: DB Migration + TypeScript Models

### Overview

Add `schedule_item_id uuid` to `service_records` and backfill UUIDs into existing `ai_schedule`
JSONB items. Update TypeScript models to reflect the new fields.

### Changes Required

#### 1. New migration

**File**: `supabase/migrations/20260611000000_add_schedule_item_identity.sql`

**Intent**: Add the `schedule_item_id` column to `service_records` and assign stable UUIDs to all
existing JSONB schedule items that don't already have an `id` field.

**Contract**:

```sql
-- Stable UUID column for tracing a service record back to the schedule item that prompted it.
-- Nullable: records predating this migration and manually created records have no linked item.
ALTER TABLE service_records ADD COLUMN schedule_item_id uuid DEFAULT NULL;

-- Backfill: assign gen_random_uuid() to each existing ai_schedule item missing an 'id' key.
-- Items already carrying an 'id' are left untouched (idempotent if run more than once).
UPDATE vehicles
SET ai_schedule = (
  SELECT jsonb_agg(
    CASE
      WHEN item ? 'id' THEN item
      ELSE item || jsonb_build_object('id', gen_random_uuid()::text)
    END
  )
  FROM jsonb_array_elements(ai_schedule) AS item
)
WHERE ai_schedule IS NOT NULL AND jsonb_typeof(ai_schedule) = 'array';
```

No new RLS policy required — the existing `service_records` and `vehicles` RLS policies already
scope to `auth.uid()` and cover the new column and the backfill update.

#### 2. ScheduleItem model

**File**: `src/app/core/models/schedule-item.model.ts`

**Intent**: Give every schedule item a stable identity field.

**Contract**: Add `id: string` as the first field of the `ScheduleItem` interface, before `item`.

#### 3. ServiceRecord model

**File**: `src/app/core/models/service-record.model.ts`

**Intent**: Reflect the new DB column in the TypeScript model so the Supabase client maps it
automatically.

**Contract**: Add `schedule_item_id: string | null` to `ServiceRecord` after the `notes` field.
`NewServiceRecord` derives from `ServiceRecord` via `Omit<…>`, so it automatically gains
`schedule_item_id: string | null` as a required field. `ServiceRecordUpdate` is `Partial<…>` of
`NewServiceRecord` (minus `user_id`/`vehicle_id`), so it gains `schedule_item_id?` as optional —
no change needed to those type aliases.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db reset`
- Type-check passes: `npx tsc --noEmit`
- Existing tests still pass: `npm test`

#### Manual Verification

- `schedule_item_id` column visible in Supabase Studio on the `service_records` table as nullable uuid
- Existing vehicle rows in `vehicles.ai_schedule` now have `id` UUIDs on each item (inspect via Supabase Studio table editor or SQL: `SELECT ai_schedule FROM vehicles LIMIT 1`)
- No TypeScript errors in `schedule-item.model.ts` or `service-record.model.ts`

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: AiScheduleService — UUID Injection

### Overview

Assign a `crypto.randomUUID()` UUID to each filtered item before persisting it to the DB. Update
the Vitest spec to verify each returned item carries a non-empty `id`.

### Changes Required

#### 1. UUID injection in generateAndSave

**File**: `src/app/core/ai-schedule/ai-schedule.service.ts`

**Intent**: Stamp each AI-generated item with a stable UUID at the point of generation so the
persisted JSONB and the in-memory array always carry identity.

**Contract**: After the existing `.filter(…)` step (lines 26-29), chain a `.map((i) => ({ ...i, id: crypto.randomUUID() }))` call before the `updateVehicle` call. The result type inferred by TypeScript will match the updated `ScheduleItem` interface once Phase 1 is complete.

#### 2. AiScheduleService spec

**File**: `src/app/core/ai-schedule/ai-schedule.service.spec.ts`

**Intent**: Verify the UUID injection step: every item returned by `generateAndSave` has a non-empty string `id` field.

**Contract**: In the existing "valid response" test case, add an assertion after the existing checks:
`expect(result.every(i => typeof i.id === 'string' && i.id.length > 0)).toBe(true)`. Also verify
that items filtered out (missing source, invalid urgency) are not present in the result — this
already passes but confirms the map runs only on surviving items.

### Success Criteria

#### Automated Verification

- `npm test` passes (all AiScheduleService specs green, including the new UUID assertion)
- `npx tsc --noEmit` passes

**Implementation Note**: Pause here after specs pass before proceeding to Phase 3. (No manual
verification — service has no UI.)

---

## Phase 3: ScheduleView — Cross-session Done State

### Overview

Load service records unconditionally on `ngOnInit` (before the early return for a cached schedule).
Seed `savedItems` from `schedule_item_id` UUID values. Pass `schedule_item_id: item.id` when saving
mark-done. Update the in-memory set and the template to use UUID keys.

### Changes Required

#### 1. ngOnInit — unconditional service record load + savedItems seeding

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Ensure done state is always derived from the DB on every load, not just during AI
generation.

**Contract**: After `this.isLoading.set(false)` and before the `ai_schedule?.length` early return,
insert a service record load block:

```typescript
let loadedRecords: ServiceRecord[] = [];
try {
  loadedRecords = await this.serviceRecordService.getServiceRecords(this.vehicle()!.id);
} catch {
  // non-blocking — done state will be empty; user can still mark items done
}
this.savedItems.set(
  new Set(loadedRecords.map((r) => r.schedule_item_id).filter((id): id is string => id !== null)),
);

if (this.vehicle()!.ai_schedule?.length) {
  this.scheduleItems.set(this.vehicle()!.ai_schedule!);
  return;
}
await this.generateSchedule(loadedRecords);
```

Pass `loadedRecords` to `generateSchedule` to avoid a second `getServiceRecords` call on the initial
visit (when no cached schedule exists). The `retry()` path calls `generateSchedule()` without
pre-loaded records so it fetches fresh ones — correct, since the user may have added records.

#### 2. generateSchedule — accept optional pre-loaded records

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Avoid the double-load on first visit when ngOnInit has already fetched service records.

**Contract**: Change the signature to `async generateSchedule(preloadedRecords?: ServiceRecord[]): Promise<void>`. Inside, only call `getServiceRecords` when `preloadedRecords` is undefined:

```typescript
let serviceRecords: ServiceRecord[] = preloadedRecords ?? [];
if (!preloadedRecords) {
  try {
    serviceRecords = await this.serviceRecordService.getServiceRecords(this.vehicle()!.id);
  } catch {
    // non-blocking
  }
}
```

`retry()` continues to call `this.generateSchedule()` (no argument) so it fetches fresh records.

#### 3. saveMarkDone — pass schedule_item_id

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Write the stable UUID link when recording a completed service item.

**Contract**: In `createServiceRecord(…)` call at the current line 162, add `schedule_item_id: item.id` to the payload object alongside the existing `label: item.item` field. Keep `label` — it remains useful for human-readable display in service history (FR-007).

#### 4. savedItems update — UUID key

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Track done state by UUID, not by item name string.

**Contract**: Change `this.savedItems.update(s => new Set([...s, item.item]))` to
`this.savedItems.update(s => new Set([...s, item.id]))`.

#### 5. Schedule view template — UUID done-state check

**File**: `src/app/vehicles/schedule-view/schedule-view.html`

**Intent**: Match the savedItems key change from item name to UUID.

**Contract**: Find every occurrence of `savedItems().has(item.item)` in the template and replace
with `savedItems().has(item.id)`. No other template changes needed.

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` passes
- `npm test` passes (no regressions)

#### Manual Verification

- Mark an item done → navigate to `/dashboard` → navigate back to the vehicle schedule → the marked item is still shown as done (done badge visible, no re-fetch of AI)
- Confirm in Supabase Studio that the new service record row has `schedule_item_id` set to a UUID (not null)
- Sign out → sign back in → open the same vehicle schedule → done state still persists
- Regenerate the schedule (click Regenerate after triggering it) → existing service records in DB still have their old `schedule_item_id` UUIDs; new schedule items have new UUIDs; the regenerated schedule starts with a clean done state (correct — old items are a historical snapshot)
- A vehicle with no service records loads the schedule with an empty done state and no error

**Implementation Note**: Pause here for final manual confirmation before closing this change.

---

## Testing Strategy

### Unit Tests

`src/app/core/ai-schedule/ai-schedule.service.spec.ts` additions:

- `generateAndSave` returns items where each has `id: string` with non-zero length
- Items filtered by source or urgency (already covered by existing specs) do not appear in result — UUID is only assigned to surviving items

### Integration Tests

None at this stage — full E2E deferred; manual verification covers the integration path.

### Manual Testing Steps

1. Open a vehicle with a cached schedule (no AI call needed) — confirm done state is empty on fresh load
2. Mark one item done — fill date, mileage, save
3. Navigate to `/dashboard` and back — confirm the item is now shown as done
4. Open Supabase Studio → service_records table → confirm `schedule_item_id` is a UUID, `label` still set
5. Sign out and back in → open the same vehicle → done state persists
6. Trigger schedule regeneration → navigate back → confirm old done badge is gone (new UUID-keyed items)
7. Check Supabase Studio → old service record still has its `schedule_item_id` UUID intact

## Performance Considerations

`getServiceRecords` is called once unconditionally on every schedule view load. For a user with
100 service records across a vehicle, this is a single paginated query (default limit: 100) —
negligible overhead. The `savedItems` Set is built in one pass via `map + filter`. No additional
DB queries are introduced for the done-state seeding.

## Migration Notes

Existing service records will have `schedule_item_id = NULL` — they were created before this
change and have no UUID link. This is expected and harmless: those records still display correctly
in the service history (FR-007, not yet built), and the schedule view's done-state seeding simply
ignores null entries. Existing `ai_schedule` JSONB items receive backfilled UUIDs from the migration
— Phase 2's UUID injection applies to all newly generated items going forward.

## References

- Frame brief: `context/changes/car-add-ai-schedule/frame.md` (problem framing)
- Predecessor plan: `context/changes/car-add-ai-schedule/plan.md` (S-01 complete)
- ScheduleItem model: `src/app/core/models/schedule-item.model.ts`
- ServiceRecord model: `src/app/core/models/service-record.model.ts`
- AiScheduleService: `src/app/core/ai-schedule/ai-schedule.service.ts`
- ScheduleView: `src/app/vehicles/schedule-view/schedule-view.ts`
- Roadmap: `context/foundation/roadmap.md` (S-02 service tracking)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB Migration + TypeScript Models

#### Automated

- [x] 1.1 Migration applies cleanly (npx supabase db reset) — b64d81d
- [x] 1.2 Type-check passes (npx tsc --noEmit) — b64d81d
- [x] 1.3 Existing tests still pass (npm test) — b64d81d

#### Manual

- [x] 1.4 schedule_item_id column visible in Supabase Studio on service_records as nullable uuid — b64d81d
- [x] 1.5 Existing ai_schedule JSONB items now carry id UUIDs (inspect via SQL or Studio) — b64d81d
- [x] 1.6 No TypeScript errors on schedule-item.model.ts or service-record.model.ts — b64d81d

### Phase 2: AiScheduleService — UUID Injection

#### Automated

- [x] 2.1 All AiScheduleService specs green including UUID assertion (npm test) — 3f8a019
- [x] 2.2 Type-check passes (npx tsc --noEmit) — 3f8a019

### Phase 3: ScheduleView — Cross-session Done State

#### Automated

- [x] 3.1 Type-check passes (npx tsc --noEmit) — d7ea6cf
- [x] 3.2 npm test passes with no regressions — d7ea6cf

#### Manual

- [x] 3.3 Mark item done → navigate away and back → item still shown as done — d7ea6cf
- [x] 3.4 New service record has schedule_item_id UUID set in Supabase Studio — d7ea6cf
- [x] 3.5 Sign out and back in → done state persists on vehicle schedule — d7ea6cf
- [x] 3.6 Regenerate schedule → old service_record schedule_item_ids intact; new schedule starts with clean done state — d7ea6cf
- [x] 3.7 Vehicle with no service records loads schedule with empty done state and no error — d7ea6cf
