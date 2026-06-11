# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-09 (Phase 1 change opened)

---

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/app/` (38 commits/30d).

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | AI schedule generation receives invalid or unexpected LLM response → app crashes or shows a broken/empty state with no useful feedback | High | High | PRD §FR-005; interview Q1, Q3; hot-spot dir `src/app/vehicles/schedule-view` (27 commits/30d) |
| 2 | Source attribution guardrail bypassed — at least one AI-generated maintenance item without a traceable source renders in the schedule view | High | High | PRD §Guardrails ("AI hallucinating intervals is worse than showing nothing"); PRD §FR-005; interview Q1, Q4 |
| 3 | Unauthenticated visitor accesses a protected route — auth guard is absent or fails silently | High | Medium | PRD §Access Control ("all routes gated behind auth"); interview Q4; hot-spot dirs `src/app/auth/login` + `src/app/auth/signup` (9 commits/30d) |
| 4 | RLS policies do not enforce per-user row ownership at the database — one user can read another user's vehicles or service records | High | Medium | PRD §Guardrails ("single data-isolation bug kills trust permanently"); AGENTS.md hard rule; interview Q4; RLS only tested via client-side mocks |
| 5 | Schedule regeneration triggered for a vehicle the current user does not own — application-layer ownership check missing, AI proxy called for unauthorized vehicle | High | Low | PRD §Access Control; AGENTS.md "Data isolation is non-negotiable"; hot-spot dir `src/app/vehicles/schedule-view` (27 commits/30d) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | App surfaces a clear error state (not blank, not crash) when the AI proxy returns non-2xx, malformed JSON, or valid JSON with wrong schema shape; user can navigate away | "The existing `rejects.toThrow()` test proves the generation flow is protected" — it covers HTTP 500 and bad JSON parse only; schema mismatches and partial responses are not covered | What does `schedule-view` render when `AiScheduleService` throws? Is there an error signal in the component's state? | unit (extend AI schedule service spec) + component (verify schedule-view renders error state on throw) | Testing only the service-level throw without verifying what the user actually sees on screen |
| #2 | Schedule view never renders an item where `source` is empty, null, undefined, or whitespace-only, across all LLM response shapes | "The existing source filter tests prove the guardrail" — they cover empty string and missing property; null and whitespace-only are untested; no end-to-end path through component verified | What is the exact source-filter predicate? Does it cover null and whitespace-only strings? Are there template paths that bypass it? | unit (add null/whitespace-only cases to existing spec) + component (verify template never renders items with falsy `source`) | Implementation mirror — asserting the filter returns what the current code already returns, rather than asserting no sourceless item is ever shown to the user |
| #3 | Direct navigation to `/dashboard`, `/vehicles/:id`, and any other protected path redirects an unauthenticated visitor to sign-in; the redirect does not flash the protected page during the `isLoading` state | "A guard function exists in the code so it works" — existence does not prove it is applied to every route in `app.routes.ts` or that it handles the pre-initialization loading state correctly | Which routes have the guard applied? Does the guard handle `isLoading`/`initialized` without briefly rendering the protected page? | unit/integration (Angular TestBed with router — test guard redirects unauthenticated navigation and allows authenticated navigation) | Testing the guard function in isolation without verifying it is wired to every protected route |
| #4 | A Supabase query issued with User A's session cannot return rows owned by User B for `vehicles` or `service_records` — SELECT, INSERT, UPDATE, and DELETE are all covered | "The mock tests prove ownership enforcement" — mocks assert `.eq('user_id', ...)` is called on the client; they do not prove RLS policies fire at the DB; a missing or misconfigured policy passes all existing tests | What do the current RLS policy definitions look like in the migration files? Do they cover all four operations for both tables? Can a local Supabase instance be used for integration tests? | integration against local Supabase — two test user sessions, cross-user queries rejected at the DB level | Continued reliance on mock-builder assertions that only verify client-side call patterns, not actual database enforcement |
| #5 | A request to regenerate the schedule for a vehicle not owned by the current user is rejected at the application layer before the AI proxy is called | "RLS prevents the DB write anyway" — without an app-layer check, a malicious user can still trigger a costly AI proxy call for another user's vehicle even if the DB write is eventually rejected | Does `AiScheduleService.generateAndSave` verify vehicle ownership before calling the AI proxy? Does `ScheduleViewComponent` pass vehicle IDs from the route without ownership verification? | unit (verify ownership check exists before AI proxy call) | Testing only the DB rejection path (RLS) without testing whether the app layer prevents the unnecessary AI proxy call |

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|----------------|------------|--------|---------------|
| 1 | AI schedule flow hardening | Prove the core generation loop is resilient to malformed responses and always enforces source attribution | #1, #2 | unit + component | change opened | testing-ai-schedule-hardening |
| 2 | Auth & ownership enforcement | Verify route guard covers all protected routes; verify RLS enforces per-user isolation at the DB; verify app-layer ownership on schedule generation | #3, #4, #5 | Angular router integration + Supabase integration (local) | not started | — |
| 3 | CI test gate | Wire `npm test` to run on every PR so the floor from Phases 1+2 cannot regress silently | cross-cutting | CI gate | not started | — |

---

## 4. Stack

The classic test base for this project. AI-native tools carry a `checked:`
date so future readers can see which lines need re-verification.
Recommendations below are grounded in local manifests/configs plus the MCP
tools actually exposed in the current session.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + component | Vitest (via Angular builder) | ^4.1.8 | Runner: `npm test`; Angular TestBed for component tests |
| Supabase integration | `@supabase/supabase-js` + local Supabase CLI | ^2.107.0 | `supabase start` for local DB; two test user sessions for cross-user RLS verification |
| Angular router integration | Angular TestBed + `provideRouter` | ^21.0.0 | Route guard testing; no separate e2e runner needed |
| e2e | none — see §7 | — | Excluded per Q5 (no infrastructure overinvestment) |
| AI-native | none | — | No Playwright MCP or vision review in scope for this rollout |

**Stack grounding tools (current session):**
- Docs: none — no Context7 or framework docs MCP available in this session; checked: 2026-06-09
- Search: Exa.ai (`mcp__exa__web_search_exa`) — available; use in `/10x-research` phases to verify Supabase RLS testing patterns and Angular router guard test setup; checked: 2026-06-09
- Runtime/browser: none — no Playwright MCP in session; consistent with Q5 exclusion of e2e; checked: 2026-06-09
- Provider/platform: Linear MCP available — issue-creation relevance for quality gate tracking; no Supabase MCP in session; checked: 2026-06-09

---

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required | syntactic / type drift |
| unit + component | local + CI | required after §3 Phase 1 | logic regressions in AI schedule flow and source attribution |
| Supabase integration | local | required after §3 Phase 2 | RLS misconfiguration and cross-user data isolation failures |
| Angular router integration | local + CI | required after §3 Phase 2 | auth guard missing from routes or broken during loading state |
| CI test runner gate (`npm test`) | CI on PR | required after §3 Phase 3 | any regression across the whole suite |
| e2e | — | not in scope — see §7 | — |
| post-edit hook | local (agent loop) | recommended (configure separately) | regressions at edit time; not a rollout phase deliverable |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit or component test

TBD — see §3 Phase 1 for AI schedule resilience and source attribution guardrail patterns.

### 6.2 Adding an Angular router / guard integration test

TBD — see §3 Phase 2 for auth guard coverage and route protection patterns.

### 6.3 Adding a Supabase RLS integration test

TBD — see §3 Phase 2 for cross-user data isolation and local Supabase test session patterns.

### 6.4 Adding a test for a new AI schedule response shape

TBD — see §3 Phase 1 for malformed-response and schema-mismatch test patterns.

---

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Visual look-and-feel** — no snapshot or pixel-diff tests for component appearance. Re-evaluate if the product introduces a paid design system with contractual visual requirements. (Source: Phase 2 interview Q5.)
- **Configuration files** — no tests that verify wrangler.toml, angular.json, or tsconfig are correct. These are validated implicitly by a successful build. Re-evaluate if multi-environment config divergence causes a production incident. (Source: Phase 2 interview Q5.)
- **End-to-end (Playwright/Cypress)** — out of scope for this rollout; integration layer is the ceiling. Re-evaluate if a critical user flow can only be verified through a fully deployed environment. (Source: Phase 2 interview Q5.)
- **VIN lookup flow (S-03)** — blocked on an unresolved external API; excluded until the API provider is confirmed. (Source: roadmap, S-03 status: blocked.)

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-09
- Stack versions last verified: 2026-06-09
- AI-native tool references last verified: 2026-06-09

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
