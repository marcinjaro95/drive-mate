<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: UI Improvements

- **Plan**: context/changes/ui-improvements/plan.md
- **Scope**: All Phases (1–6)
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 1 warning · 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

### Automated Verification Results

- `npm run build` — ✅ clean
- `grep -c '#[0-9a-fA-F]' schedule-view.scss` — ✅ returns 0
- `grep -rn '#[0-9a-fA-F]{3,6}' src/app/**/*.scss` — ✅ returns empty
- `npm test` — ✅ 46/46 passed

## Findings

### F1 — track $index on a keyed schedule list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/vehicles/schedule-view/schedule-view.html:51
- **Detail**: The @for loop used `track $index`. When the AI regenerates a schedule with items in a different order, Angular destroys and recreates every DOM node unnecessarily. The expanded-item comparison at line 67 already uses `item.item` as stable identity.
- **Fix**: Changed `track $index` → `track item.item`.
- **Decision**: FIXED

### F2 — .spinner-container used but never styled

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/vehicles/vehicle-list/vehicle-list.html:3, src/app/vehicles/schedule-view/schedule-view.html:20
- **Detail**: Both templates wrapped `<mat-progress-spinner>` in `<div class="spinner-container">` but no CSS rule existed. Spinner left-aligned instead of centering. Pre-existing issue.
- **Fix**: Added `.spinner-container { display: flex; justify-content: center; padding: var(--space-xl) 0; }` to src/styles.scss.
- **Decision**: FIXED

### F3 — .vehicle-add-container duplicates the .page-content contract

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/vehicles/vehicle-add/vehicle-add.scss:1-4, src/app/vehicles/vehicle-add/vehicle-add.html:2
- **Detail**: `.vehicle-add-container` set max-width/margin/padding identically to the global `.page-content` utility. vehicle-list and schedule-view use `<div class="page-content">` as outer wrapper; vehicle-add used `<div class="vehicle-add-container">` instead — two sources of truth.
- **Fix**: Replaced `<div class="vehicle-add-container">` with `<div class="page-content">` in HTML; removed the duplicate layout rules from the SCSS.
- **Decision**: FIXED

### F4 — Inline .replace() call in schedule-view template

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/vehicles/schedule-view/schedule-view.html:55
- **Detail**: `item.urgency.replace('_', '-')` appeared inline in a `[class]` binding. View transformation logic belongs in the component, not the template. Pre-existing issue.
- **Fix**: Added `urgencyClass(urgency: string): string` method to ScheduleViewComponent; updated template to `[class]="urgencyClass(item.urgency)"`.
- **Decision**: FIXED

### F5 — Redundant box-sizing in auth SCSS files

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/auth/login/login.scss, src/app/auth/signup/signup.scss
- **Detail**: Both auth files declared `box-sizing: border-box` on `.auth-container`. The global reset in styles.scss already applies this to `*, *::before, *::after` — redundant noise.
- **Fix**: Removed the `box-sizing: border-box` line from both files.
- **Decision**: FIXED
