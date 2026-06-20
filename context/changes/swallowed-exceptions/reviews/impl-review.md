<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Swallowed Exceptions — Fix & Test

- **Plan**: context/changes/swallowed-exceptions/plan.md
- **Scope**: All phases (1–4 of 4)
- **Date**: 2026-06-20
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  3 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — 'Dismiss' action label in both snackBar calls

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: schedule-view.ts:97 and :130
- **Detail**: Plan's "What We're NOT Doing" explicitly prohibits a 'Dismiss' button. Both snackBar.open calls passed 'Dismiss' as the second argument. The Phase 2 MatSnackBar deviation is documented but the 'Dismiss' label adoption was not.
- **Fix**: Remove 'Dismiss' from both snackBar.open calls — pass undefined. Snackbar auto-dismisses via { duration: 5000 }.
- **Decision**: FIXED — 'Dismiss' replaced with undefined in both calls; helper extraction (F4) also landed in same edit pass.

### F2 — serviceRecordsUnavailable reset inside !preloadedRecords guard instead of unconditional

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: schedule-view.ts:118–122
- **Detail**: Plan specified unconditional reset at top of generateSchedule. Implementation places it inside if (!preloadedRecords). On investigation during triage, the implementation is CORRECT: ngOnInit calls generateSchedule(loadedRecords) AFTER the Instance A catch sets the signal — an unconditional reset would clear the warning before the UI renders. An attempted fix confirmed this (1 test failure). The plan instruction was imprecise.
- **Decision**: DISMISSED — implementation is correct; the plan's specified placement was wrong.

### F3 — snackBar.open spied via debugElement.injector.get instead of TestBed.overrideComponent

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: schedule-view.spec.ts:261, 313, 360
- **Detail**: vi.spyOn(fixture.debugElement.injector.get(MatSnackBar), 'open') is fragile — spy stops intercepting if MatSnackBarModule moves to a parent injector. The MatDialog spy in the same file uses the safer TestBed.overrideComponent pattern.
- **Fix A ⭐ Recommended**: Replace all three spy setups with TestBed.overrideComponent({ set: { providers: [{ provide: MatSnackBar, useValue: { open: snackBarOpenSpy } }] } }).
- **Decision**: FIXED via Fix A — all three describe blocks converted to overrideComponent pattern.

### F4 — Identical snackBar.open call duplicated in two catch blocks

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: schedule-view.ts:95–99 and 128–133
- **Detail**: Three-line snackBar.open block copy-pasted verbatim in both Instance A and Instance B catch blocks. Single update point risk.
- **Fix**: Extract private notifyServiceRecordsUnavailable(err) helper.
- **Decision**: FIXED — helper extracted, both catch blocks collapse to one line each.

### F5 — Happy-path test in own sibling describe, not nested in Sub-group A

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: schedule-view.spec.ts (~line 283)
- **Detail**: Plan grouped 3 Sub-group A tests in one describe. Implementation separates happy-path into a sibling describe. Coverage is identical; the separation is arguably clearer.
- **Decision**: SKIPPED — sibling describe is clearer; no behavioral difference.
