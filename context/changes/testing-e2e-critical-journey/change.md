---
change_id: testing-e2e-critical-journey
title: E2E Playwright test for the critical new-user journey (sign-up → vehicle → AI schedule)
status: impl_reviewed
created: 2026-06-14
updated: 2026-06-14
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md:
"E2E critical user journey".

Risks covered: #1 (AI schedule resilience to malformed LLM responses),
#2 (source attribution guardrail), #3 (unauthenticated visitor redirect).
Test types planned: Playwright e2e against a Cloudflare Pages preview +
real Supabase staging project.

Risk response intent:

- Risk #1: prove the schedule view renders real maintenance items (not a
  crash or blank) after a live AI proxy call in staging — the e2e catches
  what unit tests cannot: the actual proxy contract, network errors, and
  the full browser render path.
- Risk #2: prove no item in the schedule DOM renders without a visible,
  non-empty source attribution string — assert in the browser, not the
  service layer.
- Risk #3: prove an unauthenticated Playwright session redirects to
  sign-in when navigating directly to /dashboard or /vehicles/:id in a
  deployed environment, not just in Angular TestBed.

Scope: one Playwright spec — (1) sign-up with a test e-mail, (2) add a
vehicle, (3) wait for AI schedule generation, (4) assert at least one
schedule item is visible with non-empty source attribution. Teardown:
delete the test user via Supabase Admin API after each run.

Required research before planning:

- How to provision/teardown a real Supabase staging user in Playwright
  beforeAll/afterAll (REST Admin API or SDK).
- Whether Cloudflare Pages preview URLs are deterministic enough to
  target in CI, or if a fixed staging URL must be maintained separately.
- How to store SUPABASE_SERVICE_ROLE_KEY and PLAYWRIGHT_BASE_URL as
  GitHub Actions secrets without leaking them in PR review logs.
- Whether the AI Cloudflare Worker proxy is deployed alongside each Pages
  preview or is a shared staging endpoint.
