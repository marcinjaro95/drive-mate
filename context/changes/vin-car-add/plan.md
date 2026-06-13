# VIN Car Add Implementation Plan

## Overview

Add VIN-based auto-fill to the vehicle add form. User enters an optional VIN and clicks "Decode" — the app calls AutoRef.eu (EU-native VIN API) via a Cloudflare Worker proxy, falls through silently to NHTSA vPIC if AutoRef misses, and pre-fills make/model/year/engine_capacity/fuel_type. All pre-filled fields remain editable. The manual path is fully preserved.

## Current State Analysis

The codebase is partially scaffolded:
- `vin text` column exists in the DB; RLS is in place — no migration needed
- `Vehicle` model has `vin: string | null` already
- `VehicleService.createVehicle()` already accepts `vin`
- `vehicle-add.ts` hardcodes `vin: null` — the only model-layer change needed
- `vehicle-add.html` has no VIN field yet
- `functions/worker.ts` has an `/api/ai` proxy using the Cloudflare Worker pattern to extend

## Desired End State

User opens "Add your car", optionally enters a 17-char VIN, clicks "Decode", and sees make/model/year/engine capacity/fuel type filled in within ~2 seconds. Fields remain editable so the user can correct partial or wrong data. If the VIN decode fails entirely, an inline error message appears and the user can fill everything manually. The form submits with the VIN stored on the vehicle record.

### Key Discoveries

- `src/app/vehicles/vehicle-add/vehicle-add.ts:52` — `vin: null` is the only model-layer change
- `functions/worker.ts:54-69` — the `fetch()` handler already routes on `url.pathname`; `/api/vin` is a new branch alongside `/api/ai`
- AutoRef.eu response shape: `VIN_INFO.BRAND`, `VIN_INFO.MODEL`, `VIN_INFO.FUEL`, `SPECS.DATE_REGISTRAR_START` (ISO date → extract year); displacement field not shown in public sample (truncated with `...`) — exact key confirmed at first live response
- NHTSA vPIC endpoint: `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/{vin}?format=json` — returns `Results` array of `{Variable, Value}` objects; key variables: "Make", "Model", "Model Year", "Displacement (L)", "Fuel Type - Primary"
- `wrangler.toml` currently has only `OPENROUTER_API_KEY` in the `Env` interface; `AUTOREF_API_KEY` follows the same secret pattern

## What We're NOT Doing

- No license-plate lookup (AutoRef also supports it; out of scope for this slice)
- No VIN format display/formatting in the UI (just validate 17 chars, A-H J-N P-R Z 0-9)
- No persistent VIN on the vehicle record update flow (FR-002/edit is a separate slice)
- No automated test mocking of the Worker endpoint (rate-limit awareness: 50 free req/month)
- No "partial result" banner when NHTSA fills in (silent fallback — decided during planning)
- No locking of auto-filled fields (all remain editable — decided during planning)

## Implementation Approach

Extend the existing Cloudflare Worker to handle `POST /api/vin`, keeping the AutoRef.eu key server-side. The Worker owns the two-layer fallback logic: AutoRef primary → NHTSA vPIC. Angular gets a single `VinDecoderService` that calls `/api/vin` and returns a typed result. The `VehicleAddComponent` gains a VIN section at the top of the form with a Decode button and patches form controls with the decoded values.

## Critical Implementation Details

**AutoRef.eu endpoint and engine capacity field**: The public documentation does not expose the exact request URL or the displacement field key (the sample response truncates with `...`). Confirm both from the AutoRef developer portal after obtaining a free-tier key. The displacement field is documented under "Engine Specs → displacement" — likely `VIN_INFO.DISPLACEMENT` (cm³) or `VIN_INFO.CUBIC_CAPACITY` (cm³). Convert cm³ to litres by dividing by 1000.

**AUTOREF_API_KEY secret**: In Cloudflare, secrets are stored via `wrangler secret put` (not in `wrangler.toml`). For local `wrangler dev`, create `.dev.vars` in the project root with `AUTOREF_API_KEY=<key>`. Ensure `.dev.vars` is in `.gitignore`.

---

## Phase 1: Cloudflare Worker — /api/vin proxy

### Overview

Extend `functions/worker.ts` with a `/api/vin` handler that calls AutoRef.eu, falls through to NHTSA vPIC on miss, and returns a canonical decoded result. The Worker owns both the API key and the normalization logic.

### Changes Required

#### 1. `functions/worker.ts` — Env interface + /api/vin handler

**File**: `functions/worker.ts`

**Intent**: Add `AUTOREF_API_KEY` to the `Env` interface, implement a `handleVin()` function, and route `POST /api/vin` to it in the main `fetch()` handler.

**Contract**:
- `Env` gains `AUTOREF_API_KEY: string`
- `handleVin()` accepts `{ vin: string }` body; validates it is 17 chars before calling upstream
- AutoRef.eu call: `GET` or `POST` to the confirmed endpoint with `Authorization: Bearer <AUTOREF_API_KEY>`; treat 404 or empty result as a miss
- NHTSA vPIC fallback: `GET https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/{vin}?format=json`; find result variables by the `Variable` key
- Canonical response shape returned on success (HTTP 200):
  ```
  { make?: string; model?: string; year?: number; engine_capacity?: number; fuel_type?: string }
  ```
  All fields are optional — undefined when not decoded by either provider
- Fuel normalization map (case-insensitive):
  `electric` → "electric", `diesel` → "diesel", `gasoline | petrol | essence | benzin` → "gasoline", `hybrid | hybride` → "hybrid", `lpg | gpl | liquefied petroleum gas` → "lpg"; unrecognized → field omitted
- When both providers miss: return `{ error: "not_found" }` with HTTP 200
- Missing key guard identical to the existing `OPENROUTER_API_KEY` pattern (return 500 + JSON error)
- CORS headers identical to existing handler

#### 2. `.dev.vars` (new file, project root)

**File**: `.dev.vars`

**Intent**: Provide `AUTOREF_API_KEY` locally so `wrangler dev` can call AutoRef.eu without a deployed secret.

**Contract**: Plain key=value format: `AUTOREF_API_KEY=<your_free_tier_key>`. Must be git-ignored. Check `.gitignore` for an existing entry; add `/.dev.vars` if absent.

### Success Criteria

#### Automated Verification

- Build compiles without TypeScript errors: `npm run build`
- Worker missing-key guard verified: `AUTOREF_API_KEY` returns 500 + JSON (same pattern as existing AI key guard)

#### Manual Verification

- Start local Worker: `npx wrangler dev`
- Known EU VIN (e.g. `WVWZZZ1JZXW123456`): `curl -X POST http://localhost:8787/api/vin -H "Content-Type: application/json" -d '{"vin":"WVWZZZ1JZXW123456"}'` returns all five fields
- US-only VIN: returns partial result (make/model/year from NHTSA; engine_capacity/fuel_type absent or partially filled)
- Completely unknown VIN (17 random valid-format chars): returns `{ error: "not_found" }`
- AutoRef.eu displacement field confirmed: verify the actual field key from a live response and update the mapping if it differs from the plan estimate

**Pause here for manual confirmation before proceeding to Phase 2.**

---

## Phase 2: Angular — VinDecoderService + form UI

### Overview

Add a `VinDecoderService` that calls `/api/vin`, then update `VehicleAddComponent` to include an optional VIN input with a Decode button at the top of the form. Successful decode patches the form; failed decode shows an inline error. The form remains fully submittable without decoding.

### Changes Required

#### 1. `src/app/core/vehicles/vin-decoder.service.ts` (new file)

**File**: `src/app/core/vehicles/vin-decoder.service.ts`

**Intent**: Injectable service that POSTs a VIN to `/api/vin` and returns the decoded fields. Throws on network/HTTP error (matching the project's error contract: services throw, components catch).

**Contract**:
- `@Injectable({ providedIn: 'root' })`
- Exports `VinDecodeResult` interface mirroring the Worker's canonical response: `{ make?: string; model?: string; year?: number; engine_capacity?: number; fuel_type?: string; error?: string }`
- Method: `decode(vin: string): Promise<VinDecodeResult>` — posts `{ vin }` to `/api/vin`, returns parsed JSON, throws `Error` on non-2xx
- Uses `fetch()` directly (no `HttpClient` import needed; keeps parity with the rest of the codebase which uses `fetch` in the Worker and no `HttpClient` in services)

#### 2. `src/app/vehicles/vehicle-add/vehicle-add.ts` — VIN control + decode logic

**File**: `src/app/vehicles/vehicle-add/vehicle-add.ts`

**Intent**: Add optional `vin` form control, decode loading/error signals, and a `decodeVin()` method. Update `onSubmit()` to pass the VIN value instead of `null`.

**Contract**:
- Import and inject `VinDecoderService`
- Form gains: `vin: [null as string | null, [Validators.pattern(/^[A-HJ-NPR-Z0-9]{17}$/i)]]` — optional (no `Validators.required`)
- New signals: `isDecoding = signal(false)`, `decodeError = signal<string | null>(null)`
- `decodeVin()`: sets `isDecoding(true)`, calls `vinDecoderService.decode(vin)`, on success calls `this.form.patchValue()` with non-undefined fields only (spread and omit undefined keys), clears `decodeError`, sets `isDecoding(false)` in finally; on error sets `decodeError` message
- `onSubmit()`: destructure `vin` from `getRawValue()` and pass `vin: vin ?? null` (replaces current `vin: null` at line 52)

#### 3. `src/app/vehicles/vehicle-add/vehicle-add.html` — VIN section

**File**: `src/app/vehicles/vehicle-add/vehicle-add.html`

**Intent**: Add a VIN input with a Decode button at the top of the form, before the Make field. Show loading state on the button; show an inline error below the field when decode fails.

**Contract**:
- VIN section inserted before the existing `<mat-form-field>` for Make
- `<mat-form-field>` wrapping a `matInput` with `formControlName="vin"`, `maxlength="17"`, labelled "VIN — optional (auto-fills fields below)"
- Pattern error message: "VIN must be 17 characters (letters A–H, J–N, P–R, Z and digits)"
- Decode button: `[disabled]="form.controls.vin.invalid || !form.controls.vin.value || isDecoding()"` — calls `(click)="decodeVin()"`, label switches to "Decoding…" when `isDecoding()` is true; use `mat-button` (not `mat-raised-button` — it's a secondary action)
- Decode error: `@if (decodeError()) { <p class="form-error">{{ decodeError() }}</p> }` — same pattern as existing `error()` display

### Success Criteria

#### Automated Verification

- `npm run build` compiles without TypeScript or template errors

#### Manual Verification

- Valid EU VIN → click Decode → make/model/year/engine_capacity fill in; fuel fills if recognized
- LPG car VIN → fuel_type dropdown stays blank; other fields fill normally
- Partial NHTSA-only decode → make/model/year fill; engine_capacity/fuel_type blank; no error shown; form submittable
- Both providers miss → inline error message "Could not decode this VIN. Please fill in manually." appears below VIN field; no other fields touched
- 16-char VIN → Decode button stays disabled
- Submit without decoding → form submits with `vin: null`; vehicle saved correctly
- Submit after decode → correct `vin` string saved alongside vehicle fields in Supabase
- No regressions: existing manual-add flow works unchanged

---

## Testing Strategy

### Unit Tests

- `VinDecoderService.decode()` — mock `fetch`, verify: (a) correct POST body, (b) `{ error: "not_found" }` does not throw, (c) network error does throw
- Worker fuel normalization — pure function extracted from `handleVin()`; test all enum mappings + unknown value → omitted

### Integration Tests

- Full VehicleAddComponent decode → submit → Supabase insert flow (manual, requires real AutoRef free-tier key)

### Manual Testing Steps

1. Run `npx wrangler dev` + `npm start` concurrently (or `wrangler pages dev dist/drive-mate/browser --proxy 4200`)
2. Navigate to `/dashboard/vehicles/new`
3. Enter a known Polish VIN (WMI `TMA`, `SUF`, or `VNK`); click Decode; verify all 5 fields filled
4. Enter a random US VIN; verify partial fill (make/model/year) without error banner
5. Enter `AAAAAAAAAAAAAAAAA`; verify "Could not decode" error
6. Submit after decode; open the vehicle detail page; verify VIN is stored and visible

## References

- Research: `context/changes/vin-car-add/research.md`
- AutoRef.eu API overview: `https://autoref.eu/en/api-overview`
- NHTSA vPIC: `https://vpic.nhtsa.dot.gov/api/`
- Existing Worker pattern: `functions/worker.ts:1-70`
- Vehicle model: `src/app/core/models/vehicle.model.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Cloudflare Worker — /api/vin proxy

#### Automated

- [x] 1.1 Build compiles without TypeScript errors: `npm run build` — 26d1d60
- [x] 1.2 Missing-key guard returns 500 + JSON (matches OPENROUTER_API_KEY pattern) — 26d1d60

#### Manual

- [x] 1.3 Known EU VIN returns all five fields via `wrangler dev` — 26d1d60
- [x] 1.4 US-only VIN returns partial result (NHTSA fallback) — 26d1d60
- [x] 1.5 Unknown VIN returns `{ error: "not_found" }` — 26d1d60
- [x] 1.6 AutoRef.eu displacement field key confirmed from live response; mapping correct — 26d1d60

### Phase 2: Angular — VinDecoderService + form UI

#### Automated

- [x] 2.1 `npm run build` compiles without TypeScript or template errors

#### Manual

- [ ] 2.2 Valid EU VIN → Decode fills make/model/year/engine_capacity/fuel_type
- [ ] 2.3 LPG VIN → fuel_type stays blank; other fields fill
- [ ] 2.4 NHTSA-only partial decode → no error shown; form submittable
- [ ] 2.5 Both providers miss → inline error message shown; fields untouched
- [ ] 2.6 16-char VIN → Decode button disabled
- [ ] 2.7 Submit without decoding → `vin: null` saved correctly
- [ ] 2.8 Submit after decode → VIN string saved alongside vehicle fields in Supabase
