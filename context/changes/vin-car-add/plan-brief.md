# VIN Car Add — Plan Brief

> Full plan: `context/changes/vin-car-add/plan.md`
> Research: `context/changes/vin-car-add/research.md`

## What & Why

Add an optional VIN field to the "Add your car" form. Entering a VIN and clicking "Decode" auto-fills make, model, year, engine capacity, and fuel type via AutoRef.eu (EU-native VIN API). This resolves PRD Open Question 1 and unblocks roadmap S-03, making FR-001/FR-004 (VIN lookup) shippable.

## Starting Point

The DB column, TypeScript model, and service payload already accept `vin` — the codebase is 80% scaffolded. The only missing pieces are the UI form field and the external API call. `vehicle-add.ts` hardcodes `vin: null` today; `functions/worker.ts` already has the Cloudflare Worker proxy pattern to extend.

## Desired End State

User opens "Add your car", types a VIN, clicks Decode, and sees five fields auto-filled within ~2 seconds. All fields remain editable. If the VIN isn't found, an inline error message appears and the user fills everything manually. The VIN is stored on the vehicle record on save.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| VIN API provider | AutoRef.eu (primary) + NHTSA vPIC (fallback) | EU-native DB with 50 free req/month for dev; NHTSA is free and covers the miss case | Research |
| Proxy placement | Extend `functions/worker.ts` | One Worker, one wrangler binding — matches the existing `/api/ai` pattern exactly | Plan |
| Decode trigger | Explicit "Decode" button | Prevents mid-typing API calls and conserves the 50 free req/month rate limit | Plan |
| Field lock after decode | Editable (pre-filled) | Covers partial decodes and EU data quality gaps; user stays in control | Plan |
| Unknown fuel type | Leave fuel_type blank | Simple and safe — no wrong pre-selection when AutoRef returns "CNG" or similar | Plan |
| Fallback UX | Silent (no banner) | Partial fill is expected and already covered by editable fields | Plan |

## Scope

**In scope:**
- `POST /api/vin` Worker handler (AutoRef.eu → NHTSA vPIC fallback, fuel normalization)
- `VinDecoderService` (new Angular service)
- VIN form field + Decode button + autofill logic in `VehicleAddComponent`
- `.dev.vars` local secrets setup

**Out of scope:**
- License-plate lookup
- VIN edit flow (separate slice)
- Automated tests mocking the Worker endpoint (rate-limit concern)

## Architecture / Approach

Angular calls `POST /api/vin { vin }` → Cloudflare Worker calls AutoRef.eu with `AUTOREF_API_KEY` → if not found, Worker falls through to NHTSA vPIC (no key needed) → Worker returns canonical `{ make?, model?, year?, engine_capacity?, fuel_type? }` → Angular patches form with non-undefined values.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Worker — /api/vin proxy | End-to-end decode via AutoRef + NHTSA, testable via curl | AutoRef.eu displacement field key is not shown in public docs; must be confirmed from first live response |
| 2. Angular — service + UI | VIN field, Decode button, autofill, error display | Template type errors from new form control and signal bindings |

**Prerequisites:** AutoRef.eu free-tier API key obtained before starting Phase 1 manual verification  
**Estimated effort:** ~2 focused sessions across 2 phases

## Open Risks & Assumptions

- AutoRef.eu displacement field exact key (`DISPLACEMENT`? `CUBIC_CAPACITY`?) is truncated in public docs — must be verified from first live API call; Worker mapping may need adjustment
- AutoRef.eu Polish VIN hit rate is unverified — the research recommends testing 3–5 real Polish WMI codes (`TMA`, `SUF`, `VNK`) on the free tier before committing to the paid plan
- AutoRef.eu exact request endpoint URL not confirmed from public docs — check developer portal on API key activation

## Success Criteria (Summary)

- EU VIN → Decode fills all 5 fields in the "Add your car" form
- Unknown VIN → inline error, form stays fully submittable manually
- VIN value saved correctly on the vehicle record in Supabase
