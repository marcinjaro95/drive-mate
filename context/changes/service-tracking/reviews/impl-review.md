<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Service Tracking (FR-006 Mark as Done)

- **Plan**: context/changes/service-tracking/plan.md
- **Scope**: All phases (Phase 1 + Phase 2 of 2)
- **Date**: 2026-06-07
- **Verdict**: APPROVED (all findings fixed during triage)
- **Findings**: 0 critical | 3 warnings | 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — isSaving permanently locked after unexpected throw in mileage catch

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/vehicles/schedule-view/schedule-view.ts:120–153
- **Detail**: isSaving reset only at explicit error/success exit points; an unexpected throw (e.g. in cleanup code lines 150–152) would lock the Save button permanently. Sibling generateSchedule() already uses try/finally.
- **Fix Applied**: Wrapped saveMarkDone body in try/finally { isSaving.set(false) }, removing manual resets.
- **Decision**: FIXED (Fix A)

### F2 — Stale vehicle() signal after mileage sync failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/vehicles/schedule-view/schedule-view.ts:140–148
- **Detail**: When updateVehicle throws in the mileage sync catch, the vehicle() signal was not updated, causing stale mileage prefill on subsequent openMarkDone() calls.
- **Fix Applied**: Added `this.vehicle.set({ ...vehicle, current_mileage: mileage! })` in the mileage sync catch block (optimistic update, no extra network call).
- **Decision**: FIXED

### F3 — getServiceRecord missing user_id ownership filter (pre-existing)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/core/service-records/service-record.service.ts:25–33
- **Detail**: Pre-existing: getServiceRecord(id) queried only by id with no user_id filter, unlike all other methods in the service. Defense-in-depth gap against IDOR if RLS is misconfigured.
- **Fix Applied**: Added `const user = this.auth.currentUser(); if (!user) throw new Error('Unauthenticated');` and `.eq('user_id', user.id)` to the getServiceRecord query.
- **Decision**: FIXED

### F4 — Signal race: expandedItem not snapshotted before first await

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/vehicles/schedule-view/schedule-view.ts:121–134
- **Detail**: saveMarkDone used this.vehicle()! and this.expandedItem()! after the guard check but before/during awaits; a Cancel between guard and await could cause a non-null assertion throw.
- **Fix Applied**: Snapshotted `const vehicle = this.vehicle()!` and `const item = this.expandedItem()!` at top of saveMarkDone; use locals throughout.
- **Decision**: FIXED

### F5 — No ownership-enforcement test for getServiceRecord

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/core/service-records/service-record.service.spec.ts
- **Detail**: No test asserting the user_id filter is applied in getServiceRecord; paired with F3.
- **Fix Applied**: Added `it('filters by user_id to enforce ownership', ...)` to the getServiceRecord describe block; asserts `builder.eq` called with ('user_id', 'user-abc').
- **Decision**: FIXED

### F6 — track item.item uses label string as key; duplicate labels would glitch

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/vehicles/schedule-view/schedule-view.html:43
- **Detail**: @for tracking by label string causes Angular to treat same-label items as the same DOM node, potentially glitching the mark-done expand/collapse.
- **Fix Applied**: Changed `track item.item` to `track $index`.
- **Decision**: FIXED

### F7 — vi not explicitly imported in service-record.service.spec.ts

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/core/service-records/service-record.service.spec.ts:1
- **Detail**: vi used as implicit Vitest global; inconsistent with ai-schedule.service.spec.ts which imports it explicitly.
- **Fix Applied**: Added `import { vi } from 'vitest';` as first import.
- **Decision**: FIXED
