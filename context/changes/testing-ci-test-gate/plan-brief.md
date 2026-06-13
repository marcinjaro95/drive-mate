# CI Test Gate — Plan Brief

> Full plan: `context/changes/testing-ci-test-gate/plan.md`

## What & Why

Wire `npm test`, TypeScript typecheck, and Prettier formatting into a GitHub Actions workflow that runs on every PR and direct push to `master`. This is Phase 3 of the test rollout — without a CI gate, the protections built in Phases 1 (AI schedule hardening) and 2 (auth & ownership enforcement) can regress silently when future changes land.

## Starting Point

No `.github/` directory exists. The project already deploys to Cloudflare Pages via GitHub's built-in integration, but no workflow file has been written. The test suite (`npm test`) passes locally and covers unit, component, and Angular router integration tests.

## Desired End State

Every PR targeting `master` shows a required CI check that enforces formatting, types, and tests. A red status blocks the merge. A `.nvmrc` file ensures local development and CI use the same Node 22 runtime.

## Key Decisions Made

| Decision                | Choice                              | Why (1 sentence)                                                                  |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| Gate scope              | test + typecheck + Prettier check   | Matches the Quality Gates table in the test plan; no ESLint exists in the project |
| Typecheck method        | `tsc -p tsconfig.app.json --noEmit` | Faster than a full build; Angular template errors are caught by `npm test` anyway |
| Integration tests in CI | Excluded                            | Require a live Supabase instance; explicitly local-only per the test plan §5      |
| Node version            | 22 LTS                              | npm 11 requires Node 20+; 22 is the current LTS with support through April 2027   |
| Triggers                | push + pull_request to master       | Guards both PRs and any direct hotfix pushes                                      |
| Concurrency             | cancel-in-progress on same ref      | Keeps the queue clean when fixup commits are pushed to an open PR                 |
| `.nvmrc`                | Yes                                 | Pins Node 22 locally so `nvm use` and CI always match                             |

## Scope

**In scope:**

- `.github/workflows/ci.yml` — single job running Prettier check, tsc typecheck, `npm test`
- `.nvmrc` — pins Node 22

**Out of scope:**

- `npm run test:integration` (Supabase RLS tests — local-only)
- ESLint / `ng lint` (no lint script in the project)
- `npm run build` in CI (not needed for a test gate)
- e2e tests (excluded per test plan §7)

## Architecture / Approach

Single GitHub Actions job (`test`) on `ubuntu-latest`. Steps run sequentially: checkout → setup Node 22 with npm cache → `npm ci` → Prettier → typecheck → `npm test`. A `concurrency` group keyed on `github.ref` cancels stale runs when new commits arrive. GitHub Actions sets `CI=true` automatically, which Vitest uses to disable watch mode.

## Phases at a Glance

| Phase                                          | What it delivers                      | Key risk                                                                             |
| ---------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. GitHub Actions Workflow + Node Version Lock | `.github/workflows/ci.yml` + `.nvmrc` | Prettier check might fail on existing formatting drift before the workflow is merged |

**Prerequisites:** Phases 1 and 2 of the test rollout are complete (they are).  
**Estimated effort:** ~1 session; 2 files, ~40 lines of YAML total.

## Open Risks & Assumptions

- Prettier may flag existing files as unformatted — if `npx prettier --check .` fails locally before the PR, run `npx prettier --write .` and commit the formatting fix first
- The `@angular/build:unit-test` builder with Vitest should auto-detect `CI=true` and run in non-watch mode; if it hangs, add `-- --run` to the `npm test` invocation in the workflow

## Success Criteria (Summary)

- A PR to `master` shows a passing CI check in the GitHub PR panel
- A broken test causes CI to fail and block the PR
- `npm test`, typecheck, and Prettier all exit 0 on the current codebase before the PR is opened
