# Car Add + AI Schedule — Plan Brief

> Full plan: `context/changes/car-add-ai-schedule/plan.md`

## What & Why

S-01 is the DriveMate north-star slice: user fills in car details and immediately receives an AI-generated maintenance schedule with source-attributed items. F-01 (auth) and F-02 (data schema + RLS) are both done, so every prerequisite is in place. This change proves the core product hypothesis — that an AI-translated, sourced schedule is more useful to a non-mechanic than a raw service table.

## Starting Point

The backend (VehicleService, ServiceRecordService, Supabase schema) and the Cloudflare Worker proxy (`POST /api/ai` → OpenRouter) are fully operational. The dashboard shows only a sign-out button; no vehicle UI, no AI schedule types, and no child routes exist.

## Desired End State

User navigates to `/dashboard` → sees a vehicle list with an "Add your first car" CTA on first visit → fills in 6 fields (5 required + optional mileage) → lands directly on the schedule view where skeleton cards animate while Gemini Flash 2.0 generates the schedule → items with source citations render; items without source are silently dropped → subsequent visits load the schedule instantly from the persisted JSONB column.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Route structure | Dashboard with child router-outlet (`/dashboard/vehicles/new`, `/dashboard/vehicles/:id`) | Keeps protected content under one parent while enabling bookmarkable deep links | Plan |
| Schedule persistence | JSONB column `ai_schedule` on `vehicles` table | Zero new migration complexity — existing RLS policy covers it, single SELECT fetches car + schedule | Plan |
| Mileage at add time | Optional field on the form | The `vehicles.current_mileage` nullable column already exists; improves AI accuracy without blocking the form | Plan |
| AI response format | JSON array with per-item `source` field | Makes source attribution machine-enforceable — items missing `source` are filtered at the type level before render | Plan |
| AI model | `google/gemini-2.0-flash-001` via OpenRouter | Fast, cheap, strong structured JSON output; fits the 10-second NFR comfortably | Plan |
| Loading UX | Inline skeleton cards (5 placeholders) | Significantly better perceived performance than a spinner; sets expectations about item count | Plan |
| AI errors | Error card with inline retry button | User is never stuck; retry overwrites any prior cached result on success | Plan |
| Source guardrail | Filter items missing `source`; warn if all filtered | Enforces the hard PRD guardrail at the service level (tested by spec), not in the template | Plan |
| Post-add navigation | Direct to schedule view (trigger AI immediately) | Minimum clicks to the value moment — the core US-01 scenario | Plan |
| Unit test scope | AiScheduleService only (parsing + filter logic) | Highest-risk code path; component behaviour covered by mandatory manual verification | Plan |

## Scope

**In scope:** DB migration, `ScheduleItem` model, `AiScheduleService` + specs, dashboard shell refactor + routing, `VehicleListComponent` (list + empty state), `VehicleAddComponent` (6-field form), `ScheduleViewComponent` (skeleton / items / error / retry)

**Out of scope:** VIN lookup (S-03), marking service done (S-02), car deletion (S-04), user-triggered schedule refresh when valid schedule exists, streaming AI responses, component-level Vitest specs, editing existing vehicles

## Architecture / Approach

The Angular SPA adds child routes under `/dashboard`. `VehicleAddComponent` calls `VehicleService.createVehicle()` then navigates to `ScheduleViewComponent`. The schedule view calls `AiScheduleService.generateAndSave()` if the vehicle's `ai_schedule` field is null. The service builds an OpenRouter-compatible request body, POSTs to the existing `/api/ai` Worker proxy, decodes the two-level response (outer HTTP JSON + inner `choices[0].message.content` string), filters items lacking a `source` field, and persists the result via `VehicleService.updateVehicle()`. No changes to `functions/worker.ts` are needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB migration + types | `ai_schedule` JSONB on `vehicles`; `ScheduleItem` model; `Vehicle` model update | Migration must not conflict with existing objects |
| 2. AiScheduleService | Prompt → `/api/ai` → parse → filter → persist; Vitest specs | Two-level parse (envelope + content string) is easy to get wrong |
| 3. Dashboard shell + routing + VehicleListComponent | Child route structure; empty-state vehicle list | Dashboard refactor must not break existing sign-out or authGuard |
| 4. VehicleAddComponent | 6-field reactive form → save → navigate to schedule | `createVehicle` type must exclude `ai_schedule` to avoid TS error |
| 5. ScheduleViewComponent | Skeleton → items with source badges → error + retry | Guardrail filter must run before render; cached-load branch must not re-call AI |

**Prerequisites:** F-01 (auth) and F-02 (data schema + RLS) — both `ready` in the roadmap  
**Estimated effort:** ~3–4 sessions across 5 phases

## Open Risks & Assumptions

- `OPENROUTER_API_KEY` must be set as a Cloudflare Worker secret (`wrangler secret put OPENROUTER_API_KEY`) before Phase 5 manual testing — not coded but required at runtime
- Gemini Flash 2.0 occasionally drifts from the requested JSON schema; the source-attribution filter is the safety net, but a particularly bad response could return 0 valid items (covered by the "all filtered" warning + retry UX)
- The Cloudflare 6 MB body limit is not expected to be an issue for a 10–15 item schedule (~4 KB), but should be confirmed during Phase 5 manual testing

## Success Criteria (Summary)

- User can add a car manually and see an AI-generated maintenance schedule within 10 seconds (PRD US-01, FR-002, FR-005)
- Every rendered maintenance item cites a source — no unsourced items reach the UI (PRD Guardrail)
- Subsequent visits load the schedule instantly from the database — no repeat AI calls
