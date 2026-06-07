---
project: DriveMate
version: 1
status: draft
created: 2026-06-01
updated: 2026-06-07
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

| ID   | Change ID           | Outcome (user can …)                                             | Prerequisites           | PRD refs                       | Status   |
| ---- | ------------------- | ---------------------------------------------------------------- | ----------------------- | ------------------------------ | -------- |
| F-01 | auth-scaffold       | (foundation) Supabase auth wired; route guard active             | —                       | Access Control                 | ready    |
| F-02 | data-schema-rls     | (foundation) vehicles + service_records schema with RLS live     | —                       | FR-002, FR-003, FR-005, FR-006 | ready    |
| S-01 | car-add-ai-schedule | add a car manually and view an AI-generated maintenance schedule | F-01, F-02              | FR-002, FR-005, US-01          | proposed |
| S-02 | service-tracking    | mark a service item as done with date and mileage                | S-01                    | FR-006                         | proposed |
| S-03 | vin-car-add         | add a car via VIN with fields auto-populated                     | S-01, VIN API validated | FR-001, FR-004, US-01          | blocked  |
| S-04 | car-deletion        | delete a car and all its service records                         | S-01                    | FR-003                         | proposed |
| S-05 | ui-improvements     | use the app with a consistent, coherent visual design            | S-01                    | —                              | planned  |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                    | Chain                                   | Note                                                                       |
| ------ | ------------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| A      | Auth & schedule loop     | `F-01` → `S-01` → `S-02` → `S-03`      | Core speed path; S-03 is blocked pending OQ-1 (VIN API).                  |
| B      | Data enabler & lifecycle | `F-02` → `S-01` (joins A) / `S-04`     | F-02 runs parallel with F-01; S-04 runs parallel with S-02 after S-01.    |
| C      | UI polish                | `S-01` → `S-05`                        | Runs after the core loop is proven; can be parallelised with S-02/S-04.   |

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
- **Status:** ready

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
- **Status:** ready

## Slices

### S-01: Manual car add + AI schedule

- **Outcome:** user can fill in make, model, year, engine capacity, and fuel type and see an AI-generated maintenance schedule listing at least 5 upcoming service items, each citing its source (manufacturer schedule).
- **Change ID:** car-add-ai-schedule
- **PRD refs:** FR-002, FR-005, US-01
- **Prerequisites:** F-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Does the existing `POST /api/ai` Worker handle AI responses without hitting the Cloudflare 6 MB body limit for verbose maintenance schedules? — Owner: user. Block: no (testable during implementation; fallback: refactor proxy to streaming passthrough per `context/foundation/infrastructure.md` pre-mortem).
- **Risk:** The source-attribution guardrail must be enforced here — if the AI response does not include a traceable source for each maintenance item, that item must not be rendered; this is a hard product constraint from day one, not a polish item.
- **Status:** proposed

### S-02: Service tracking

- **Outcome:** user can mark a scheduled service item as done by recording the date and current mileage, and the schedule recalculates to reflect the completed service.
- **Change ID:** service-tracking
- **PRD refs:** FR-006
- **Prerequisites:** S-01
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Is mileage required or can it be optional when marking a service done? — Owner: user. Block: no (implementation detail; making it optional reduces friction but weakens recalculation accuracy per PRD OQ-3).
- **Risk:** Both date and mileage feed the schedule recalculation rule in PRD Business Logic; decide the optionality policy before implementing the form to avoid a retrofit.
- **Status:** proposed

### S-03: VIN car add

- **Outcome:** user can enter a VIN and have make, model, year, engine capacity, and fuel type auto-populated from a lookup, then confirm and receive a maintenance schedule.
- **Change ID:** vin-car-add
- **PRD refs:** FR-001, FR-004, US-01
- **Prerequisites:** S-01, VIN API for Polish/EU market validated
- **Parallel with:** S-02, S-04 (once unblocked)
- **Blockers:** —
- **Unknowns:**
  - Which VIN lookup API reliably covers Polish/EU market vehicles at acceptable cost and data completeness? — Owner: user. Block: yes (FR-001 and FR-004 cannot be implemented without a confirmed API provider; per PRD OQ-1).
- **Risk:** VIN lookup is positioned as a core differentiator in PRD Vision, but depends on an unvalidated external API; S-01 (manual path) provides a working fallback that unblocks the north star independently of this decision.
- **Status:** blocked

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
- **Status:** proposed

### S-05: UI improvements

- **Outcome:** user can navigate and use the app with a consistent visual design — shared colour palette, typography scale, spacing system, and component style applied uniformly across all screens.
- **Change ID:** ui-improvements
- **PRD refs:** —
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04 (once S-01 ships)
- **Blockers:** —
- **Unknowns:**
  - Which design system or component library (if any) to adopt — own primitives vs. an off-the-shelf library? — Owner: user. Block: no (work can start with a token/variable pass before a library decision is finalised).
- **Risk:** Broad scope; must be timeboxed to avoid infinite polish — scope to the screens delivered by S-01 through S-04 only.
- **Status:** planned

## Backlog Handoff

| Roadmap ID | Change ID           | Suggested issue title                                      | Ready for `/10x-plan` | Notes                                        |
| ---------- | ------------------- | ---------------------------------------------------------- | --------------------- | -------------------------------------------- |
| F-01       | auth-scaffold       | Auth scaffold: Supabase auth + Angular route guard         | yes                   | Run `/10x-plan auth-scaffold`                |
| F-02       | data-schema-rls     | Data schema: vehicles + service_records + RLS policies     | yes                   | Run `/10x-plan data-schema-rls`; parallel with F-01 |
| S-01       | car-add-ai-schedule | Manual car add + AI maintenance schedule                   | no                    | Requires F-01 and F-02 done first            |
| S-02       | service-tracking    | Service tracking: mark item done with date and mileage     | no                    | Requires S-01                                |
| S-03       | vin-car-add         | VIN car add with auto-populated fields                     | no                    | Blocked: resolve OQ-1 (VIN API) first        |
| S-04       | car-deletion        | Car deletion with confirmation and cascade                 | no                    | Requires S-01; parallel with S-02            |
| S-05       | ui-improvements     | UI improvements: consistent design across all screens      | no                    | Requires S-01; run after core loop ships     |

## Open Roadmap Questions

1. **Which VIN lookup API covers Polish-market (EU) vehicles reliably?** — Owner: user. Block: S-03.
2. **Soft-delete vs hard-delete for car deletion (FR-003)?** — Owner: user. Block: S-04 (implementation choice, not a planning gate).
3. **Is mileage optional when marking a service done (FR-006)?** — Owner: user. Block: S-02 (implementation choice, not a planning gate).

## Parked

- **FR-007: service history date-sorted list** — Why parked: nice-to-have per PRD; deferred for speed (must-have path ships first).
- **FR-008: edit service record** — Why parked: nice-to-have per PRD; deferred for speed (delete-and-re-add is the v1 workaround).
- **GitHub Actions CI/CD** — Why parked: deploy works manually via `wrangler deploy`; CI was attempted and reverted in git history; not blocking any user-visible slice; add after the must-have path is complete.
- **AI chat interface** — Why parked: PRD §Non-Goals — v2 feature; MVP proves the schedule + tracking core first.
- **Native mobile app** — Why parked: PRD §Non-Goals — responsive web app sufficient for MVP.
- **OBD integration** — Why parked: PRD §Non-Goals — all data entry is manual for v1.
- **Cost calculator / invoice OCR** — Why parked: PRD §Non-Goals — out of scope.
- **Multi-user sharing / fleet management** — Why parked: PRD §Non-Goals — single-user, flat model only.
- **Admin panel / multi-role accounts** — Why parked: PRD §Non-Goals — no back-office UI for v1.
- **Offline-first guarantee** — Why parked: PRD §Non-Goals — requires active internet connection.
- **Compliance certification beyond basic GDPR** — Why parked: PRD §Non-Goals — no SOC 2 / ISO 27001 / accessibility certification for v1.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.)
