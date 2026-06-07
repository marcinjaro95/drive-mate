<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Car Add + AI Schedule

- **Plan**: context/changes/car-add-ai-schedule/plan.md
- **Scope**: All 5 Phases
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION (resolved by triage)
- **Findings**: 1 critical  3 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Wrong AI model in production path

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/app/core/ai-schedule/ai-schedule.service.ts:15
- **Detail**: Model was 'gpt-oss-120b:free'; plan specified 'google/gemini-2.0-flash-001' (Gemini Flash 2.0) throughout — Overview, code snippet, Performance section.
- **Fix**: Update plan to reflect actual model used (user decision: keep model, update plan).
- **Decision**: FIXED — plan updated; three plan references to Gemini Flash 2.0 patched to 'gpt-oss-120b:free'.

### F2 — No structural guard on AI envelope shape

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/core/ai-schedule/ai-schedule.service.ts:22–24
- **Detail**: parsed.items.filter() called without checking items is an array; missing items key produces cryptic TypeError.
- **Fix**: `if (!Array.isArray(parsed?.items)) throw new Error('AI response missing items array');`
- **Decision**: FIXED

### F3 — AI-generated urgency written to DB without runtime validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/core/ai-schedule/ai-schedule.service.ts:23–25
- **Detail**: Source filter only checked source; out-of-spec urgency value from model persists to Supabase and produces broken CSS class.
- **Fix**: Added `VALID_URGENCY` Set; extended filter to also require `VALID_URGENCY.has(i.urgency)`.
- **Decision**: FIXED

### F4 — Concurrent generateSchedule() calls during fast navigation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/vehicles/schedule-view/schedule-view.ts:51, 54
- **Detail**: On navigation away mid-generation, destroyed instance's in-flight fetch + updateVehicle write continues; new instance starts a second concurrent call. Two AI calls + two DB writes race.
- **Fix A ⭐ Applied**: AbortController — private field, abort in ngOnDestroy, signal threaded to fetch(). AbortError silently returns (not surfaced as UI error).
- **Decision**: FIXED via Fix A

### F5 — Spec fixture fuel_type differs from what the form saves

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/core/ai-schedule/ai-schedule.service.spec.ts:15
- **Detail**: Fixture used fuel_type: 'petrol'; form stores 'gasoline' per DB constraint. buildPrompt test asserted 'petrol' — value never appears in real usage.
- **Fix**: Fixture changed to 'gasoline'; assertion updated to toContain('gasoline').
- **Decision**: FIXED

### F6 — Three unplanned files added (all benign)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: proxy.conf.json, angular.json, src/app/core/vehicles/vehicle.service.spec.ts
- **Detail**: Dev proxy wiring and extra VehicleService test coverage — correct and additive, not in plan's Changes Required.
- **Fix**: Plan addendum added documenting the three files as accepted.
- **Decision**: FIXED via plan addendum
