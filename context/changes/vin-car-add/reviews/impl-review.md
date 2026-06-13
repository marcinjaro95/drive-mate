<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: VIN Car Add

- **Plan**: context/changes/vin-car-add/plan.md
- **Scope**: Phase 1 + Phase 2 (full plan)
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION → resolved via triage
- **Findings**: 0 critical | 5 warnings | 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Wildcard CORS on credentialed API surface

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: functions/worker.ts:2
- **Detail**: CORS_HEADERS had `'Access-Control-Allow-Origin': '*'`. Any origin could POST to /api/vin and /api/ai, burning AUTOREF_API_KEY quota. Plan specified "CORS identical to existing handler" so this was a MATCH, but the pre-existing pattern was a latent security issue.
- **Fix A ⭐**: Replaced with allowlist (`ALLOWED_ORIGINS` set) + `corsHeaders(request)` helper that echoes the request Origin only if it matches the allowlist, falling back to the production origin.
- **Decision**: FIXED via Fix A

### F2 — `not_found` returned as HTTP 200 creates fragile coupling

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: functions/worker.ts (not_found response) + vin-decoder.service.ts:20
- **Detail**: Plan explicitly specified HTTP 200 for not_found. Implementation matched. But VinDecoderService.decode() only throws on non-2xx, so `not_found` arrived as a resolved value — VehicleAddComponent had to special-case `result.error`. Future consumers following the throw-on-error contract would silently treat not_found as a populated decode result.
- **Fix A ⭐**: Worker now returns HTTP 404 for not_found. VinDecoderService catches 404 in catchError and returns `{ error: 'not_found' }` as a resolved value, so VehicleAddComponent's existing check still works.
- **Decision**: FIXED via Fix A

### F3 — Bare `fetch` in VinDecoderService breaks testability

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/core/vehicles/vin-decoder.service.ts:15
- **Detail**: Plan said "use fetch directly to keep parity with the Worker." But the Angular codebase's idiomatic HTTP layer is HttpClient, not native fetch. The test plan calls for a unit test of decode() that mocks fetch — native fetch requires patching globalThis.fetch, which is non-idiomatic in Angular. Also added provideHttpClient() to app.config.ts.
- **Fix**: Replaced with `inject(HttpClient)` + `firstValueFrom(this.http.post(...).pipe(catchError(...)))`.
- **Decision**: FIXED

### F4 — No in-flight guard allows concurrent decode calls

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/vehicles/vehicle-add/vehicle-add.ts:45
- **Detail**: The Decode button had `[disabled]="... || isDecoding()"` but signal updates are async — a rapid double-click before change detection runs could fire two concurrent fetches. Both would race to patch the form; the second response would win non-deterministically.
- **Fix**: Added `if (this.isDecoding()) return;` as the first line of `decodeVin()`.
- **Decision**: FIXED

### F5 — Year max hardcoded to 2030 will reject future vehicles

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/vehicles/vehicle-add/vehicle-add.ts:39
- **Detail**: `Validators.max(2030)` would reject model years above 2030. Error message in template also hard-coded "2030".
- **Fix**: Replaced with `Validators.max(new Date().getFullYear() + 1)`. Updated error message to "Year must be between 1900 and next year".
- **Decision**: FIXED

### F6 — `decodeError` cleared at call-start, not on-success

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/app/vehicles/vehicle-add/vehicle-add.ts:50
- **Detail**: Plan said "clears decodeError on success". Implementation cleared it unconditionally at top of every decodeVin() call. If a previous error existed and the new call also threw, the error would flash blank then re-appear.
- **Fix**: Moved `this.decodeError.set(null)` into the try block, after the result is confirmed non-error (after patchValue).
- **Decision**: FIXED

### F7 — AutoRef non-404 errors silently fall through to NHTSA with no log

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: functions/worker.ts:58
- **Detail**: A 500 or 429 (rate limit) from AutoRef caused silent fallthrough to NHTSA. Cloudflare logs showed no AutoRef degradation signal.
- **Fix**: Added `console.warn('AutoRef non-OK:', resp.status, vin)` for non-404, non-OK responses.
- **Decision**: FIXED
