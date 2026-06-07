# UI Improvements Implementation Plan

## Overview

Apply a consistent visual design across all DriveMate screens. Deliver a custom Angular Material M3 theme (deep-blue primary), CSS custom property token system, enhanced in-page navigation with breadcrumbs, auth branding, component-specific styling for all five user-facing screens, and 375px mobile verification.

## Current State Analysis

- Angular Material 21 with `indigo-pink` prebuilt theme — no custom brand identity
- `styles.scss` is empty — no global tokens, spacing scale, or typography rules
- Colors scattered across per-component SCSS (urgency chips, banners, and auth errors all use hardcoded hex values)
- Three components have no SCSS file at all: `vehicle-list`, `vehicle-add`, `dashboard`
- Login page shows `<h1>Sign in</h1>` as the first visible element — no DriveMate brand anchor
- `← My cars` back-link sits at the very bottom of `schedule-view.html`, below all schedule cards — poor UX positioning
- Mobile responsiveness (375px NFR) not verified for any screen since feature implementation

### Key Discoveries:

- `angular.json:55` — `@angular/material/prebuilt-themes/indigo-pink.css` is in the `styles` array; must be removed before adding the custom M3 theme to avoid conflicts
- `schedule-view.scss:20-33` — three urgency chip colors use hardcoded hex with `!important`; must migrate to CSS custom properties
- `schedule-view.scss:66-73` — two banner background colors (`#fff8e1`, `#fce4ec`) are hardcoded
- `schedule-view.html:125-127` — back-link `<div>` is the last element in the template; move it to the top
- `vehicle-list.ts`, `vehicle-add.ts`, `dashboard.ts` — none reference a `styleUrl`; new SCSS files require adding this property to the `@Component` decorator

## Desired End State

Every DriveMate screen uses a unified design language: deep-blue M3 Material theme, shared CSS token vocabulary, consistent card padding, typography scale, and button hierarchy. Breadcrumb navigation appears at the top of deep-link pages. Auth pages carry a DriveMate wordmark. All screens pass a visual-consistency checklist at both desktop and 375px mobile.

### Verify by:
- Running `npm run build` with zero errors after each phase
- Navigating each route manually and confirming visual coherence
- Opening each screen at 375px in Chrome DevTools with no horizontal scroll

## What We're NOT Doing

- No dark mode — single light theme only
- No custom icon set or SVG logo assets — text wordmark only
- No animation overhaul — shimmer keeps current timing, only colors migrate to tokens
- No routing, guard, or data service changes
- No sidenav or navigation drawer
- No FR-007/FR-008 (service history list, edit record) — parked

## Implementation Approach

Work from the design system outward: establish the token layer and M3 theme first, then enhance shell navigation, then polish each screen in order of the user journey (auth → vehicles → schedule), then verify the whole app at mobile. Each phase is independently reviewable.

---

## Phase 1: Design System Foundation

### Overview

Remove the prebuilt indigo-pink theme. Define an Angular Material M3 custom theme with a deep-blue primary palette. Add a CSS custom property token vocabulary at `:root` covering color, spacing, and typography. Establish baseline global layout rules.

### Changes Required:

#### 1. Remove prebuilt theme from build config

**File**: `angular.json`

**Intent**: Eliminate the indigo-pink prebuilt so it cannot override the custom M3 theme.

**Contract**: Remove the `"@angular/material/prebuilt-themes/indigo-pink.css"` string from the `styles` array under `projects.<name>.architect.build.options`. The `"src/styles.scss"` entry must remain.

#### 2. Angular Material M3 theme + CSS token vocabulary

**File**: `src/styles.scss`

**Intent**: Define the custom M3 theme and every shared design token that all components will reference. This file becomes the single source of truth for colors, spacing, and typography scale.

**Contract**:
- Open with `@use '@angular/material' as mat;`
- Define a light M3 theme using `mat.define-theme()` with `mat.$blue-palette` as the primary (deep-blue family, closest to `#1565C0`). Consult `node_modules/@angular/material/_index.scss` for the exact mixin signatures current to Angular Material 21.
- Apply the theme to the `html` selector using the appropriate M3 apply mixin (`mat.theme()` or `mat.all-component-themes()` — verify against Angular Material 21 API).
- After the Material theme block, declare the following CSS custom properties at `:root`:
  - Urgency/status: `--color-overdue: #f44336`, `--color-due-soon: #ff9800`, `--color-upcoming: #4caf50`, plus `-text` variants set to `#fff`
  - Banner backgrounds: `--color-regen-bg: #fff8e1`, `--color-warning-bg: #fce4ec`
  - Skeleton: `--color-skeleton-base: #e0e0e0`, `--color-skeleton-shine: #f5f5f5`
  - Spacing scale: `--space-xs: 4px`, `--space-sm: 8px`, `--space-md: 16px`, `--space-lg: 24px`, `--space-xl: 32px`
  - Typography: `--text-sm: 0.875rem`, `--text-base: 1rem`
  - Layout: `--content-max-width: 720px`, `--border-radius-sm: 4px`
- Add baseline global rules: `*, *::before, *::after { box-sizing: border-box; }` and `body { margin: 0; font-family: Roboto, sans-serif; }`
- Define a utility class `.page-content { max-width: var(--content-max-width); margin: 0 auto; padding: var(--space-md); }` — used by all page components for consistent max-width containment.

### Success Criteria:

#### Automated Verification:

- Build succeeds with zero errors: `npm run build`

#### Manual Verification:

- App loads at localhost:4200 with the primary button color visibly different from indigo — should be deep blue
- CSS custom properties are visible under `:root` in Chrome DevTools Elements → Computed
- No visual regressions on any existing screen (the theme changes only colors, not layout)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Navigation Shell Enhancement

### Overview

Add a styled SCSS file for the dashboard shell. Move the `← My cars` back-link from the bottom to the top of the schedule view. Add breadcrumb back navigation at the top of the add-vehicle page.

### Changes Required:

#### 1. Dashboard header SCSS

**File**: `src/app/dashboard/dashboard.scss` (create new)

**Intent**: The dashboard header currently has no custom styling — it renders with no background, no padding, and generic font sizing. This file establishes the branded navigation bar.

**Contract**:
- Style `.dashboard-header` with a solid background using the M3 primary surface token (`var(--mat-sys-primary)` or equivalent M3 token for the header surface), white text for `.app-name`, `height: 56px`, horizontal padding of `var(--space-md)`, and `display: flex; align-items: center; justify-content: space-between`.
- Style `.dashboard-main` with `padding: var(--space-md)`.
- Add `styleUrl: './dashboard.scss'` to the `@Component` decorator in `dashboard.ts`.

#### 2. Schedule view — move back-link to top

**File**: `src/app/vehicles/schedule-view/schedule-view.html`

**Intent**: The `← My cars` link is currently the very last element in the template. Users on mobile must scroll past all schedule cards to navigate back — this is the highest-impact UX fix in the change.

**Contract**: Move the `<div class="back-link">` element from its current position at the bottom of the template to line 1, before the `@if (!isLoading())` vehicle-header block. No template logic changes — only element position.

#### 3. Vehicle-add page — breadcrumb at top

**File**: `src/app/vehicles/vehicle-add/vehicle-add.html`

**Intent**: The form has no visible path back to the vehicle list except a Cancel link buried in the form actions. A top-level breadcrumb is consistent with the pattern applied to the schedule view.

**Contract**: Insert `<nav class="page-nav"><a routerLink="/dashboard">← My cars</a></nav>` as the first child of the template, before `.vehicle-add-container`. The existing Cancel anchor in `.form-actions` can remain as secondary navigation.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`

#### Manual Verification:

- Dashboard header displays a colored background (brand blue) with "DriveMate" and "Sign out" visible
- Schedule view: "← My cars" appears above the vehicle name, not below the schedule list
- Add-vehicle page: "← My cars" link appears at the top before the form heading
- Both back-links navigate correctly to `/dashboard`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Auth Pages

### Overview

Add a DriveMate wordmark above the sign-in and sign-up forms. Migrate both auth SCSS files to use shared token variables for spacing and typography sizes.

### Changes Required:

#### 1. Login page — add brand wordmark

**File**: `src/app/auth/login/login.html`

**Intent**: The login page is the first thing a new user sees. A brand wordmark establishes identity before the form appears and differentiates the app from a generic login form.

**Contract**: Insert `<div class="auth-brand"><span class="brand-name">DriveMate</span></div>` as the first child of `.auth-container`, before the existing `<h1>Sign in</h1>`.

**File**: `src/app/auth/login/login.scss`

**Intent**: Replace magic number spacing and font sizes with token references. Add styles for the new brand elements.

**Contract**:
- Replace `margin-bottom: 1.5rem` → `margin-bottom: var(--space-lg)` in `h1`
- Replace `margin-top: 1.5rem` → `margin-top: var(--space-lg)` in `.auth-link`
- Replace both `font-size: 0.875rem` occurrences → `font-size: var(--text-sm)` (`.error` and `.auth-link`)
- Add `.auth-brand { text-align: center; margin-bottom: var(--space-lg); }`
- Add `.brand-name { font-size: 1.75rem; font-weight: 700; color: var(--mat-sys-primary); letter-spacing: -0.5px; }`

#### 2. Signup page — mirror login changes

**File**: `src/app/auth/signup/signup.html`

**Intent**: Apply the identical brand wordmark to keep both auth pages visually consistent.

**Contract**: Insert the same `<div class="auth-brand"><span class="brand-name">DriveMate</span></div>` block as the first child of `.auth-container`, before the `<h1>Sign up</h1>`.

**File**: `src/app/auth/signup/signup.scss`

**Intent**: Apply the same token migration as login.scss.

**Contract**: Apply identical changes as listed for `login.scss` above. The two files should be structurally identical after this phase.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`

#### Manual Verification:

- Login page: "DriveMate" wordmark appears above "Sign in" in the brand primary color
- Signup page: "DriveMate" wordmark appears above "Sign up" in the brand primary color
- Form layout is unchanged — centered, full-height, usable

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Vehicle Pages

### Overview

Create SCSS files for vehicle-list and vehicle-add (neither currently exists). Add card visual hierarchy for the vehicle list. Apply token-based layout to the add-car form. Register both new files in their `@Component` decorators.

### Changes Required:

#### 1. Vehicle list SCSS

**File**: `src/app/vehicles/vehicle-list/vehicle-list.scss` (create new)

**Intent**: The vehicle list has no custom styles — all visual treatment falls through to Material defaults, producing an unpolished appearance with no layout control or visual hierarchy.

**Contract**:
- `.vehicle-list`: `display: flex; flex-direction: column; gap: var(--space-md);`
- `.vehicle-card`: `cursor: pointer; transition: box-shadow 0.2s ease;` with a `:hover` rule adding a raised shadow (use `box-shadow: 0 4px 8px rgba(0,0,0,0.12)`)
- `.empty-state`: `text-align: center; padding: var(--space-xl) var(--space-md);`
- `.add-car-row`: `margin-top: var(--space-md); display: flex; justify-content: center;`
- `.error-message`: `color: var(--mat-sys-error); padding: var(--space-md);`

Add `styleUrl: './vehicle-list.scss'` to the `@Component` decorator in `vehicle-list.ts`.

#### 2. Vehicle list template — page-content wrapper

**File**: `src/app/vehicles/vehicle-list/vehicle-list.html`

**Intent**: Wrap the full template in `.page-content` so the list picks up the max-width layout from global styles — preventing it from stretching edge-to-edge on large displays.

**Contract**: Wrap the entire existing template content in `<div class="page-content">…</div>`.

#### 3. Vehicle-add SCSS

**File**: `src/app/vehicles/vehicle-add/vehicle-add.scss` (create new)

**Intent**: The add-car form currently has no SCSS — fields render without consistent width or spacing, and the form floats without max-width containment.

**Contract**:
- `.vehicle-add-container`: `max-width: var(--content-max-width); margin: 0 auto; padding: var(--space-md);`
- `mat-form-field`: `display: block; width: 100%;`
- `h2`: `margin-top: 0; margin-bottom: var(--space-md);`
- `.form-actions`: `display: flex; align-items: center; gap: var(--space-sm); margin-top: var(--space-md);`
- `.form-error`: `color: var(--mat-sys-error); font-size: var(--text-sm);`
- `.page-nav`: `margin-bottom: var(--space-sm); a { color: var(--mat-sys-primary); text-decoration: none; }`

Add `styleUrl: './vehicle-add.scss'` to the `@Component` decorator in `vehicle-add.ts`.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`

#### Manual Verification:

- Vehicle list: cards have consistent padding; hover raises a visible shadow; empty state is centered
- Vehicle list: on wide viewports, content is constrained to max-width — not stretched full-width
- Add-car form: all fields span full width; spacing between fields is consistent; form error color matches the theme error color

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Schedule View Polish

### Overview

Migrate all hardcoded hex values in schedule-view.scss to CSS custom properties. Standardize banner styling with token-based spacing and border-radius. Add a `.page-content` wrapper to the schedule view template for max-width consistency.

### Changes Required:

#### 1. Migrate schedule-view.scss to tokens

**File**: `src/app/vehicles/schedule-view/schedule-view.scss`

**Intent**: Eliminate the eight hardcoded hex values (chip colors, banner backgrounds, save-error color) by replacing them with the CSS custom properties defined in Phase 1. This validates the token system end-to-end.

**Contract**:
- `.chip-overdue`: `background-color: var(--color-overdue) !important; color: var(--color-overdue-text) !important`
- `.chip-due-soon`: `background-color: var(--color-due-soon) !important; color: var(--color-due-soon-text) !important`
- `.chip-upcoming`: `background-color: var(--color-upcoming) !important; color: var(--color-upcoming-text) !important`
- `.skeleton-bar` gradient: replace `#e0e0e0` → `var(--color-skeleton-base)`, `#f5f5f5` → `var(--color-skeleton-shine)`
- `.save-error`: replace `#f44336` → `var(--color-overdue)` (same red, semantic grouping as critical/error)
- `.regen-prompt`: replace `#fff8e1` → `var(--color-regen-bg)`; add `border-radius: var(--border-radius-sm)`
- `.mileage-warning`: replace `#fce4ec` → `var(--color-warning-bg)`; add `border-radius: var(--border-radius-sm)`
- Raw `px` spacing in `.mark-done-form`, `.mark-done-actions`, `.regen-prompt`, `.mileage-warning`: replace with token equivalents (`16px` → `var(--space-md)`, `8px` → `var(--space-sm)`, `12px` → `var(--space-sm)`, `14px` → `var(--text-sm)`, `4px` → `var(--space-xs)`)

#### 2. Schedule view template — page-content wrapper

**File**: `src/app/vehicles/schedule-view/schedule-view.html`

**Intent**: Wrap the content in `.page-content` for max-width containment, consistent with the vehicle-list and vehicle-add pages.

**Contract**: Wrap the entire template in `<div class="page-content">…</div>`. The `.back-link` div (moved to the top in Phase 2) becomes the first child inside this wrapper.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`
- No hardcoded hex values remain in `schedule-view.scss`: `grep -c '#[0-9a-fA-F]' src/app/vehicles/schedule-view/schedule-view.scss` returns 0

#### Manual Verification:

- Urgency chips display correct colors (red/amber/green) after token migration
- Regen and mileage-warning banners appear with rounded corners and correct background colors
- Schedule cards have padding consistent with vehicle-list cards
- Marking a service as done and dismissing the banners works as before (no functional regression)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Mobile + Consistency Verification

### Overview

Manually verify every screen at 375px viewport width. Run through the visual consistency checklist. Apply targeted CSS fixes for any regressions discovered — this phase may produce minor SCSS tweaks across multiple files.

### Changes Required:

#### 1. Mobile viewport verification

**File**: No predetermined file — apply targeted SCSS fixes where 375px verification reveals failures.

**Intent**: Confirm the 375px viewport NFR from the PRD holds for every screen delivered by S-01 through S-04. Common suspects: `.mat-card-header` overflow on long vehicle names, `.form-actions` flex row needing to stack on narrow widths, banner text wrapping gracefully.

**Contract**: Open Chrome DevTools at 375×812 (iPhone SE profile) and verify each screen in sequence: login → signup → vehicle list (populated) → vehicle list (empty state) → add car → schedule view (loaded) → schedule view (generating skeleton). For each, confirm: no horizontal scrollbar, all interactive tap targets ≥ 44×44px, no text clipped or overflowing its container. Fix any failures with targeted media queries or layout adjustments in the appropriate component SCSS file.

#### 2. Visual consistency checklist

**File**: No code change — review exercise.

**Intent**: Confirm the token system is applied uniformly before closing the change.

**Contract**: Verify the following across all five screens:
- All primary-action buttons use `mat-raised-button color="primary"` (or the M3 equivalent if it changed)
- All secondary/cancel buttons use `mat-button` or `mat-stroked-button`
- No raw hex values in any component SCSS file outside of `styles.scss` (`grep -rn '#[0-9a-fA-F]\{3,6\}' src/app/**/*.scss`)
- All page content areas are wrapped in `.page-content` for consistent max-width
- Error text across all components uses `var(--mat-sys-error)` or `var(--color-overdue)` — not inline styles or hardcoded colors

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`
- No hardcoded hex values in any component SCSS (grep returns empty): `grep -rn '#[0-9a-fA-F]\{3,6\}' src/app/**/*.scss`
- Existing tests still pass: `npm test`

#### Manual Verification:

- All 5 screens verified at 375px — no horizontal scroll on any
- Visual consistency checklist passes: every item above confirmed ✓
- App subjectively looks coherent: same card style, same button hierarchy, same color language across all screens

---

## Testing Strategy

### Unit Tests:

- No new unit tests needed — this change is purely presentational (SCSS, HTML structure, Material theme). Component logic is untouched.
- Verify existing specs still pass after each phase: `npm test`

### Integration Tests:

- None required — no service, routing, or API changes.

### Manual Testing Steps:

1. After Phase 1: open localhost:4200, confirm primary buttons are deep blue (not indigo)
2. Navigate the full route flow: /login → /signup → /dashboard → /dashboard/vehicles/new → /dashboard/vehicles/:id
3. On schedule view: expand a Mark-as-done form, fill it in, save — verify regen banner appears correctly styled
4. Open the delete confirmation dialog from both the vehicle list and the schedule view — verify it inherits the new theme
5. At 375px (DevTools): repeat the full route flow and confirm no layout breaks

## References

- Roadmap S-05: `context/foundation/roadmap.md:144`
- Schedule view SCSS (pre-change): `src/app/vehicles/schedule-view/schedule-view.scss`
- Auth SCSS (pre-change): `src/app/auth/login/login.scss`
- Angular Material 21 M3 theming API: `node_modules/@angular/material/_index.scss`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Design System Foundation

#### Automated

- [x] 1.1 Build succeeds with zero errors: `npm run build` — cd0d709

#### Manual

- [x] 1.2 Primary buttons show deep blue (not indigo) on all screens — cd0d709
- [x] 1.3 CSS custom properties visible under `:root` in Chrome DevTools — cd0d709

### Phase 2: Navigation Shell Enhancement

#### Automated

- [x] 2.1 Build succeeds: `npm run build` — b7bd39f

#### Manual

- [x] 2.2 Dashboard header shows colored background with DriveMate branding — b7bd39f
- [x] 2.3 Schedule view: "← My cars" appears above the vehicle name — b7bd39f
- [x] 2.4 Add-vehicle page: "← My cars" link appears at the top before the form — b7bd39f
- [x] 2.5 Both back-links navigate correctly to /dashboard — b7bd39f

### Phase 3: Auth Pages

#### Automated

- [x] 3.1 Build succeeds: `npm run build` — 7c7d714

#### Manual

- [x] 3.2 Login page: DriveMate wordmark visible above "Sign in" in brand color — 7c7d714
- [x] 3.3 Signup page: DriveMate wordmark visible above "Sign up" in brand color — 7c7d714
- [x] 3.4 Auth form layout unchanged — centered, full-height, usable — 7c7d714

### Phase 4: Vehicle Pages

#### Automated

- [x] 4.1 Build succeeds: `npm run build`

#### Manual

- [x] 4.2 Vehicle list cards have consistent padding and a visible hover shadow
- [x] 4.3 Vehicle list content constrained to max-width on wide viewports
- [x] 4.4 Add-car form fields span full width; error color matches theme

### Phase 5: Schedule View Polish

#### Automated

- [ ] 5.1 Build succeeds: `npm run build`
- [ ] 5.2 `grep -c '#[0-9a-fA-F]' src/app/vehicles/schedule-view/schedule-view.scss` returns 0

#### Manual

- [ ] 5.3 Urgency chips show correct colors after token migration
- [ ] 5.4 Regen and mileage-warning banners display with rounded corners
- [ ] 5.5 Schedule cards have padding consistent with vehicle-list cards
- [ ] 5.6 Mark-as-done and banner dismiss work without functional regression

### Phase 6: Mobile + Consistency Verification

#### Automated

- [ ] 6.1 Build succeeds: `npm run build`
- [ ] 6.2 `grep -rn '#[0-9a-fA-F]\{3,6\}' src/app/**/*.scss` returns empty (excluding styles.scss)
- [ ] 6.3 Existing tests pass: `npm test`

#### Manual

- [ ] 6.4 All 5 screens verified at 375px — no horizontal scroll on any
- [ ] 6.5 Visual consistency checklist passes: consistent buttons, tokens, page-content wrappers
- [ ] 6.6 App looks visually coherent across all screens
