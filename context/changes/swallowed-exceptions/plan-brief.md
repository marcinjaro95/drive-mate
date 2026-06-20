# Swallowed Exceptions — Plan Brief

> Full plan: `context/changes/swallowed-exceptions/plan.md`
> Research: `context/changes/swallowed-exceptions/research.md`

## What & Why

Two bare `catch {}` blocks in `schedule-view.ts` silently discard `getServiceRecords` failures —
no log, no user signal. A Supabase RLS error or transient network failure becomes completely
invisible, and the AI schedule is generated without service-history context with no indication to
the user that it is degraded.

## Starting Point

Research (commit `64b6e00`) pinpointed two sites: line 88 in `ngOnInit` and line 114 inside
`generateSchedule`. All other catch blocks in the codebase propagate correctly (signal or
re-throw). No existing tests exercise these two failure paths.

## Desired End State

When `getServiceRecords` throws on either path: the error is logged via `console.warn`, a
`serviceRecordsUnavailable` signal is set, and a non-blocking notice — "Schedule generated
without service history — some intervals may be approximate." — appears below the schedule cards.
The schedule itself still renders (graceful degradation preserved). On a successful retry the
notice clears. Five new tests reproduce both swallow sites and the happy path.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Fix behaviour | Degraded-state UI indicator + console.warn | User needs to know the schedule is approximate; logging makes it visible in monitoring. | Plan |
| Notice style | Non-blocking, non-dismissable notice below schedule list | Follows existing `mileageSyncWarning` pattern; no dismiss button needed because a successful retry auto-clears it. | Plan |
| Signal reset | Reset `serviceRecordsUnavailable` at start of `generateSchedule` | Ensures the notice disappears on a successful retry without a separate dismiss action. | Plan |
| Test scope | Both Instance A (ngOnInit) and Instance B (generateSchedule direct call) | The two sites are in different code paths and require different test setups. | Plan |
| lessons.md | Fill in Rule + Applies-to | Closes open TODOs while context is fresh; prevents a third error-contract pattern. | Plan |

## Scope

**In scope:**
- `schedule-view.ts`: add signal, reset in `generateSchedule`, fix both catch blocks
- `schedule-view.html`: add `@if (serviceRecordsUnavailable())` notice block
- `schedule-view.scss`: style `.records-unavailable-notice` to match `mileage-warning`
- `schedule-view.spec.ts`: five new tests across two failure paths + happy path
- `context/foundation/lessons.md`: fill in Rule and Applies-to fields

**Out of scope:**
- Blocking the schedule or showing a full error card on `getServiceRecords` failure
- Dismissable button on the notice
- Changing any other catch block in the codebase
- Adding production error-tracking (Sentry etc.)

## Architecture / Approach

Single-component change. `serviceRecordsUnavailable = signal(false)` is declared alongside
existing boolean signals. Both catch blocks set it to `true` and call `console.warn`. The signal
is reset to `false` at the top of `generateSchedule` (after `error.set(null)`). The template
renders the notice inside the already-rendered-schedule `@else` branch, after the schedule list
and before the existing `mileageSyncWarning` block.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Signal + catch blocks | Error no longer silently swallowed; TypeScript compiles | None — purely additive |
| 2. Template notice | User sees degraded-state indicator | CSS styling parity with existing warning |
| 3. Tests | Both swallow sites covered; regression-proof | Instance B setup requires bypassing ngOnInit flow |
| 4. lessons.md | Rule and Applies-to lines finalized | None |

**Prerequisites:** None — no migrations, no API changes, no dependency additions.  
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- `mileageSyncWarning` CSS class name is assumed to exist in the SCSS file; if the existing
  warning uses a different styling approach, the `.records-unavailable-notice` rule may need
  adjustment.
- Instance B is only reachable when `generateSchedule()` is called without arguments — tests
  must manually call the method rather than relying on `ngOnInit`.

## Success Criteria (Summary)

- Five new tests pass, covering both failure paths and the happy path.
- Navigating to a schedule view where `getServiceRecords` fails shows the degraded-state notice
  alongside (not instead of) the generated schedule cards.
- `lessons.md` Rule and Applies-to fields are no longer placeholders.
