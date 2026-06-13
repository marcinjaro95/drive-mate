<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Car Deletion Implementation Plan

- **Plan**: context/changes/car-deletion/plan.md
- **Scope**: All phases (1–4 of 4)
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — isDeleting not reset on success path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/shared/confirm-dialog/confirm-dialog.ts:30
- **Detail**: Success path calls `dialogRef.close()` but never resets `isDeleting` to false. Error path correctly resets it (line 33). In production the dialog is destroyed by close() so the button never visibly sticks. But in tests — where dialogRef.close() is a mock no-op — a second call to confirm() on the same instance starts with isDeleting() still true. The asymmetry also makes a future refactor easy to break.
- **Fix**: Restructure confirm() with a finally block so isDeleting is always reset.
  - Strength: Eliminates the asymmetry; robust to any future dialog reuse scenarios.
  - Tradeoff: One-line change on the success path; negligible cost.
  - Confidence: HIGH — finally is the canonical pattern for cleanup after async operations.
  - Blind spot: None significant.
- **Decision**: FIXED — applied finally block; removed asymmetric isDeleting.set(false) from catch branch.

### F2 — openDeleteDialog() does not guard against in-flight AI generation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/vehicles/schedule-view/schedule-view.ts:79
- **Detail**: If the user opens delete dialog while isGenerating() is true, ngOnDestroy aborts the AI fetch on navigation — so no data corruption. But there's no UI guard and a narrow race where the AI write completes between confirmation and component destruction (fails silently under RLS).
- **Fix A ⭐ Recommended**: Abort the controller at the top of openDeleteDialog() before opening the dialog. `this.abortController?.abort();`
  - Strength: Ensures the AI fetch is cancelled the moment the user opens the delete dialog.
  - Tradeoff: Aborts a generation the user didn't explicitly cancel; acceptable since they signalled intent to delete.
  - Confidence: HIGH — ngOnDestroy already does this; same call site.
  - Blind spot: Haven't verified whether abortController is always initialized when isGenerating() is true.
- **Fix B**: Disable the Delete car button while isGenerating() via `[disabled]="isGenerating()"`.
  - Strength: Prevents the race entirely by blocking the dialog until generation completes.
  - Tradeoff: User can't delete while generation is running; may be unexpected UX.
  - Confidence: MEDIUM — depends on whether blocking is acceptable UX.
  - Blind spot: User is stuck if generation hangs.
- **Decision**: FIXED via Fix A — added `this.abortController?.abort()` at the top of openDeleteDialog() before opening the dialog.

### F3 — Spec stubs bypass DI with (component as any).dialog

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/vehicles/vehicle-list/vehicle-list.spec.ts:~51 / src/app/vehicles/schedule-view/schedule-view.spec.ts:~53
- **Detail**: Both specs replace the injected dialog field via direct property assignment after component creation. The real MatDialog was still injected and initialized (potential JSDOM overlay noise), and the any cast removes type safety on the mock object.
- **Fix**: Use `TestBed.overrideComponent` to replace the DI binding before compileComponents() so the real MatDialog is never instantiated.
- **Decision**: FIXED — replaced `(component as any).dialog` property assignment with `TestBed.overrideComponent` provider override in both spec files; real MatDialog no longer instantiated.

### F4 — Cancel button uses mat-button instead of mat-flat-button

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/app/shared/confirm-dialog/confirm-dialog.html:11
- **Detail**: Plan says "Cancel flat button" (mat-flat-button). Implementation uses mat-button (text/basic variant). Purely a visual Material variant difference.
- **Fix**: Change mat-button to mat-flat-button on the Cancel button if the plan's visual spec was intentional.
- **Decision**: FIXED — changed mat-button to mat-flat-button on the Cancel button.

### F5 — isDeleting and error signals not marked readonly

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/shared/confirm-dialog/confirm-dialog.ts:22–23
- **Detail**: `data` and `dialogRef` are readonly; `isDeleting` and `error` are not. Angular convention marks signal fields readonly (the signal reference doesn't change; only its value does via .set()). Mixed convention within the same class.
- **Fix**: Add `readonly` to both signal declarations.
- **Decision**: FIXED — added readonly to isDeleting and error signal declarations.

### F6 — Extra error.set(null) on retry not described in plan

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/app/shared/confirm-dialog/confirm-dialog.ts:27
- **Detail**: Plan doesn't mention clearing error at the start of each attempt. Implementation does (line 27) — a sensible defensive addition for the retry-after-error UX path. No drift in behavior; purely a plan gap.
- **Fix**: No code change needed. Benign addition; the plan can be left as-is.
- **Decision**: SKIPPED — benign plan gap; code behavior is correct.
