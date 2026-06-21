---
starter_id: angular
package_manager: npm
project_name: drive-mate
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers-static-assets
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
---

## Why this stack

Custom path. The user initially named Angular + Supabase + Cloudflare + Spring Boot; Spring Boot was dropped after surfacing the split-runtime friction against a 3-week solo after-hours profile. Angular passes all four agent-friendly quality gates (typed, convention-based, popular in JS training data, well-documented) and the self-check came back clean across all five points. Supabase provides PostgreSQL + auth (email+password and OAuth) + Row Level Security, covering the PRD's data-isolation guardrail directly. The Angular SPA is served via Cloudflare Workers Static Assets (`[assets]` binding in `wrangler.toml`); the same Worker handles `POST /api/ai` (OpenRouter streaming proxy) and `POST /api/vin` (AutoRef EU → NHTSA VIN lookup). This is the Workers Static Assets pattern, not Cloudflare Pages — a single `npx wrangler deploy` deploys both the SPA and the API routes atomically. CI runs on GitHub Actions; auto-deploy-on-merge is planned but not yet wired up.
