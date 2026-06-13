# CI Test Gate Implementation Plan

## Overview

Wire `npm test`, typecheck, and Prettier formatting into a GitHub Actions workflow that runs on every PR and push to `master`. This is Phase 3 of the test rollout — it enforces the floor built in Phases 1 and 2 so regressions cannot merge silently.

## Current State Analysis

No `.github/` directory exists. The project is deployed via Cloudflare Pages (CI provider: GitHub Actions, auto-deploy-on-merge per tech-stack.md), but no workflow files have been authored yet. The test suite already exists and passes locally:

- `npm test` — Vitest via `@angular/build:unit-test`; runs unit, component, and Angular router integration tests
- `npm run test:integration` — Supabase RLS integration tests; **local-only** (requires `supabase start`; excluded from CI by the test plan)
- No `npm run lint` script; Prettier config is embedded in `package.json`
- No `.nvmrc`; `packageManager: npm@11.15.0` in `package.json` implies Node 20+

### Key Discoveries

- `angular.json` test builder: `@angular/build:unit-test` with `runner: "vitest"` — runs headlessly in happy-dom, no real browser required in CI
- GitHub Actions sets `CI=true` automatically; Vitest respects this flag to disable watch mode without any extra flags
- `tsconfig.app.json` is the right project reference for app typecheck; Angular template errors are also caught by `npm test` (the test builder compiles templates)
- Supabase integration tests are intentionally local-only per the Quality Gates table — do not add them to this workflow

## Desired End State

Every PR targeting `master` and every direct push to `master` triggers a single-job workflow that:

1. Installs dependencies from lock file
2. Checks formatting with Prettier
3. Typechecks with `tsc --noEmit`
4. Runs the full test suite with `npm test`

A red CI status on any of these steps blocks the merge. A `.nvmrc` file pins Node 22 so local and CI environments stay in sync.

### Key Discoveries

- `actions/setup-node@v4` with `cache: 'npm'` caches `~/.npm` keyed on `package-lock.json` — speeds up subsequent runs with no extra configuration
- `cancel-in-progress: true` on the concurrency group means a fixup push cancels the stale run automatically

## What We're NOT Doing

- Running `npm run test:integration` in CI — Supabase integration tests require a live local instance; local-only per the test plan Quality Gates
- Running `npm run build` as the CI typecheck — a production build is slower and generates artifacts we don't need; `tsc --noEmit` against `tsconfig.app.json` is sufficient (template errors surface via `npm test`)
- Adding ESLint — no `ng lint` or lint script exists in the project; out of scope for this phase
- Adding e2e tests — explicitly excluded per the test plan §7

---

## Phase 1: GitHub Actions Workflow + Node Version Lock

### Overview

Create `.github/workflows/ci.yml` and `.nvmrc`. These two files are the entire deliverable of Phase 3.

### Changes Required

#### 1. GitHub Actions CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Define a workflow that installs deps, checks formatting, typechecks, and runs tests on every PR and push to `master`. Cancel superseded runs on the same ref to keep the queue clean.

**Contract**: The workflow must have exactly these four ordered steps after checkout + install: `prettier --check`, `tsc --noEmit`, `npm test`. The `concurrency` group key must include `github.ref` so PRs and branch pushes each get their own cancellation scope.

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - name: Check formatting
        run: npx prettier --check .

      - name: Typecheck
        run: npx tsc -p tsconfig.app.json --noEmit

      - name: Test
        run: npm test
```

#### 2. Node version lock file

**File**: `.nvmrc`

**Intent**: Pin Node 22 for local development so `nvm use` and Volta pick up the same version used in CI.

**Contract**: File contains a single line: `22`

### Success Criteria

#### Automated Verification

- Prettier check passes locally: `npx prettier --check .`
- Typecheck passes locally: `npx tsc -p tsconfig.app.json --noEmit`
- Full test suite passes locally: `npm test`
- Workflow YAML is syntactically valid (GitHub validates on first push)

#### Manual Verification

- Push a branch and open a PR targeting `master` — the CI workflow appears in the PR checks panel and passes
- Introduce a deliberate test failure (e.g. change an `expect` assertion), push to the PR — the Test step turns red and the PR is blocked
- Confirm the failing PR run is cancelled when a follow-up commit is pushed (concurrency in action)
- Confirm `nvm use` in a terminal picks up Node 22 after `.nvmrc` is created

**Implementation Note**: After completing Phase 1 and automated verification passes, pause for manual confirmation that the live CI run on GitHub succeeds before considering this change done.

---

## Testing Strategy

### Automated Tests

The gate itself IS the test strategy for this change — no new unit or component specs are added. The workflow file is verified by GitHub Actions parsing it on first push.

### Manual Testing Steps

1. Push the two new files to a feature branch and open a PR targeting `master`
2. Observe the Actions tab on the PR — the `CI / test` job should appear and turn green
3. Edit a spec file to break one assertion, push — `CI / test` should fail on the Test step
4. Push a fixup that reverts the break — observe the previous run gets cancelled (concurrency group)
5. Merge the PR — observe the workflow also runs on the post-merge push to `master`

## Migration Notes

No existing workflow to migrate. The Cloudflare Pages deployment continues to run independently via its own GitHub integration (not a workflow file in this repo).

## References

- Test plan: `context/foundation/test-plan.md` §3 Phase 3, §5 Quality Gates
- Phase 1 change: `context/changes/testing-ai-schedule-hardening/`
- Phase 2 change: `context/changes/testing-auth-ownership-enforcement/`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: GitHub Actions Workflow + Node Version Lock

#### Automated

- [x] 1.1 Prettier check passes locally: `npx prettier --check .`
- [x] 1.2 Typecheck passes locally: `npx tsc -p tsconfig.app.json --noEmit`
- [x] 1.3 Full test suite passes locally: `npm test`
- [x] 1.4 Workflow YAML is syntactically valid (GitHub validates on first push)

#### Manual

- [x] 1.5 PR check panel shows CI job and it passes
- [x] 1.6 Deliberate test failure causes CI red and blocks PR
- [x] 1.7 Fixup commit cancels the stale run (concurrency)
- [x] 1.8 `nvm use` picks up Node 22 from `.nvmrc`
