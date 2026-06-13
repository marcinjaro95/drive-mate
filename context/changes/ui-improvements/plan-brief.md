# UI Improvements — Plan Brief

> Full plan: `context/changes/ui-improvements/plan.md`

## What & Why

DriveMate's screens were built feature-by-feature with no shared design system: colors are hardcoded in component SCSS files, three components have no SCSS at all, and the prebuilt indigo-pink Material theme gives no brand identity. S-05 addresses this by establishing a token layer and custom M3 theme, then applying them across all five user-facing screens.

## Starting Point

Angular Material 21 with the prebuilt `indigo-pink.css` theme. `styles.scss` is empty. Urgency chip colors and banner backgrounds are hardcoded hex values in `schedule-view.scss`. The vehicle-list, vehicle-add, and dashboard components have no SCSS files. The "← My cars" back-link appears at the bottom of the schedule view, below all schedule cards.

## Desired End State

Every screen shares a unified visual language: deep-blue primary color (`#1565C0`-family M3 palette), CSS custom property tokens for all colors/spacing/typography, consistent card padding and button hierarchy, and a DriveMate wordmark on auth pages. The schedule view's back-link is at the top. All screens pass a visual-consistency checklist at both desktop and 375px mobile.

## Key Decisions Made

| Decision                | Choice                                            | Why (1 sentence)                                                                                            | Source |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| Material theme approach | Custom M3 palette via `@angular/material`         | Full brand ownership with consistent token propagation across all Material components                       | Plan   |
| Primary brand color     | Deep blue `#1565C0` / `mat.$blue-palette`         | Trustworthy automotive feel with high contrast on white                                                     | Plan   |
| Token system            | CSS custom properties in `styles.scss`            | Native CSS, DevTools-inspectable, works with Angular Material M3 tokens at runtime                          | Plan   |
| Navigation fix          | In-page breadcrumb at top of each child component | Avoids parent-child signal complexity; fixes the most visible UX bug (back-link at bottom of schedule view) | Plan   |
| Auth branding           | Text wordmark above form card                     | High visual impact on first-touch screen with zero asset complexity                                         | Plan   |
| Mobile strategy         | Verify all screens at 375px + fix any overflow    | PRD NFR requires 375px — skipping would be a guardrail violation                                            | Plan   |
| Done criteria           | Visual consistency checklist + 375px pass         | Clear, testable exit gate that prevents infinite polish                                                     | Plan   |

## Scope

**In scope:** All five user-facing screens (login, signup, vehicle list, add car, schedule view) — SCSS, HTML structure, Material theme, global tokens, mobile verification.

**Out of scope:** Dark mode, SVG logo, animation overhaul, routing changes, data services, sidenav, FR-007/FR-008 (parked features).

## Architecture / Approach

`styles.scss` becomes the design system root: it defines the M3 theme and all CSS custom properties. Child components reference these tokens in their SCSS rather than hardcoding values. `angular.json` drops the prebuilt theme. Three new SCSS files are created and wired into their `@Component` decorators. HTML templates gain `.page-content` wrappers for max-width containment.

## Phases at a Glance

| Phase                       | What it delivers                                           | Key risk                                                                                  |
| --------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1. Design System Foundation | Custom M3 theme + CSS token vocabulary in `styles.scss`    | M3 theming API in Angular Material 21 requires verification against actual module exports |
| 2. Navigation Shell         | Branded dashboard header + back-links at top of deep pages | `dashboard.scss` must use correct M3 surface token for header color                       |
| 3. Auth Pages               | DriveMate wordmark on login + signup                       | None — purely additive HTML/SCSS                                                          |
| 4. Vehicle Pages            | SCSS for vehicle-list + vehicle-add with layout tokens     | Missing `styleUrl` in two `@Component` decorators is easy to forget                       |
| 5. Schedule View Polish     | All hardcoded hex values migrated to tokens                | `!important` on chip colors must be preserved in token form                               |
| 6. Mobile + Consistency     | 375px verification + visual checklist sign-off             | May discover minor layout issues requiring small SCSS tweaks                              |

**Prerequisites:** All of S-01 through S-04 must be implemented (all are done per roadmap).
**Estimated effort:** ~2-3 focused sessions across 6 phases.

## Open Risks & Assumptions

- Angular Material 21 M3 theming API (`mat.define-theme`, `mat.theme()` mixin) must be verified against `node_modules/@angular/material/_index.scss` — the exact signatures may differ from older documentation.
- `var(--mat-sys-primary)` is the expected M3 token name for the primary color in component SCSS — if the token name differs in Angular Material 21, replace it with the correct M3 system token.

## Success Criteria (Summary)

- `npm run build` succeeds with zero errors after each phase
- `grep -rn '#[0-9a-fA-F]{3,6}' src/app/**/*.scss` returns empty after Phase 6 (no hardcoded colors in component SCSS)
- All five screens pass visual-consistency checklist + 375px mobile verification
