---
date: 2026-06-13T00:00:00+02:00
researcher: Marcin Jarosz
git_commit: 9ca2c2e7dda09f0181e9bd96f2e9420090e93e51
branch: master
repository: drive-mate
topic: 'VIN decoder API selection for EU/Polish-market vehicles'
tags: [research, vin, external-api, eu-market, fr-001, fr-004, s03]
status: complete
last_updated: 2026-06-13
last_updated_by: Marcin Jarosz
---

# Research: VIN decoder API selection for EU/Polish-market vehicles

**Date**: 2026-06-13T00:00:00+02:00
**Researcher**: Marcin Jarosz
**Git Commit**: [9ca2c2e](https://github.com/marcinjaro95/drive-mate/blob/9ca2c2e7dda09f0181e9bd96f2e9420090e93e51)
**Branch**: master
**Repository**: drive-mate

## Research Question

Which VIN lookup API covers Polish-market (EU) vehicles reliably at the lowest cost for a solo-dev, low-traffic SPA? Resolves PRD Open Question 1 and unblocks roadmap S-03 (`vin-car-add`).

## Summary

The codebase is **further along than the blocked status implies** — the `vin` column, TypeScript model, and service payload are all in place. The only missing pieces are the UI form field and the API call. All paid VIN decoder APIs require a server-side proxy (no CORS-safe free-tier that covers EU VINs reliably), which aligns with the existing Cloudflare Worker architecture.

**Recommended provider: AutoRef.eu** — €19.99/month (5,000 req), genuine 50-req/month free tier for pre-commit validation, EU-native, returns all five required fields (make, model, year, engine capacity, fuel type). If Polish VIN hit rate on AutoRef proves insufficient during free-tier testing, **Vincario (vindecoder.eu)** is the fallback — higher cost (€49/month for 100 req) but ML-trained on Eastern European national vehicle databases. NHTSA vPIC is kept as a free, proxy-free fallback layer for VINs the paid provider misses.

## Detailed Findings

### 1. Codebase readiness for VIN integration

The `vin-car-add` slice is partially scaffolded already:

- `src/app/core/models/vehicle.model.ts:10` — `vin: string | null` field already on the `Vehicle` interface; `NewVehicle` inherits it
- `supabase/migrations/20260604000000_init_schema.sql:30` — `vin text` nullable column exists in the `vehicles` table; RLS policies are already in place
- `src/app/core/vehicles/vehicle.service.ts` — `createVehicle()` accepts `vin: string | null` in its payload; no changes needed
- `src/app/vehicles/vehicle-add/vehicle-add.ts:52` — VIN is **hardcoded as `null`** today; this is the only model-layer change needed (read the field value from the form instead)
- `src/app/vehicles/vehicle-add/vehicle-add.html` — no VIN input field yet; must be added
- `src/app/app.routes.ts:27-28` — route `/dashboard/vehicles/new` → `VehicleAddComponent` exists; no routing changes needed

**No database migration required.** Integration surface is: add a form field, wire the value through to the existing service call, and add a new VIN-decoder service that calls the external API via the Cloudflare Worker proxy.

### 2. VIN API provider comparison

| Provider                     | EU/PL coverage                        | Returns all 5 fields?                              | Free tier            | Cheapest paid                   | Proxy required | Notes                                                                                                                    |
| ---------------------------- | ------------------------------------- | -------------------------------------------------- | -------------------- | ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **AutoRef.eu**               | Yes — EU-native, 1,400+ manufacturers | Yes                                                | 50 req/month         | €19.99/month (5,000 req)        | Yes            | Best balance for solo dev; EU-native database; REST JSON                                                                 |
| **vindecodervehicle.com**    | Yes — EU/global                       | Yes                                                | None                 | €8.95/month (1,000 req)         | Yes            | Cheapest paid option; smaller/less-known; data quality unverified on PL VINs                                             |
| **Vincario (vindecoder.eu)** | Yes — strong EU+PL, Eastern Europe    | Yes                                                | 3 req/month          | €49/month (100 req, €0.49/req)  | Yes            | ML-trained on national databases incl. Eastern Europe; GDPR-compliant; 3 free lookups allow ongoing spot checks          |
| **Auto.dev**                 | Partial — global, US-primary          | Yes (fields exist, depth uncertain for EU)         | 1,000 req/month      | $0.004/req after free tier      | Yes            | Best free tier volume; EU/PL field depth unverified — test against Polish VINs before relying on it                      |
| **NHTSA vPIC**               | Partial — US primary                  | Make, model, year only (engine/fuel sparse for EU) | Unlimited free       | Free                            | No (open CORS) | ~40–60% hit rate on Polish VINs; usable as a fallback layer; only provider safe to call from the browser client directly |
| **VehicleDatabases**         | Yes — EU from 1981                    | Yes                                                | 15 credits on signup | Contact for pricing             | Yes            | Pricing not public; no ongoing free tier                                                                                 |
| **vindecoder.pl**            | Yes — Polish-native                   | Yes                                                | None                 | €50/month minimum invoice       | Yes            | Polish-native data quality; minimum €50/mo disqualifying for low traffic                                                 |
| **Auto.dev**                 | Partial                               | Yes                                                | 1,000 req/month      | $0.004/req                      | Yes            |                                                                                                                          |
| **AutomotivAPI**             | Yes — EU                              | Yes                                                | None                 | €3.00/call + €590 one-off setup | Yes            | €590 setup fee disqualifies for MVP                                                                                      |
| **JATO VINView Pro**         | Partial EU (no PL confirmed)          | Yes                                                | None                 | Enterprise                      | Yes            | Enterprise contract; overkill                                                                                            |

### 3. Architecture implications

All paid providers expose a REST JSON API secured by an API key in a header. The key **must not be embedded in the Angular SPA** — this matches the existing pattern in `functions/worker.ts` where the AI proxy routes through a Cloudflare Worker. VIN decoding will follow the same pattern: Angular calls `POST /api/vin` on the Worker, Worker calls the external VIN API, returns decoded fields to the SPA.

NHTSA vPIC is the only provider with open CORS that can be called directly from the browser, making it viable as a client-side fallback for VINs the paid provider cannot decode (rather than a round-trip through the Worker).

### 4. Proxy endpoint design sketch

```
Angular VehicleAddComponent
  → POST /api/vin { vin: "WVWZZZ1JZXW123456" }
    → Cloudflare Worker (functions/worker.ts or new functions/vin.ts)
      → AutoRef.eu REST API (Authorization: Bearer <key>)
      ← { make, model, year, engine_capacity, fuel_type }
  ← decoded fields or { error: "not_found" }
  → if error: fall through to NHTSA vPIC (client-side, no key needed)
```

## Code References

- `src/app/vehicles/vehicle-add/vehicle-add.ts:52` — `vin: null` hardcoded; replace with form field value
- `src/app/vehicles/vehicle-add/vehicle-add.html:1-77` — add optional VIN input + "Decode" trigger button
- `src/app/core/vehicles/vehicle.service.ts` — already accepts `vin`; no changes
- `src/app/core/models/vehicle.model.ts:10` — `vin: string | null` already defined
- `supabase/migrations/20260604000000_init_schema.sql:30` — `vin text` column exists; no new migration
- `functions/worker.ts` — existing AI proxy; add a `/api/vin` branch here or in a new `functions/vin.ts`

## Architecture Insights

1. **Two-layer fallback:** Paid EU provider (AutoRef) → NHTSA vPIC (free, client-safe). This keeps the fallback cost-free and avoids a hard failure when VIN is not found in the paid database.
2. **VIN field is optional in the existing form model.** The manual-add path (S-01) already works. VIN pre-fill is additive — the form must remain fully submittable without a VIN decode.
3. **Proxy placement:** The existing `functions/worker.ts` Worker is the natural home. Route on request path (`/api/ai` vs `/api/vin`). Alternatively, a dedicated `functions/vin.ts` Worker keeps concerns separated.
4. **Rate-limit awareness:** AutoRef.eu free tier is 50 req/month — enough for development and manual QA, not for automated test runs. Tests that exercise the decode path should mock the Worker endpoint.

## Historical Context

- `context/foundation/prd.md` §Open Questions Q1 — OQ-1 names this as a yes-block for FR-001 and FR-004
- `context/foundation/roadmap.md` §S-03 — `vin-car-add` listed as `blocked`; prerequisite is "VIN API for Polish/EU market validated"
- The infrastructure.md pre-mortem (Cloudflare Worker AI proxy) establishes the pattern that VIN decoding should follow

## Open Questions

1. **AutoRef.eu Polish VIN hit rate** — Must be validated manually against 3–5 real Polish VINs (WMI codes: `SUF`, `TMA`, `VF3` from Fiat/Citroën Polish plants; `JMB` Mitsubishi; `VNK` Toyota Poland) before committing to the paid plan. Use the 50-req/month free tier.
2. **Single Worker vs dedicated Worker for VIN proxy** — Extending `functions/worker.ts` (route on path) is simpler; `functions/vin.ts` is cleaner but adds a second Worker binding in `wrangler.toml`. Decide at plan time.
3. **UX for partial decode** — If AutoRef returns make/model/year but not engine_capacity or fuel_type, should the form auto-fill what it has and leave the missing fields editable? The PRD requires all 5 fields before proceeding (`manual path requires all 5 fields before proceeding` — US-01 AC). The answer is yes: pre-fill what's available, user completes the rest.
