<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Auth Scaffold Implementation Plan

- **Plan**: context/changes/auth-scaffold/plan.md
- **Mode**: Deep (post-implementation retrospective)
- **Date**: 2026-06-04
- **Verdict**: REVISE
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

5/5 paths ✓ (all created), 4/4 symbols ✓ (authGuard, initialized, provideAnimationsAsync, onAuthStateChange)

## Findings

### F1 — Phase 4 assumes test runner exists but never sets it up

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — AuthService Unit Tests
- **Detail**: Phase 4 opens with "npm test runs all specs" as its success criterion but no phase configures the runner. In practice, npm test failed immediately — ng test had no target. Three unplanned steps were needed: install vitest + happy-dom, add @angular/build:unit-test target to angular.json, wire tsconfig.spec.json.
- **Fix**: Add a setup step at the start of Phase 4 listing the installs and the angular.json target addition.
- **Decision**: FIXED — added Phase 4 Change #0 (Vitest runner setup step)

### F2 — getSession() network failure freezes the guard; no plan coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details / Phase 2
- **Detail**: When getSession() rejects (DNS failure, paused project, timeout), an unhandled rejection propagates through the guard's await, Angular Router cancels all navigation, and the app renders nothing. Hit in practice when the Supabase project was temporarily unreachable.
- **Fix**: Add network failure defensive pattern to Critical Implementation Details: catch getSession() rejections, set currentUser to null, still set isLoading to false via finally().
- **Decision**: FIXED — added defensive pattern paragraph to Critical Implementation Details

### F3 — ng add @angular/material schematic failure not anticipated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Install packages
- **Detail**: In Angular 21 the schematic fails mid-run with "Cannot read properties of undefined (reading 'primary')". Packages install but no file mutations apply. The plan had no fallback.
- **Fix**: Add verification checklist + manual fallback note to the Phase 1 ng add step.
- **Decision**: FIXED — updated Phase 1 install contract with verification checklist and manual fallback

### F4 — "Exclusive updater" claim contradicts constructor behavior

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details
- **Detail**: "onAuthStateChange is the exclusive updater of currentUser" — but the constructor also sets \_currentUser directly from getSession(). Overstated exclusivity would confuse future readers.
- **Fix**: Scope the claim to "after initialization".
- **Decision**: FIXED — scoped via the F2 fix ("after initialization" wording added)

### F5 — @angular/animations missing from Phase 1 package list

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Install packages
- **Detail**: provideAnimationsAsync() requires @angular/animations, absent from the install list. When the schematic fails, the build errors with a bundler error rather than a TypeScript error, making it hard to diagnose.
- **Fix**: Add @angular/animations to the explicit install command.
- **Decision**: FIXED — folded into F3 fix (added to install command)

### F6 — Phase 2 "forward reference" creates an invisible prerequisite

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 → Phase 3 boundary
- **Detail**: Phase 2 said "imports will be added in Phase 3.5" but with lazy loadComponent, TypeScript resolves paths at build time — Phase 2's build criterion fails unless stub files already exist. Phase 3.5 as described was a no-op.
- **Fix**: Replace the forward-reference note with stub-file instructions.
- **Decision**: FIXED — replaced forward-reference note with loadComponent + stub file instructions
