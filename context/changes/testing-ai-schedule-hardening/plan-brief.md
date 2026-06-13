# AI Schedule Flow Hardening — Plan Brief

> Full plan: `context/changes/testing-ai-schedule-hardening/plan.md`
> Research: `context/changes/testing-ai-schedule-hardening/research.md`

## What & Why

Backfill missing test coverage for the AI schedule generation loop. Two post-impl-review guards (`choices`-array and `items`-array) were added to `AiScheduleService` during the `car-add-ai-schedule` change but never backed by specs; source and urgency filter edge cases are similarly untested. The schedule-view component's error card and generation states have zero tests. Phase 1 of the test-plan rollout closes these gaps before they compound.

## Starting Point

`ai-schedule.service.spec.ts` has 17 passing tests — the happy path, two source-filter shapes, JSON parse failure, and HTTP 500. `schedule-view.spec.ts` has 3 tests covering the delete dialog only. The generation-flow template states (skeleton, error card, filtered empty state, item list with source attribution) are entirely uncovered.

## Desired End State

`ai-schedule.service.spec.ts` passes with 24 tests. `schedule-view.spec.ts` passes with 11 tests, including a second describe block (`ScheduleViewComponent — generation flow`) that covers all terminal states of `generateSchedule()`. `test-plan.md` §6.1 and §6.4 contain concrete patterns that a developer can follow to add a new test without reading this plan.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Cache-bypass assertion (cached ai_schedule path) | Out of Phase 1 scope | Low likelihood and outside the risk response table's mandate; deferred | Plan |
| AbortError absorption | Include in component tests | Cheap single test that guards a subtle absorption that would surface as a visible error if refactored away | Plan |
| Whitespace-only DOM assertion | Positive DOM assertion only | Template renders unconditionally — whitespace protection is a service concern; component test asserts all rendered source texts are non-empty | Plan |
| `choices: null` vs `choices: []` | Both as separate tests | Documents two distinct free-tier model failure shapes; guards against single-variant refactors | Plan |
| Component test depth | All generation-flow states (8 tests) | Highest-churn component (27 commits/30d); covering all terminal states costs ~3 extra tests vs strict risk-table minimum | Plan |

## Scope

**In scope:** 7 new service unit tests; 8 new component generation-flow tests; §6.1 + §6.4 cookbook fill; §3 Phase 1 status update.

**Out of scope:** Cache-bypass path; Cloudflare Worker tests; production code changes; e2e tests; delete-flow, mark-done, and mileage-sync component tests.

## Architecture / Approach

Tests only — two existing spec files, no new files. Service tests extend the existing describe block using `vi.stubGlobal('fetch', ...)`. Component tests add a sibling describe block with a different fixture setup: `generateAndSave` spy is left unconfigured until each test sets its own resolution, then `detectChanges()` + `await fixture.whenStable()` triggers and resolves `ngOnInit`. The skeleton state is tested via direct signal mutation (`component.isGenerating.set(true)`) rather than the async path, since `whenStable()` resolves past it.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Service unit test gap-fill | 7 new tests covering envelope/items guards, null/whitespace source, invalid urgency | `makeEnvelope()` type coercion for null/object cases — confirm the helper produces the intended inner JSON |
| 2. Component generation-flow tests | 8 new tests covering error card, AbortError absorption, skeleton, empty state, source attribution | Angular 21 signal + async `whenStable()` timing — skeleton test must use direct signal mutation |
| 3. Cookbook update | §6.1 and §6.4 filled; §3 Phase 1 complete | None — prose only |

**Prerequisites:** Passing `npm test` baseline on master (17 service + 3 component = 20 tests green).  
**Estimated effort:** ~1–2 sessions; Phase 1 is mechanical, Phase 2 requires TestBed setup iteration.

## Open Risks & Assumptions

- Angular 21 + Vitest `whenStable()` timing with signals: if the component uses zoneless change detection, `whenStable()` may not wait for signal-triggered re-renders. If this is the case, the fixture will need `fixture.detectChanges()` calls around signal mutations — the plan already includes them.
- `DOMException('AbortError', 'AbortError')` constructor availability in the Vitest/jsdom environment: if jsdom does not support it, use `Object.assign(new Error('AbortError'), { name: 'AbortError' })` as a fallback.

## Success Criteria (Summary)

- `npm test` passes with 24 service tests and 11 component tests, all green
- A developer reading §6.1 or §6.4 in `test-plan.md` can add a new test without consulting this plan
- §3 Phase 1 row shows `complete`
