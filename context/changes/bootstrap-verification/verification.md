---
bootstrapped_at: 2026-05-23T12:25:00Z
starter_id: angular
starter_name: Angular
project_name: drive-mate
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: 'npm audit --json'
---

## Hand-off

```yaml
starter_id: angular
package_manager: npm
project_name: drive-mate
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

**Why this stack**: Custom path. The user initially named Angular + Supabase + Cloudflare + Spring Boot; Spring Boot was dropped after surfacing the split-runtime friction against a 3-week solo after-hours profile. Angular passes all four agent-friendly quality gates (typed, convention-based, popular in JS training data, well-documented) and the self-check came back clean across all five points. Supabase provides PostgreSQL + auth (email+password and OAuth) + Row Level Security, covering the PRD's data-isolation guardrail directly. Angular is served as a static SPA from Cloudflare Pages; the AI maintenance schedule (FR-005) requires a server-side proxy for the Anthropic API call — a Cloudflare Worker or Supabase Edge Function alongside the Pages deploy. CI runs on GitHub Actions with auto-deploy-on-merge.

## Pre-scaffold verification

| Signal      | Value                                      | Severity | Notes                                                   |
| ----------- | ------------------------------------------ | -------- | ------------------------------------------------------- |
| npm package | @angular/cli v21.2.12 published 2026-05-21 | fresh    | resolved from cmd_template (`npx @angular/cli new`)     |
| GitHub repo | not run                                    | —        | docs_url is https://angular.dev (not a GitHub repo URL) |

## Scaffold log

**Resolved invocation**: `npx @angular/cli new bootstrap-scaffold-temp --defaults --routing --style scss --skip-tests --ssr false`

> Note: The standard temp name `.bootstrap-scaffold` was rejected by the Angular CLI's project-name validator (names must match `^(?:@[a-zA-Z0-9-*~][a-zA-Z0-9-*._~]*/)?[a-zA-Z0-9-~][a-zA-Z0-9-._~]*$`; leading dots are not valid npm package names). The fallback name `bootstrap-scaffold-temp` was used. Project name references in `angular.json` and `package.json` were updated from `bootstrap-scaffold-temp` to `drive-mate` before move-up.

**Strategy**: subdir-then-move

**Exit code**: 0

**Files moved**: 20 files explicitly scaffolded by the Angular CLI, plus `package-lock.json` and `node_modules/` tree installed by npm, plus `.git/` initialized by Angular CLI during scaffold

**Conflicts (.scaffold siblings)**: none

**.gitignore handling**: moved silently (no `.gitignore` existed in cwd prior to scaffold)

**Temp dir cleanup**: deleted (`bootstrap-scaffold-temp/` removed after move-up)

**Files scaffolded** (as reported by Angular CLI):

- `angular.json`
- `package.json`
- `README.md`
- `tsconfig.json`
- `.editorconfig`
- `.gitignore`
- `tsconfig.app.json`
- `tsconfig.spec.json`
- `.vscode/extensions.json`
- `.vscode/launch.json`
- `.vscode/tasks.json`
- `src/main.ts`
- `src/index.html`
- `src/styles.scss`
- `src/app/app.ts`
- `src/app/app.scss`
- `src/app/app.html`
- `src/app/app.config.ts`
- `src/app/app.routes.ts`
- `public/favicon.ico`

**Preserved from cwd** (conflict matrix applied, all protected):

- `CLAUDE.md`
- `context/` (protected verbatim)
- `idea-notes.md`

## Post-scaffold audit

**Tool**: `npm audit --json`

**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW

**Direct vs transitive**: 0/0/0/0 direct of total 0/0/0/0 (no findings)

**Total dependencies scanned**: 512 (10 prod, 503 dev, 127 optional, 3 peer)

Clean tree — no advisories found.

## Hints recorded but not acted on

| Hint                    | Value                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| bootstrapper_confidence | verified                                                                                               |
| quality_override        | false                                                                                                  |
| path_taken              | custom                                                                                                 |
| self_check_answers      | typed: true, from_official_starter: true, conventions: true, docs_current: true, can_judge_agent: true |
| team_size               | solo                                                                                                   |
| deployment_target       | cloudflare-pages                                                                                       |
| ci_provider             | github-actions                                                                                         |
| ci_default_flow         | auto-deploy-on-merge                                                                                   |
| has_auth                | true                                                                                                   |
| has_payments            | false                                                                                                  |
| has_realtime            | false                                                                                                  |
| has_ai                  | true                                                                                                   |
| has_background_jobs     | false                                                                                                  |

No automated action was taken on any of these hints in v1. A future M1L4 skill ("Memory Architecture") will act on `deployment_target`, `ci_provider`, `ci_default_flow`, and the `has_*` feature flags to generate `CLAUDE.md` and `AGENTS.md`.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` has already been run by the Angular CLI; check `.git/` is in the right state and add your remote with `git remote add origin <your-repo-url>`.
- Review any `.scaffold` siblings the conflict policy created and decide which version to keep — there are none in this run.
- Run `npm start` (or `ng serve`) to confirm the scaffold runs locally before adding the Supabase and Cloudflare integration layers.
- The Cloudflare Pages deploy target will need a `@angular/build` adapter or a `ng build` output configured for static hosting — check the Angular Cloudflare Pages docs for the correct build configuration.
- The AI feature flag (`has_ai: true`) points to a Cloudflare Worker or Supabase Edge Function proxy for the Anthropic API — that wiring is outside v1 bootstrapper scope.
