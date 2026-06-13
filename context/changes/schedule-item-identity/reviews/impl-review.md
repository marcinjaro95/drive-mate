<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Schedule Item Identity + Traceability

- **Plan**: context/changes/schedule-item-identity/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-06-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  4 warnings  5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — expand/collapse still compares by label string, not UUID

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/vehicles/schedule-view/schedule-view.html:67,110
- **Detail**: The plan updated `savedItems().has(item.item)` → `savedItems().has(item.id)` but specified "No other template changes needed." That was wrong. Lines 67 and 110 still compare by the label string (`expandedItem()?.item === item.item`). If two schedule items share the same label (possible from AI output), expanding one card visually expands both, and saving one closes both. The UUID identity work done in this change should have completed the fix here too.
- **Fix**: Change both comparisons to use `item.id`: `expandedItem()?.id === item.id` (line 67) and `expandedItem()?.id !== item.id` (line 110).
  - Strength: Uses the stable UUID that every item now carries; matches the savedItems key already updated in this change.
  - Tradeoff: Two-line edit; zero risk.
  - Confidence: HIGH — item.id is guaranteed non-empty for all items produced by AiScheduleService.
  - Blind spot: None significant.
- **Decision**: FIXED

### F2 — no guard on choices array access in proxy response parse

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/core/ai-schedule/ai-schedule.service.ts:24
- **Detail**: `envelope.choices[0].message.content` throws a raw TypeError (not a descriptive error) if the proxy returns a 2xx body that is not an OpenAI-shaped envelope — e.g., a Cloudflare error object `{ error: "…" }`. The TypeError surfaces as the opaque "Failed to generate schedule" message with no diagnostic information.
- **Fix**: Add `if (!Array.isArray(envelope?.choices) || !envelope.choices[0])` before the content access and throw a descriptive error.
- **Decision**: FIXED

### F3 — migration has no rollback path documented

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260611000000_add_schedule_item_identity.sql
- **Detail**: No paired rollback migration exists. If a deployment fails after the ALTER TABLE but before the JSONB backfill completes, the reversal steps are not documented. Low operational risk for a small fleet, but a gap for staging resets or future contributors.
- **Fix**: Add a comment block at the top of the migration documenting the rollback: `ALTER TABLE service_records DROP COLUMN schedule_item_id;` (the ai_schedule id keys added by the backfill are harmless to leave).
- **Decision**: FIXED

### F4 — vehicle()! non-null assertion in ngOnInit record-load block

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/vehicles/schedule-view/schedule-view.ts:84
- **Detail**: `this.vehicle()!.id` in the new getServiceRecords block asserts non-null. It is safe today because `vehicle.set(v)` happens at line 74 before this code runs, but if the block is ever reordered the assertion will throw a runtime TypeError instead of returning gracefully.
- **Fix**: Extract `const v = this.vehicle(); if (!v) return;` at the top of the new record-load block, consistent with the defensive pattern used elsewhere in the component.
- **Decision**: FIXED

### F5 — unplanned service-record.service.spec.ts added

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/app/core/service-records/service-record.service.spec.ts
- **Detail**: A full 18-test spec for ServiceRecordService was added without being listed in the plan. Content is consistent with the model changes (schedule_item_id fixtures) and adds meaningful coverage. Not a problem — but the plan under-counted scope.
- **Fix**: No action needed. Acknowledge as beneficial scope expansion.
- **Decision**: SKIPPED

### F6 — @for still tracks by $index instead of item.id

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/vehicles/schedule-view/schedule-view.html:51
- **Detail**: `@for (item of scheduleItems(); track $index)` — now that items carry stable UUIDs, `track item.id` gives Angular's reconciler a stable key and avoids unnecessary DOM re-renders when the list is regenerated.
- **Fix**: Change `track $index` to `track item.id`.
- **Decision**: FIXED

### F7 — UUID assertion in spec doesn't verify format

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/core/ai-schedule/ai-schedule.service.spec.ts:73
- **Detail**: `result.every(i => typeof i.id === 'string' && i.id.length > 0)` confirms a non-empty string but not UUID format. The factory seeds `id: 'test-item-id'` so the test also proves the .map() overwrites the fixture — but implicitly. A regex assertion would make the UUID-injection contract explicit.
- **Fix**: Add `expect(result[0].id).toMatch(/^[0-9a-f-]{36}$/)` alongside the existing every() assertion.
- **Decision**: FIXED

### F8 — updateVehicle mock doesn't assert UUID shape on persisted items

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/core/ai-schedule/ai-schedule.service.spec.ts (persistence test)
- **Detail**: The "persists the filtered items" test asserts `expect.objectContaining({ item, source })` but omits `id`. A regression removing the .map() stamp would not be caught by the persistence assertion.
- **Fix**: Extend the objectContaining matcher to include `id: expect.stringMatching(/^[0-9a-f-]{36}$/)`.
- **Decision**: FIXED

### F9 — migration backfill behavior with non-object array elements undocumented

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260611000000_add_schedule_item_identity.sql
- **Detail**: If the ai_schedule array contained non-object elements, `item ? 'id'` would evaluate without error in PostgreSQL but produce unexpected output. Low actual risk given the known data shape, but not documented.
- **Fix**: Accept as-is — the data shape is controlled by AiScheduleService. No action needed unless the schema is opened to other writers.
- **Decision**: ACCEPTED
