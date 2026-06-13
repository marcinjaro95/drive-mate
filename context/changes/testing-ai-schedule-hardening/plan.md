# AI Schedule Flow Hardening — Implementation Plan

## Overview

Backfill missing test coverage for the AI schedule generation loop to satisfy Phase 1 of the test-plan rollout. Covers Risk #1 (malformed LLM response leaves the user in a broken or blank state with no feedback) and Risk #2 (AI-generated item without a traceable source reaches the schedule view).

No production code changes. Three phases: service unit tests, component generation-flow tests, cookbook update.

## Current State Analysis

`ai-schedule.service.spec.ts` has 17 passing tests covering the happy path, empty-string and missing-property source filters, JSON parse failure, HTTP 500, and persistence. Two guards added during the `car-add-ai-schedule` impl-review — the `choices`-array guard (service:24–26) and the `items`-array guard (service:28) — have no spec coverage. `source: null` and `source: '   '` are handled by the predicate but unasserted. Urgency validation (`VALID_URGENCY` Set) is similarly unasserted.

`schedule-view.spec.ts` has 3 tests, all covering the delete dialog. Zero tests cover the generation flow: error card rendering, "Try again" button, skeleton, filtered empty state, AbortError absorption, or source attribution in the DOM.

## Desired End State

`ai-schedule.service.spec.ts` passes with 24 tests (17 existing + 7 new). `schedule-view.spec.ts` passes with 11 tests (3 existing delete-flow + 8 new generation-flow). `test-plan.md` §6.1 and §6.4 are filled with concrete patterns. §3 Phase 1 status is `complete`.

### Key Discoveries

- Service spec uses `vi.stubGlobal('fetch', ...)` and a `makeEnvelope()` helper — new service tests extend the same describe block with the same pattern.
- Component spec sets up `TestBed` with mocked services; existing tests set signals directly and call methods without `detectChanges()`. Generation-flow tests need a separate describe block that calls `fixture.detectChanges()` + `await fixture.whenStable()` to trigger `ngOnInit` and resolve the async generation path.
- The skeleton `isGenerating` state is immediately overwritten once `whenStable()` resolves — test it by setting `component.isGenerating.set(true)` directly and calling `detectChanges()`, not via the async generation path.
- `AbortError` is absorbed at `schedule-view.ts:127`. Reject `generateAndSave` with `new DOMException('AbortError', 'AbortError')` and assert no error card appears.
- Template source attribution is unconditional (`<small>Source: {{ item.source }}</small>`) — the template trusts the service filter. Component tests assert the positive case (rendered items show non-empty source text), not a nonexistent template guard.

## What We're NOT Doing

- No cache-bypass assertion (vehicle.ai_schedule loaded from DB bypasses service filter — deferred out of Phase 1 scope)
- No Cloudflare Worker tests
- No production code changes
- No e2e tests (per test-plan §7)
- No testing of the delete flow, mark-done flow, or mileage-sync warning

## Implementation Approach

Tests only. Each phase adds a discrete group of specs to an existing file. Service tests extend the existing describe block; component generation-flow tests use a sibling describe block. Phase 3 updates test-plan.md prose.

---

## Phase 1: Service Unit Test Gap-fill

### Overview

Add 7 new unit tests inside the existing `describe('AiScheduleService', ...)` block. All follow the `vi.stubGlobal('fetch', ...)` + `makeEnvelope()` pattern already in the file.

### Changes Required

#### 1. Malformed envelope cases — `choices` null and empty array

**File**: `src/app/core/ai-schedule/ai-schedule.service.spec.ts`

**Intent**: Assert that the `choices`-array guard (service:24–26) fires on both shapes that OpenRouter's free-tier can return: `choices: null` and `choices: []` (empty array). Two separate tests — each shape documents the distinct production scenario and guards against a refactor that only handles one.

**Contract**: Both tests stub `fetch` with `json: () => Promise.resolve({ choices: null })` and `json: () => Promise.resolve({ choices: [] })` respectively. Both assert `rejects.toThrow('AI proxy returned unexpected response shape')`. Place these after the existing HTTP-500 test.

#### 2. Malformed items cases — `items: null` and `items: {}` (object, not array)

**File**: `src/app/core/ai-schedule/ai-schedule.service.spec.ts`

**Intent**: Assert that the `items`-array guard (service:28) fires when `parsed.items` is `null` and when it is a plain object. Two separate tests.

**Contract**: Use the existing `makeEnvelope()` helper: `makeEnvelope(null as any)` produces `{ items: null }` in the inner JSON; `makeEnvelope({} as any)` produces `{ items: {} }`. Both assert `rejects.toThrow('AI response missing items array')`.

#### 3. Source filter edge cases — `source: null` and `source: '   '`

**File**: `src/app/core/ai-schedule/ai-schedule.service.spec.ts`

**Intent**: Assert that `source: null` and `source: '   '` (whitespace-only) are dropped by the predicate, following the same pattern as the existing empty-string and missing-property tests.

**Contract**: Two tests, each with two items: the bad-source item and a valid `makeItem()`. `null` case uses `makeItem({ source: null as any })`; whitespace case uses `makeItem({ source: '   ' })`. Both assert `result` has length 1 and the valid item is the one returned.

#### 4. Urgency filter — invalid urgency value

**File**: `src/app/core/ai-schedule/ai-schedule.service.spec.ts`

**Intent**: Assert that an item with `urgency: 'unknown'` (not in `VALID_URGENCY`) is excluded, and a valid item alongside it is kept.

**Contract**: One test: `makeItem({ urgency: 'unknown' as any })` paired with `makeItem()`. Assert result has length 1 and the valid item is returned.

### Success Criteria

#### Automated Verification

- All 24 service tests pass: `npm test -- --reporter=verbose`
- TypeScript compilation clean: `npx tsc --noEmit`

#### Manual Verification

- Read each new test and confirm: throw-message tests assert the correct string fragment; filter tests assert the correct count and the identity of the surviving item

**Implementation Note**: After Phase 1 automated checks pass, pause for manual review before proceeding to Phase 2.

---

## Phase 2: Component Generation-Flow Tests

### Overview

Add 8 new tests in a `describe('ScheduleViewComponent — generation flow', ...)` block, sibling to the existing delete-flow block. This block has a different fixture setup: `detectChanges()` is NOT called in `beforeEach` — each test configures the `generateAndSave` spy and triggers `ngOnInit` itself.

### Changes Required

#### 1. TestBed setup for generation-flow describe block

**File**: `src/app/vehicles/schedule-view/schedule-view.spec.ts`

**Intent**: Establish the shared fixture configuration for all 8 generation-flow tests. The key difference from the existing delete-flow `beforeEach` is that `generateAndSaveSpy` is left unconfigured until each test sets its own resolution.

**Contract**: 
- `generateAndSaveSpy = vi.fn()` declared in outer scope (not yet resolved or rejected)
- Providers mirror the delete-flow block: `provideRouter([])`, `provideAnimationsAsync()`, `ActivatedRoute` stub with `{ snapshot: { params: { id: 'v1' } } }`, `VehicleService` mock with `getVehicle: vi.fn().mockResolvedValue(makeVehicle({ ai_schedule: null }))` (forces the generation path since `ai_schedule` is null), `AiScheduleService` mock with `generateAndSave: generateAndSaveSpy`
- `await TestBed.compileComponents()` and `fixture = TestBed.createComponent(ScheduleViewComponent)` — no `detectChanges()` yet
- Each test calls `generateAndSaveSpy.mockResolvedValue(...)` or `mockRejectedValue(...)`, then: `fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges()`

#### 2. Error card tests (3 tests)

**File**: `src/app/vehicles/schedule-view/schedule-view.spec.ts`

**Intent**: Verify Risk #1 at the component boundary — when `generateAndSave` throws, the user sees an error card with the message and a "Try again" button, not a blank or crashed view.

**Contract**: All three tests configure `generateAndSaveSpy.mockRejectedValue(new Error('AI proxy error: 500'))` and await `whenStable()`.

- Test 1: `fixture.nativeElement.querySelector('.error-state')` is not null
- Test 2: `p` element inside `.error-state` contains the string `'AI proxy error: 500'`
- Test 3: a `button` inside `.error-state` has text matching `'Try again'`; clicking it calls `generateAndSaveSpy` a second time (configure spy to resolve to `[]` on the second call)

#### 3. AbortError absorption test (1 test)

**File**: `src/app/vehicles/schedule-view/schedule-view.spec.ts`

**Intent**: Verify that an `AbortError` is silently discarded and does not set `error()` or render the error card — cancelled generations should not alarm the user.

**Contract**: `generateAndSaveSpy.mockRejectedValue(new DOMException('AbortError', 'AbortError'))`. After `whenStable()`: `.error-state` element is absent from `fixture.nativeElement`.

#### 4. Skeleton state test (1 test)

**File**: `src/app/vehicles/schedule-view/schedule-view.spec.ts`

**Intent**: Verify that the skeleton shimmer cards appear while generation is in progress.

**Contract**: Do NOT trigger `ngOnInit` via `detectChanges()`. Instead: `component.isGenerating.set(true); fixture.detectChanges()`. Query the skeleton container (the element rendered under the `isGenerating()` branch in `schedule-view.html` lines ~15–30). Assert it is present.

#### 5. Filtered empty-state test (1 test)

**File**: `src/app/vehicles/schedule-view/schedule-view.spec.ts`

**Intent**: Verify the "all items filtered" empty-state message appears when `generateAndSave` resolves with an empty array, and the error card does NOT appear.

**Contract**: `generateAndSaveSpy.mockResolvedValue([])`. After `whenStable()`: the filtered empty-state element (rendered under the `scheduleItems().length === 0` branch in `schedule-view.html` lines 42–48) is in the DOM; `.error-state` is absent.

#### 6. Source attribution DOM test (1 test)

**File**: `src/app/vehicles/schedule-view/schedule-view.spec.ts`

**Intent**: Verify Risk #2 at the component boundary — when valid items are returned, source text is visible in the DOM for every rendered item and all source texts are non-empty after trimming. This is the positive assertion that closes the Risk #2 component-level gap.

**Contract**: `generateAndSaveSpy.mockResolvedValue([makeItem(), makeItem({ item: 'Tyre rotation', source: 'Industry standard' })])`. After `whenStable()`: query all `small` elements (or source attribution elements) inside item cards; assert each has `.textContent.trim().length > 0`. Assert no rendered source element contains only whitespace.

### Success Criteria

#### Automated Verification

- All 11 component tests pass: `npm test -- --reporter=verbose`
- TypeScript compilation clean: `npx tsc --noEmit`
- Lint clean: `npx eslint src/app/vehicles/schedule-view/schedule-view.spec.ts`

#### Manual Verification

- Run `npm test` and confirm the 8 new generation-flow tests are in a separate describe block and all pass
- Confirm AbortError test does not depend on Angular Zone timing (verify it uses `DOMException` not `new Error('AbortError')` — only the former is absorbed by the component's AbortError check)

**Implementation Note**: After Phase 2 automated checks pass, pause for manual review before proceeding to Phase 3.

---

## Phase 3: Cookbook Update

### Overview

Fill in the `TBD` stubs in `test-plan.md` §6.1 and §6.4 with concrete patterns derived from what Phases 1 and 2 just implemented. Update §3 Phase 1 status to `complete`.

### Changes Required

#### 1. Fill §6.1 — Adding a unit or component test

**File**: `context/foundation/test-plan.md`

**Intent**: Replace `TBD — see §3 Phase 1 ...` in §6.1 with a short pattern summary: where to put new unit tests (extend existing describe blocks), how to stub `fetch` for service tests (`vi.stubGlobal`), and how to set up a component generation-flow test (TestBed + `whenStable()` pattern).

**Contract**: The §6.1 body should cover: (1) service unit tests — file location, `vi.stubGlobal`+`makeEnvelope` pattern; (2) component tests — file location, two describe-block convention (delete-flow vs generation-flow), `detectChanges()` + `whenStable()` for async paths, and direct signal mutation for intermediate states like `isGenerating`.

#### 2. Fill §6.4 — Adding a test for a new AI schedule response shape

**File**: `context/foundation/test-plan.md`

**Intent**: Replace `TBD — see §3 Phase 1 ...` in §6.4 with the pattern for adding a new malformed-response test case: which file, which describe block, which helpers to use, and how to construct an envelope for an unusual shape.

**Contract**: The §6.4 body should cover: extend the `describe('AiScheduleService', ...)` block in `ai-schedule.service.spec.ts`; use `vi.stubGlobal('fetch', ...)` with `json: () => Promise.resolve(<envelope shape>)` for envelope-level shapes; use `makeEnvelope(<bad-items>)` for inner-content shapes; assert `rejects.toThrow(<message substring>)` for guards, or assert filtered count for filter cases.

#### 3. Update §3 Phase 1 status

**File**: `context/foundation/test-plan.md`

**Intent**: Mark the Phase 1 row in the §3 Phased Rollout table as `complete`.

**Contract**: Change `change opened` → `complete` in the Phase 1 row.

### Success Criteria

#### Automated Verification

- No automated check needed (prose update only)

#### Manual Verification

- Read §6.1 and §6.4: they should give a developer enough context to add a new test without reading this plan
- §3 Phase 1 row status reads `complete`

---

## Testing Strategy

### Unit Tests (Phase 1)

Extend `describe('AiScheduleService', ...)` — 7 new tests targeting the guard and filter paths. Each test is self-contained: stub `fetch`, call `generateAndSave`, assert throw or filtered result.

### Component Tests (Phase 2)

New `describe('ScheduleViewComponent — generation flow', ...)` block — 8 tests. Tests for async paths (error, abort, empty-state, source attribution) trigger `ngOnInit` via `detectChanges()` + `whenStable()`. The skeleton test sets `isGenerating` directly to avoid timing issues.

### Manual Testing Steps

1. Run `npm test` — all 24 service tests and all 11 component tests should pass
2. Verify verbose output shows both describe blocks in `schedule-view.spec.ts`
3. Read each new test name and confirm it is self-documenting about what risk it protects

---

## References

- Research: `context/changes/testing-ai-schedule-hardening/research.md`
- Test plan: `context/foundation/test-plan.md`
- Service: `src/app/core/ai-schedule/ai-schedule.service.ts:11–34`
- Service spec: `src/app/core/ai-schedule/ai-schedule.service.spec.ts`
- Component: `src/app/vehicles/schedule-view/schedule-view.ts:48–58, 99–130`
- Component template: `src/app/vehicles/schedule-view/schedule-view.html:35–48, 65`
- Component spec: `src/app/vehicles/schedule-view/schedule-view.spec.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Service Unit Test Gap-fill

#### Automated

- [x] 1.1 All 24 service tests pass: `npm test -- --reporter=verbose` — fe809ef
- [x] 1.2 TypeScript compilation clean: `npx tsc --noEmit` — fe809ef

#### Manual

- [x] 1.3 Each new test reviewed — throw-message tests assert correct string; filter tests assert correct count and surviving item identity — 0e27b49

### Phase 2: Component Generation-Flow Tests

#### Automated

- [x] 2.1 All 11 component tests pass: `npm test -- --reporter=verbose` — 0e27b49
- [x] 2.2 TypeScript compilation clean: `npx tsc --noEmit` — 0e27b49
- [x] 2.3 Lint clean: `npx eslint src/app/vehicles/schedule-view/schedule-view.spec.ts` — 0e27b49

#### Manual

- [x] 2.4 Both describe blocks visible in test output; 8 generation-flow tests in their own block — 0e27b49
- [x] 2.5 AbortError test uses `DOMException` (not `new Error`); test is not timing-sensitive — 0e27b49

### Phase 3: Cookbook Update

#### Manual

- [x] 3.1 §6.1 and §6.4 replaced with concrete patterns; readable without referring to this plan — c98902f
- [x] 3.2 §3 Phase 1 status reads `complete` — c98902f
