<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Auth Scaffold Implementation Plan

- **Plan**: context/changes/auth-scaffold/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-06-04
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Grounding

Automated success criteria all green:

- `npm run build` passes (only a bundle-budget warning, not an error)
- `npm test` — 8/8 spec cases pass, 0 skipped
- Deps present: `@supabase/supabase-js`, `@angular/material`, `@angular/cdk`, `@angular/animations`, `vitest`, `happy-dom`
- `indigo-pink` prebuilt theme wired in `angular.json` styles
- `@angular/build:unit-test` test target present

Load-bearing plan details implemented exactly: `getSession()` `.catch().finally()` so `initialized` always resolves; `onAuthStateChange` is the exclusive post-init updater; guard `await`s `initialized` before checking auth. Routes use lazy `loadComponent`; `app.html` is the bare outlet.

## Findings

### F1 — Unplanned form niceties (isSubmitting + validators)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/app/auth/login/login.ts:26, src/app/auth/signup/signup.ts:22-23
- **Detail**: Both forms add an `isSubmitting` signal (disables the button + swaps label during the async call) and field validators (email format; signup password `minLength(6)`). None appear in the Phase 3 contract, which specified only the `errorMessage` signal and two plain `mat-form-field` controls. Benign UX improvements, not drift — flagged only so the plan-vs-code delta is on record.
- **Fix**: Accept as-is (improvements). Optionally backfill a one-line note in the plan's Phase 3 contract for traceability.
- **Decision**: ACCEPTED — benign UX improvements, kept as-is, no plan change.

### F2 — Navigation promises are fire-and-forget

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/app/auth/login/login.ts:38, src/app/auth/signup/signup.ts:38, src/app/dashboard/dashboard.ts:17
- **Detail**: `this.router.navigate([...])` returns a `Promise<boolean>` that is never awaited or checked. If a guard cancels the navigation (returns false) or it rejects, the failure is swallowed silently and the user is left on the form with no feedback. Works today because the post-login guard check passes, but it's an unguarded edge.
- **Fix**: `await this.router.navigate([...])` (the handlers are already async), or check the resolved boolean. Lowest-risk: just await.
- **Decision**: FIXED — awaited navigate in login.ts, signup.ts; dashboard.ts navigate handled together with F3.

### F3 — signOut navigation gated on an unguarded network call

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/app/dashboard/dashboard.ts:15-18
- **Detail**: `await this.auth.signOut()` precedes the navigate. If `signOut()` rejects (network/timeout), the await throws, navigation never runs, and the rejection is unhandled — the user stays on a dashboard for a session that may already be torn down locally.
- **Fix**: Wrap signOut in try/finally so navigation to /login always runs, e.g. `try { await this.auth.signOut(); } finally { await this.router.navigate(['/login']); }`.
- **Decision**: FIXED — wrapped signOut in try/finally; navigate always runs and is awaited (also resolves F2's dashboard navigate).
