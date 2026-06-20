# Swallowed Exceptions — Fix & Test Implementation Plan

## Overview

Two empty `catch {}` blocks in `schedule-view.ts` silently discard `getServiceRecords` failures.
The fix adds a `serviceRecordsUnavailable` signal, logs the error, and shows a non-blocking
degraded-state notice in the UI. Tests reproduce both failure paths so any regression is caught
immediately.

## Current State Analysis

The research doc (commit `64b6e00`) identified exactly two silent-swallow sites:

- **Instance A** — `src/app/vehicles/schedule-view/schedule-view.ts:86–90` — inside `ngOnInit`,
  after `getVehicle` succeeds. `loadedRecords` stays `[]`; `savedItems` ends up empty; then
  `generateSchedule([])` is called with an empty history array.
- **Instance B** — `src/app/vehicles/schedule-view/schedule-view.ts:112–116` — inside
  `generateSchedule`, on the branch where no `preloadedRecords` were passed (i.e., the
  `retry()` path and the post-mark-done regeneration path). AI is called with `[]` service
  records.

Both catch blocks have zero logging and zero user signal. A Supabase RLS misconfiguration or
transient network error is currently invisible to the user and to any monitoring system.

The existing spec (`schedule-view.spec.ts`) covers delete flow and AI generation errors but
has no tests for the `getServiceRecords` failure paths.

The template already uses `mileageSyncWarning()` as a non-blocking inline notice — the
`serviceRecordsUnavailable` indicator will follow the same pattern.

## Desired End State

When `getServiceRecords` throws on either path:
1. The error is logged via `console.warn`.
2. `serviceRecordsUnavailable` signal is `true`.
3. The schedule still generates and renders (graceful degradation is preserved).
4. A non-blocking notice reading "Schedule generated without service history — some intervals
   may be approximate." appears below the schedule list.
5. On a successful retry/regeneration where `getServiceRecords` succeeds, the notice disappears.

Tests assert all five outcomes for both failure sites and the happy path.

### Key Discoveries

- `mileageSyncWarning` at `schedule-view.html:135–140` is the precedent for non-blocking inline
  notices; use the same `<div class="...">` + optional dismiss pattern.
- `serviceRecordsUnavailable` must be reset to `false` at the start of `generateSchedule`
  (alongside the existing `error.set(null)` reset) so a successful retry clears the notice.
- The existing spec sets up `ServiceRecordService` with `vi.fn().mockResolvedValue([])` in the
  "generation flow" describe — new tests will use the same setup scaffold.
- Instance B fires only when `generateSchedule()` is called without arguments (preloadedRecords
  is `undefined`). In `ngOnInit`, records are always passed as `loadedRecords` (even if empty),
  so Instance B is NOT reachable from `ngOnInit`. Tests for Instance B must call
  `component.generateSchedule()` directly.

## What We're NOT Doing

- Blocking the schedule or showing a full error card on `getServiceRecords` failure. Graceful
  degradation is intentional and preserved.
- Adding a "Dismiss" button to the notice (unlike `mileageSyncWarning`). The notice auto-clears
  on successful retry; a dismiss button adds state management without UX benefit.
- Resetting `serviceRecordsUnavailable` in `ngOnInit`. `ngOnInit` runs once; the signal starts
  `false` and is only set to `true` if the catch fires.
- Changing the `mileageSyncWarning` pattern or any other catch block.

## Implementation Approach

Phase 1 is purely TypeScript — no template changes, so existing tests remain green. Phase 2
wires the signal into the template. Phase 3 adds the tests that would have caught this bug.
Phase 4 closes the open TODOs in `lessons.md`.

---

## Phase 1: Add Signal and Fix Catch Blocks

### Overview

Add a `serviceRecordsUnavailable` signal to the component, reset it at the start of
`generateSchedule`, and update both silent catch blocks to log and set the signal.

### Changes Required

#### 1. Add signal declaration

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Declare `serviceRecordsUnavailable` alongside the existing boolean signals so the
template and tests can read it.

**Contract**: Add `serviceRecordsUnavailable = signal(false);` in the signal declarations block
(lines 48–57), after `savedItems`.

#### 2. Reset signal at start of `generateSchedule`

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Clear a previous failure indication when the user triggers a new generation attempt,
so the notice disappears on a successful retry.

**Contract**: Add `this.serviceRecordsUnavailable.set(false);` on the line after
`this.error.set(null);` at the top of `generateSchedule` (currently line 108).

#### 3. Fix Instance A catch block (line 88)

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Surface `getServiceRecords` failures to DevTools and set the signal, while
preserving the graceful-degradation behaviour (schedule still loads).

**Contract**: Replace the bare `catch {}` at lines 88–90 with a typed catch that calls
`console.warn` and sets `serviceRecordsUnavailable`:

```typescript
} catch (err: unknown) {
  console.warn('Service records unavailable — schedule will be generated without history', err);
  this.serviceRecordsUnavailable.set(true);
}
```

#### 4. Fix Instance B catch block (line 114)

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Same as Instance A — this path fires when `generateSchedule()` is called without
`preloadedRecords` (retry button, post-mark-done regeneration).

**Contract**: Replace the bare `catch {}` at lines 114–116 with an identical typed catch.

### Success Criteria

#### Automated Verification

- TypeScript strict compilation passes: `npm run build`
- Existing tests remain green: `npm test`

#### Manual Verification

- No visual change in the UI (template not yet updated — signal declared but not consumed).

**Implementation Note**: Pause here after automated checks pass before moving to Phase 2.

---

## Phase 2: Add Degraded-State Notice to Template

### Overview

Wire `serviceRecordsUnavailable()` into the template as a non-blocking notice that appears
alongside the rendered schedule.

### Changes Required

#### 1. Add notice block after the schedule list

**File**: `src/app/vehicles/schedule-view/schedule-view.html`

**Intent**: Show a concise inline notice when `serviceRecordsUnavailable` is `true`, styled
consistently with the existing `mileageSyncWarning` block so users understand the schedule is
degraded without blocking interaction.

**Contract**: Add the following block after the closing `</div>` of `<div class="schedule-list">`
(line 133) and before the existing `@if (mileageSyncWarning())` block (line 135). Use the CSS
class `records-unavailable-notice` — the tests in Phase 3 query this class.

```html
@if (serviceRecordsUnavailable()) {
  <div class="records-unavailable-notice">
    <span>Schedule generated without service history — some intervals may be approximate.</span>
  </div>
}
```

#### 2. Add CSS rule for the notice

**File**: `src/app/vehicles/schedule-view/schedule-view.scss`

**Intent**: Style the notice consistently with `mileage-warning` so it reads as a secondary
warning, not an error.

**Contract**: Add a rule for `.records-unavailable-notice` that mirrors the `mileage-warning`
rule already in the file (padding, background, border-radius). If `mileage-warning` uses a
colour variable, reuse it. The exact values are implementation detail — visual parity with the
existing warning is the goal.

### Success Criteria

#### Automated Verification

- TypeScript strict compilation passes: `npm run build`
- Existing tests remain green: `npm test`

#### Manual Verification

- In the running dev server (`npm start`), simulate a `getServiceRecords` failure by temporarily
  making `ServiceRecordService.getServiceRecords` throw (e.g., add `throw new Error('test')` at
  the top of the method, revert after).
- Confirm the notice "Schedule generated without service history — some intervals may be
  approximate." appears below the schedule cards.
- Confirm the schedule cards themselves still render.
- Confirm the notice disappears after a successful regeneration (revert the forced throw, click
  the regenerate button or reload).
- Revert any temporary changes.

**Implementation Note**: Pause here for manual confirmation before writing tests.

---

## Phase 3: Tests — Reproduce Both Swallow Sites

### Overview

Add a new `describe` block to `schedule-view.spec.ts` that covers: Instance A (ngOnInit swallow),
Instance B (generateSchedule swallow), and the happy path (no notice rendered).

### Changes Required

#### 1. Add new describe block

**File**: `src/app/vehicles/schedule-view/schedule-view.spec.ts`

**Intent**: Provide a failing test for each swallow site that would have caught the original
bug, plus a guard ensuring the notice is absent on the happy path.

**Contract**: Append a new `describe('ScheduleViewComponent — service-records unavailable', ...)`
block after the existing "generation flow" describe. The block contains five tests structured
as two sub-groups:

---

**Sub-group A — `ngOnInit` swallow (Instance A, line 88)**

Setup: `getVehicle` resolves with a vehicle where `ai_schedule: null` (forces `generateSchedule`
to be called from `ngOnInit`). `getServiceRecords` rejects with `new Error('RLS error')`.
`generateAndSave` resolves with `[makeItem()]`. Call `fixture.detectChanges()`, `await
flushPromises()`, `fixture.detectChanges()`.

Tests:
- `getServiceRecords throws during ngOnInit → shows .records-unavailable-notice`  
  Assert: `querySelector('.records-unavailable-notice')` is not null.
- `getServiceRecords throws during ngOnInit → schedule items still rendered`  
  Assert: `querySelectorAll('[data-testid="schedule-item"]').length` is `1`.
- `getServiceRecords succeeds → .records-unavailable-notice absent`  
  Override `getServiceRecords` to `mockResolvedValue([])`. Assert notice is null.

---

**Sub-group B — `generateSchedule` direct call (Instance B, line 114)**

Setup: `getVehicle` resolves with a vehicle where `ai_schedule: [makeItem()]` (so `ngOnInit`
returns early after loading records — Instance B is not reachable from `ngOnInit`). 
`getServiceRecords` resolves with `[]` for the `ngOnInit` savedItems call. Call 
`fixture.detectChanges()`, `await flushPromises()`, `fixture.detectChanges()` to let `ngOnInit`
finish cleanly. Then in each test body, replace the `getServiceRecords` spy with a rejecting
mock and call `await component.generateSchedule()` (no args).

Tests:
- `getServiceRecords throws during generateSchedule() → shows .records-unavailable-notice`  
  Spy rejects. Call `await component.generateSchedule()`. `fixture.detectChanges()`.  
  Assert notice not null.
- `getServiceRecords throws during generateSchedule() → schedule items still rendered`  
  Same setup. `generateAndSave` resolves with `[makeItem()]`. After `generateSchedule()`,
  assert `querySelectorAll('[data-testid="schedule-item"]').length` is `1`.

### Success Criteria

#### Automated Verification

- All five new tests pass: `npm test`
- No regressions in existing describe blocks: `npm test`

#### Manual Verification

- Verify test names are descriptive enough that a future engineer understands what each test
  is guarding without reading the implementation.

**Implementation Note**: Pause after all tests are green before moving to Phase 4.

---

## Phase 4: Finalize `lessons.md`

### Overview

Fill in the two `[fill in]` placeholder lines in the two-error-contracts lesson so the rule
is actionable for future contributors.

### Changes Required

#### 1. Complete the Rule and Applies-to fields

**File**: `context/foundation/lessons.md`

**Intent**: Turn the open-ended placeholder into a concrete, enforceable rule that matches what
the codebase actually does after this fix.

**Contract**: Replace both `[fill in: ...]` lines with:

- **Rule**: `Data services (VehicleService, ServiceRecordService) throw on error; AuthService
  returns AuthError | null; components catch thrown errors and set Angular signals. Do not
  introduce a third pattern (silent swallow, promise chain, callback).`
- **Applies to**: `Any new service added under src/app/core/ and any component under
  src/app/vehicles/ or src/app/shared/ that calls those services.`

### Success Criteria

#### Automated Verification

- `npm test` still passes (lessons.md is not consumed by the build).

#### Manual Verification

- Read the completed `context/foundation/lessons.md` and confirm both fields are unambiguous and
  refer to concrete file paths.

---

## Testing Strategy

### Unit / Component Tests

- **Instance A**: `getServiceRecords` rejects during `ngOnInit` — notice shown, schedule renders.
- **Instance B**: `getServiceRecords` rejects when `generateSchedule()` called without args — notice shown, schedule renders.
- **Happy path**: `getServiceRecords` succeeds — notice absent.

### Manual Testing

1. Start dev server: `npm start`
2. Force `getServiceRecords` to throw temporarily (add `throw new Error('test')` at top of method).
3. Navigate to a vehicle schedule view.
4. Confirm notice appears below schedule cards.
5. Confirm schedule cards render.
6. Revert the forced throw; click Regenerate (or reload).
7. Confirm notice disappears.

## Migration Notes

No schema or data changes. No API contract changes.

## References

- Research: `context/changes/swallowed-exceptions/research.md`
- Prior lessons rule: `context/foundation/lessons.md`
- Silent swallow A: `src/app/vehicles/schedule-view/schedule-view.ts:86–90`
- Silent swallow B: `src/app/vehicles/schedule-view/schedule-view.ts:112–116`
- Template notice precedent: `src/app/vehicles/schedule-view/schedule-view.html:135–140`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Add Signal and Fix Catch Blocks

#### Automated

- [x] 1.1 TypeScript strict compilation passes: `npm run build` — 50572d8
- [x] 1.2 Existing tests remain green: `npm test` — 50572d8

#### Manual

- [ ] 1.3 No visual change in the UI (signal declared but not consumed)

### Phase 2: Add Degraded-State Notice to Template

#### Automated

- [x] 2.1 TypeScript strict compilation passes: `npm run build`
- [x] 2.2 Existing tests remain green: `npm test`

> **Plan deviation**: replaced inline `<div class="records-unavailable-notice">` with a `MatSnackBar` call (user preference). Template block and `.records-unavailable-notice` CSS rule were not added. Signal stays for test assertions. Phase 3 tests will spy on `MatSnackBar.open` instead of querying the DOM class.

#### Manual

- [ ] 2.3 Notice "Schedule generated without service history" appears when `getServiceRecords` throws
- [ ] 2.4 Schedule cards still render alongside the notice
- [ ] 2.5 Notice disappears after successful regeneration

### Phase 3: Tests — Reproduce Both Swallow Sites

#### Automated

- [ ] 3.1 All five new tests pass: `npm test`
- [ ] 3.2 No regressions in existing describe blocks: `npm test`

#### Manual

- [ ] 3.3 Test names are self-documenting without reading implementation

### Phase 4: Finalize lessons.md

#### Automated

- [ ] 4.1 `npm test` still passes

#### Manual

- [ ] 4.2 Both `Rule` and `Applies to` fields in `lessons.md` are unambiguous and reference concrete paths
