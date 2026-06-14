<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: E2E Critical User Journey

- **Plan**: context/changes/testing-e2e-critical-journey/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-06-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Production URL as default baseURL fallback

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: playwright.config.ts:9
- **Detail**: The fallback `?? 'https://drive-mate.marcinjaro95.workers.dev'` means a local run with credentials set but PLAYWRIGHT_BASE_URL unset will hit production. If the test fails mid-run, an orphan vehicle remains in production until the next run's afterEach cleans it.
- **Fix A ⭐ Recommended**: Throw at startup when PLAYWRIGHT_BASE_URL is absent
  - Strength: Fails fast before any browser action; eliminates the class of bug.
  - Tradeoff: Breaks `playwright test --list` in envs without secrets configured.
  - Confidence: MEDIUM
  - Blind spot: Haven't checked if any CI step calls playwright without the env var.
- **Fix B**: Change fallback to localhost:4200
  - Strength: Non-breaking; local dev server fails fast (connection refused) rather than reaching production.
  - Tradeoff: Error messages less clear than an explicit throw.
  - Confidence: HIGH
- **Decision**: FIXED (Fix A) — throws when PLAYWRIGHT_BASE_URL unset

### F2 — afterEach cleanup has reliability gaps

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / Pattern Consistency
- **Location**: e2e/critical-journey.spec.ts:12–19
- **Detail**: Three gaps: (1) no early return when env vars unset; (2) Supabase errors swallowed silently; (3) listUsers() defaults to 50 results — TEST_EMAIL missed if test project accumulates >50 users.
- **Fix A ⭐ Recommended**: Add env guard, error logging, and `perPage: 1000`
  - Strength: Intentionally safe, visible failures, pagination-safe. ~5 extra lines.
  - Tradeoff: None significant.
  - Confidence: HIGH
  - Blind spot: Whether service_records should also be deleted (not needed for current test scope).
- **Decision**: FIXED (Fix A) — added guard, console.warn on error, perPage:1000

### F3 — Plan's "Critical Implementation Details" section is now stale

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-e2e-critical-journey/plan.md (Critical Implementation Details section)
- **Detail**: The plan documents waitForResponse as required; fd1ba64 intentionally replaced it with toBeVisible({timeout:90_000}) because preflight/redirects resolved the promise early. Plan docs now stale.
- **Fix**: Update the Critical Implementation Details block in plan.md.
- **Decision**: SKIPPED — plan is already closed out

### F4 — testIgnore: ['**/seed.spec.ts'] not in plan

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: playwright.config.ts:5
- **Detail**: Unplanned addition that correctly prevents seed.spec.ts from being picked up by `npm run test:e2e`. Aligned with the "not touching seed.spec.ts" constraint.
- **Fix**: No code change needed.
- **Decision**: SKIPPED — accepted as beneficial unplanned addition

### F5 — SUPABASE_ANON_KEY in CI env block but unused by spec

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .github/workflows/ci.yml:52
- **Detail**: SUPABASE_ANON_KEY injected into e2e workers but critical-journey.spec.ts never reads it. Carry-over from the unit test job. Exposure risk minimal (key is also in environment.ts).
- **Fix**: Remove SUPABASE_ANON_KEY from the e2e job's env block.
- **Decision**: FIXED — removed from ci.yml e2e env block

### F6 — cache: npm (unquoted) vs cache: 'npm' (quoted) in CI

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: .github/workflows/ci.yml:45
- **Detail**: test job uses `cache: 'npm'` (quoted); e2e job used `cache: npm` (bare word). Both valid YAML; purely cosmetic.
- **Fix**: Normalize to `cache: 'npm'` to match sibling job.
- **Decision**: FIXED — normalized to quoted form
