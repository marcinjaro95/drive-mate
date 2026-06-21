---
project: DriveMate
version: 1
status: draft
created: 2026-06-01
updated: 2026-06-14
prd_version: 1
main_goal: speed
top_blocker: external
---

# Roadmap: DriveMate

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

A private car owner knows their car needs servicing but doesn't know what, when, or why — the answer is buried in PDF manuals or locked in a mechanic's head. DriveMate's differentiator — the one capability that, if removed, makes it indistinguishable from a generic reminder app — is that its AI layer translates the manufacturer schedule and the car's service history into a clear, actionable, plain-language answer. The MVP proves this core loop: add a car, receive a sourced schedule, record what's been done.

## North star

**S-01: user can add a car manually and view an AI-generated maintenance schedule** — proves the core product hypothesis (the claim that AI-generated, source-attributed schedules are more useful to a non-mechanic owner than a raw service table), and must land as early as Prerequisites allow because everything else only matters if this works.

> "North star" here means: the smallest end-to-end flow whose successful delivery confirms the product's central value proposition. S-02 (mark service done) immediately follows and completes the full validation cycle the user identified as proof of DriveMate's value.

## At a glance

| ID    | Change ID                          | Outcome (user can …)                                                                | Prerequisites | PRD refs                       | Status |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------- | ------------- | ------------------------------ | ------ |
| F-01  | auth-scaffold                      | (foundation) Supabase auth wired; route guard active                                | —             | Access Control                 | done   |
| F-02  | data-schema-rls                    | (foundation) vehicles + service_records schema with RLS live                        | —             | FR-002, FR-003, FR-005, FR-006 | done   |
| S-01  | car-add-ai-schedule                | add a car manually and view an AI-generated maintenance schedule                    | F-01, F-02    | FR-002, FR-005, US-01          | done   |
| S-01a | schedule-item-identity             | (enhancement) schedule items have stable UUIDs; done state persists across sessions | S-01          | —                              | done   |
| S-02  | service-tracking                   | mark a service item as done with date and mileage                                   | S-01          | FR-006                         | done   |
| S-03  | vin-car-add                        | add a car via VIN with fields auto-populated                                        | S-01          | FR-001, FR-004, US-01          | done   |
| S-04  | car-deletion                       | delete a car and all its service records                                            | S-01          | FR-003                         | done   |
| S-05  | ui-improvements                    | use the app with a consistent, coherent visual design                               | S-01          | —                              | done   |
| T-01  | testing-ai-schedule-hardening      | (quality) AI schedule service unit tests + component flow tests                     | S-01          | —                              | done   |
| T-02  | testing-auth-ownership-enforcement | (quality) auth guard, RLS, and app-layer ownership tests                            | F-01, F-02    | —                              | done   |
| T-03  | testing-ci-test-gate               | (quality) GitHub Actions CI gate runs all tests on every push                       | T-01, T-02    | —                              | done   |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                    | Chain                                       | Note                                                                       |
| ------ | ------------------------ | ------------------------------------------- | -------------------------------------------------------------------------- |
| A      | Auth & schedule loop     | `F-01` → `S-01` → `S-01a` → `S-02` → `S-03` | Core speed path; all done.                                                 |
| B      | Data enabler & lifecycle | `F-02` → `S-01` (joins A) / `S-04`          | All done.                                                                  |
| C      | UI polish                | `S-01` → `S-05`                             | Done.                                                                      |
| T      | Testing                  | `T-01` → `T-02` → `T-03`                    | All three phases done; CI gate active. New features extend the test suite. |

## Baseline

What's already in place in the codebase as of 2026-06-01 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Angular 21 + routing scaffold present (`src/app/app.routes.ts`), routes array empty, only app shell component (`src/app/app.ts`)
- **Backend / API:** present — Cloudflare Worker with `POST /api/ai` proxy to OpenRouter (`functions/worker.ts`)
- **Data:** partial — `supabase/config.toml` exists (project_id="drive-mate"); no `@supabase/supabase-js` in `package.json`; no schema or migration files
- **Auth:** absent — no auth provider integration, no route guards, no login/signup components
- **Deploy / infra:** partial — `wrangler.toml` with Workers + static assets + Smart Placement; no GitHub Actions CI/CD
- **Observability:** absent — only `console.error()` in `main.ts`; no production monitoring

## Foundations

### F-01: Auth scaffold

- **Outcome:** (foundation) Supabase auth wired to the Angular app; login and sign-up screens present; Angular route guard redirects unauthenticated visitors to sign-in; authenticated session token available to all downstream components.
- **Change ID:** auth-scaffold
- **PRD refs:** Access Control
- **Unlocks:** S-01, S-02, S-03, S-04 — every user-visible slice requires an authenticated session
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Auth is the root gate for every user-visible slice; sequenced parallel with F-02 to minimise total time to S-01; if incomplete, no slice can be verified end-to-end.
- **Status:** done

### F-02: Data schema + RLS

- **Outcome:** (foundation) `@supabase/supabase-js` installed; `vehicles` and `service_records` tables defined; Row Level Security policies scoped to `auth.uid()` applied; migrations applied to the local Supabase instance.
- **Change ID:** data-schema-rls
- **PRD refs:** FR-002, FR-003, FR-005, FR-006
- **Unlocks:** S-01, S-02, S-03, S-04 — all slices that persist car or service data
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** RLS policies are the sole enforcement layer for the data-isolation guardrail ("a single data-isolation bug kills trust permanently" per PRD Guardrails); schema design can proceed in parallel with auth scaffold, but both must be complete before S-01 can be verified end-to-end.
- **Status:** done

## Slices

### S-01: Manual car add + AI schedule

- **Outcome:** user can fill in make, model, year, engine capacity, and fuel type and see an AI-generated maintenance schedule listing at least 5 upcoming service items, each citing its source (manufacturer schedule).
- **Change ID:** car-add-ai-schedule
- **PRD refs:** FR-002, FR-005, US-01
- **Prerequisites:** F-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** ~~Does the existing `POST /api/ai` Worker handle AI responses without hitting the Cloudflare 6 MB body limit?~~ — resolved during implementation; no limit issue encountered.
- **Risk:** The source-attribution guardrail must be enforced here — if the AI response does not include a traceable source for each maintenance item, that item must not be rendered; this is a hard product constraint from day one, not a polish item.
- **Status:** done

### S-01a: Schedule item identity + traceability

- **Outcome:** each ScheduleItem in `ai_schedule` JSONB carries a stable UUID; `service_records.schedule_item_id` references that UUID so the done state is durable; `savedItems` signal is seeded from the DB on load, preserving done state across sessions.
- **Change ID:** schedule-item-identity
- **PRD refs:** FR-005, FR-006
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** UUID generation must happen at schedule-generation time (server side or deterministically in the proxy), not at save time, to prevent key churn across regenerations.
- **Status:** done

### S-02: Service tracking

- **Outcome:** user can mark a scheduled service item as done by recording the date and current mileage, and the schedule recalculates to reflect the completed service.
- **Change ID:** service-tracking
- **PRD refs:** FR-006
- **Prerequisites:** S-01, S-01a
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** ~~Is mileage required or can it be optional when marking a service done?~~ — resolved during implementation.
- **Risk:** Both date and mileage feed the schedule recalculation rule in PRD Business Logic; decide the optionality policy before implementing the form to avoid a retrofit.
- **Status:** done

### S-03: VIN car add

- **Outcome:** user can enter a VIN and have make, model, year, engine capacity, and fuel type auto-populated from a lookup, then confirm and receive a maintenance schedule.
- **Change ID:** vin-car-add
- **PRD refs:** FR-001, FR-004, US-01
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** ~~Which VIN lookup API reliably covers Polish/EU market vehicles?~~ — resolved 2026-06-13: **AutoRef.eu** selected (€19.99/month, 5 000 req, EU-native, covers all five required fields). Vincario/vindecoder.eu is the documented fallback for insufficient Polish VIN hit rate. See `context/changes/vin-car-add/research.md`.
- **Risk:** Free-tier validation (50 req/month on AutoRef) should be run against a real Polish VIN sample before committing to the paid plan.
- **Status:** done

### S-04: Car deletion

- **Outcome:** user can delete a car and all its associated service records with a mandatory confirmation step, and the deleted car no longer appears in their list.
- **Change ID:** car-deletion
- **PRD refs:** FR-003
- **Prerequisites:** S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Soft-delete or hard-delete? — Owner: user. Block: no (a confirmation dialog is non-negotiable for v1; data-retention strategy can be decided at implementation time per PRD OQ-2).
- **Risk:** Delete must cascade to `service_records` — confirm cascade behaviour against the F-02 schema before implementing; hard-delete without cascade leaves orphaned records.
- **Status:** done

### S-05: UI improvements

- **Outcome:** user can navigate and use the app with a consistent visual design — shared colour palette, typography scale, spacing system, and component style applied uniformly across all screens.
- **Change ID:** ui-improvements
- **PRD refs:** —
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04 (once S-01 ships)
- **Blockers:** —
- **Unknowns:** ~~Which design system or component library (if any) to adopt?~~ — resolved during implementation.
- **Risk:** Broad scope; must be timeboxed to avoid infinite polish — scope to the screens delivered by S-01 through S-04 only.
- **Status:** done

## Testing

### T-01: AI schedule hardening

- **Outcome:** (quality) AI schedule service has unit tests covering response parsing, source-attribution enforcement, and error paths; schedule-view component has generation-flow integration tests.
- **Change ID:** testing-ai-schedule-hardening
- **Prerequisites:** S-01
- **Status:** done

### T-02: Auth + ownership enforcement

- **Outcome:** (quality) Angular router guard integration tests prove unauthenticated visitors are redirected from every protected route; Supabase integration tests prove RLS blocks cross-user SELECT/INSERT/UPDATE/DELETE for vehicles and service_records; app-layer ownership check is tested to prevent unnecessary AI proxy calls for unowned vehicles.
- **Change ID:** testing-auth-ownership-enforcement
- **Prerequisites:** F-01, F-02
- **Status:** done

### T-03: CI test gate

- **Outcome:** (quality) GitHub Actions workflow runs the full Vitest suite on every push and pull request; Node version is locked to match local development; no merge is possible if tests are red.
- **Change ID:** testing-ci-test-gate
- **Prerequisites:** T-01, T-02
- **Status:** done

## Open Roadmap Questions

1. ~~**Which VIN lookup API covers Polish-market (EU) vehicles reliably?**~~ — Resolved 2026-06-13: AutoRef.eu selected. See `context/changes/vin-car-add/research.md`.
2. ~~**Soft-delete vs hard-delete for car deletion (FR-003)?**~~ — Resolved during S-04 implementation.
3. ~~**Is mileage optional when marking a service done (FR-006)?**~~ — Resolved during S-02 implementation.

## Parked

- **FR-007: service history date-sorted list** — Why parked: nice-to-have per PRD; deferred for speed (must-have path ships first).
- **FR-008: edit service record** — Why parked: nice-to-have per PRD; deferred for speed (delete-and-re-add is the v1 workaround).
- **AI chat interface** — Why parked: PRD §Non-Goals — v2 feature; MVP proves the schedule + tracking core first.
- **Native mobile app** — Why parked: PRD §Non-Goals — responsive web app sufficient for MVP.
- **OBD integration** — Why parked: PRD §Non-Goals — all data entry is manual for v1.
- **Cost calculator / invoice OCR** — Why parked: PRD §Non-Goals — out of scope.
- **Multi-user sharing / fleet management** — Why parked: PRD §Non-Goals — single-user, flat model only.
- **Admin panel / multi-role accounts** — Why parked: PRD §Non-Goals — no back-office UI for v1.
- **Offline-first guarantee** — Why parked: PRD §Non-Goals — requires active internet connection.
- **Compliance certification beyond basic GDPR** — Why parked: PRD §Non-Goals — no SOC 2 / ISO 27001 / accessibility certification for v1.

## Done

| Date       | Change ID                          | Roadmap ID | Summary                                                                  |
| ---------- | ---------------------------------- | ---------- | ------------------------------------------------------------------------ |
| 2026-06-04 | auth-scaffold                      | F-01       | Supabase auth + Angular route guard implemented and reviewed             |
| 2026-06-04 | data-schema-rls                    | F-02       | vehicles + service_records schema with RLS applied; migrations done      |
| 2026-06-07 | car-add-ai-schedule                | S-01       | Manual car add + AI maintenance schedule — north star slice shipped      |
| 2026-06-07 | service-tracking                   | S-02       | Mark service item as done with date and mileage; schedule recalculates   |
| 2026-06-07 | ui-improvements                    | S-05       | Consistent design across all core screens                                |
| 2026-06-11 | schedule-item-identity             | S-01a      | Stable UUID per ScheduleItem; done state persists across sessions via DB |
| 2026-06-13 | vin-car-add                        | S-03       | VIN lookup via AutoRef.eu; Cloudflare Worker proxy + Angular form UI     |
| 2026-06-14 | car-deletion                       | S-04       | Car deletion with confirmation dialog; cascades to service_records       |
| 2026-06-13 | testing-ai-schedule-hardening      | T-01       | AI schedule service + component generation-flow test suite               |
| 2026-06-13 | testing-auth-ownership-enforcement | T-02       | Auth guard, RLS, and app-layer ownership enforcement tests               |
| 2026-06-14 | testing-ci-test-gate               | T-03       | GitHub Actions CI gate; Node version locked                              |
