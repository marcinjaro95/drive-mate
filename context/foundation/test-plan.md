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
| 1 | AI schedule flow hardening | Prove the core generation loop is resilient to malformed responses and always enforces source attribution | #1, #2 | unit + component | complete | testing-ai-schedule-hardening |
| 2 | Auth & ownership enforcement | Verify route guard covers all protected routes; verify RLS enforces per-user isolation at the DB; verify app-layer ownership on schedule generation | #3, #4, #5 | Angular router integration + Supabase integration (local) | change opened | testing-auth-ownership-enforcement |
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

**Service unit tests** (`src/app/core/ai-schedule/ai-schedule.service.spec.ts`)

Extend the existing `describe('AiScheduleService', ...)` block. Use the
`vi.stubGlobal('fetch', ...)` + `makeEnvelope()` helpers that are already in
the file. For a guard path (throws on bad shape):

```ts
it('rejects when <shape>', async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(<envelope>) }),
  );
  await expect(service.generateAndSave('v1', makeVehicle())).rejects.toThrow(
    '<message substring>',
  );
});
```

For a filter path (bad item is dropped):

```ts
it('drops item when <condition>', async () => {
  vi.stubGlobal('fetch', makeFetch([makeItem(<bad props>), makeItem()]));
  const result = await service.generateAndSave('v1', makeVehicle());
  expect(result).toHaveLength(1);
  expect(result[0].item).toBe(makeItem().item); // valid item survives
});
```

**Component tests** (`src/app/vehicles/schedule-view/schedule-view.spec.ts`)

The file uses **two sibling describe blocks**:

- `describe('ScheduleViewComponent — delete flow', ...)` — existing tests; `detectChanges()` is called in `beforeEach` and tests operate synchronously.
- `describe('ScheduleViewComponent — generation flow', ...)` — async generation tests; `detectChanges()` is **not** called in `beforeEach`. Each test configures the `generateAndSave` spy, then triggers the async path with:

  ```ts
  fixture.detectChanges();          // triggers ngOnInit
  await fixture.whenStable();       // waits for all async resolution
  fixture.detectChanges();          // flushes signal changes to the DOM
  ```

For intermediate/synchronous states (e.g. `isGenerating` skeleton), do **not**
trigger `ngOnInit`. Mutate the signal directly and call `detectChanges()` once:

```ts
component.isGenerating.set(true);
fixture.detectChanges();
expect(fixture.nativeElement.querySelector('.skeleton-container')).not.toBeNull();
```

The generation-flow `beforeEach` provides: `provideRouter([])`,
`provideAnimationsAsync()`, an `ActivatedRoute` stub with
`{ snapshot: { params: { id: 'v1' } } }`, a `VehicleService` mock returning
`makeVehicle({ ai_schedule: null })` (forces generation), and an
`AiScheduleService` mock with `generateAndSave: generateAndSaveSpy`.

### 6.2 Adding an Angular router / guard integration test

**File**: `src/app/core/auth/auth.guard.spec.ts` — extend the existing `describe('authGuard', ...)` block.

**Setup** — provide the real route config and a minimal `AuthService` fake, with initial navigation disabled so each test controls navigation explicitly:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter, withDisabledInitialNavigation, Router } from '@angular/router';
import { signal } from '@angular/core';
import { routes } from '../../app.routes';
import { AuthService } from './auth.service';

function setupGuardTest(opts: { initialized: Promise<void>; authenticated: boolean }) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withDisabledInitialNavigation()),
      {
        provide: AuthService,
        useValue: {
          initialized: opts.initialized,
          isAuthenticated: signal(opts.authenticated),
        },
      },
    ],
  });
  return TestBed.inject(Router);
}
```

**Why `provideRouter(routes)`** (not a test-only stub): using the real route config means the test verifies the guard is actually wired to protected routes — a stub would pass even if the guard were removed from `app.routes.ts`.

**Why `withDisabledInitialNavigation()`**: prevents Angular from triggering an automatic navigation to `'/'` when the TestBed is set up. Without this, the first navigation in a pending-`initialized` test might conflict with an in-flight initial navigation to the root route.

**Fake `AuthService` shape**: the guard only uses two properties — `initialized: Promise<void>` and `isAuthenticated: Signal<boolean>`. The fake needs only those two; other `AuthService` members are not required.

**Assertion pattern** — always assert `router.url`, never the rendered component:

```ts
// Unauthenticated redirect
await router.navigateByUrl('/dashboard');
expect(router.url).toBe('/login');

// Authenticated pass-through
await router.navigateByUrl('/dashboard');
expect(router.url).toBe('/dashboard');
```

`router.url` is reliable regardless of whether lazy-loaded components instantiate successfully. For `loadComponent` routes, the guard fires before the dynamic `import()` — so the unauthenticated test never triggers lazy loading at all.

**Testing pre-init suspension** (guard awaits `auth.initialized`):

```ts
let resolveInit!: () => void;
const initialized = new Promise<void>(r => { resolveInit = r; });
const router = setupGuardTest({ initialized, authenticated: false });

const nav = router.navigateByUrl('/dashboard');
// Guard is suspended — initialized hasn't resolved yet.
expect(router.url).toBe('/');  // URL unchanged while guard waits
resolveInit();
await nav;
expect(router.url).toBe('/login');
```

This works because the `await router.navigateByUrl(...)` call is not awaited before the `expect` — JavaScript is synchronous between microtasks, so `router.url` is checked before any pending Promise callbacks can run.

### 6.3 Adding a Supabase RLS integration test

TBD — see §3 Phase 2 for cross-user data isolation and local Supabase test session patterns.

### 6.4 Adding a test for a new AI schedule response shape

**File**: `src/app/core/ai-schedule/ai-schedule.service.spec.ts`
**Block**: extend the existing `describe('AiScheduleService', ...)`.

Two categories of shape variation:

**Envelope-level** (the outer object returned by `fetch`): the inner content
is irrelevant because the guard fires before parsing. Stub `fetch` with the
raw shape and assert the guard's throw message:

```ts
it('rejects when choices is <shape>', async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: <shape> }) }),
  );
  await expect(service.generateAndSave('v1', makeVehicle())).rejects.toThrow(
    'AI proxy returned unexpected response shape',
  );
});
```

Use this for: `choices: null`, `choices: []` (empty), `choices: undefined`,
or any future OpenRouter envelope variation that breaks the `choices[0]` path.

**Inner-content** (the JSON parsed from `choices[0].message.content`): the
envelope is valid; the items payload is malformed. Use `makeEnvelope()` to
produce a valid outer envelope and pass the bad items value as its argument:

```ts
it('rejects when items is <shape>', async () => {
  vi.stubGlobal('fetch', makeFetch(makeEnvelope(<bad-items>)));
  await expect(service.generateAndSave('v1', makeVehicle())).rejects.toThrow(
    'AI response missing items array',
  );
});
```

Use this for: `items: null`, `items: {}`, `items: 'string'`, or any future
schema where `items` is present but not an array.

**Filter paths** (valid envelope + valid items, but individual items have bad
fields): pair the bad item with a `makeItem()` fallback and assert the
survivor:

```ts
it('drops item with <bad field>', async () => {
  vi.stubGlobal('fetch', makeFetch([makeItem({ <field>: <bad value> }), makeItem()]));
  const result = await service.generateAndSave('v1', makeVehicle());
  expect(result).toHaveLength(1);
});
```

Use this for: `source: null`, `source: '   '`, `urgency: 'unknown'`, or any
future field the service's filter predicate guards against.

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
