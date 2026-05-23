# DriveMate — Cloudflare Workers Deployment Plan

## Context

DriveMate is an Angular 21 SPA skeleton (zero features implemented) that needs its full Cloudflare infrastructure wired up. The platform decision is finalized in `context/foundation/infrastructure.md`. This plan executes that decision: Angular SPA + OpenRouter AI proxy served by a single **Cloudflare Worker** with static asset binding (Workers Static Assets), Smart Placement for Supabase latency, and Cloudflare native Git integration for auto-deploy on push.

**Architecture:** One Worker (`functions/worker.ts`) handles all requests. `/api/ai` is the OpenRouter streaming proxy; everything else is served from the `[assets]` binding (`dist/drive-mate/browser`), with `not_found_handling = "single-page-application"` for Angular SPA routing.

**Deployed URL:** `https://drive-mate.workers.dev` (custom domain addable later)

**Current state (2026-05-23):**
- ✅ Wrangler v4 installed
- ✅ `wrangler login` completed (account: `1045124760937fe73c7eaa433bffe98d`)
- ✅ `wrangler.toml` — Workers config with `[assets]` + Smart Placement + `workers_dev = true`
- ✅ `functions/worker.ts` — OpenRouter proxy + asset passthrough
- ✅ `functions/tsconfig.json` — Workers-scoped tsconfig
- ✅ `.gitignore` — `.env`, `.dev.vars` added
- ✅ `src/index.html` — title fixed to `DriveMate`
- ✅ `src/environments/environment.ts` — Supabase dev config filled
- ✅ `src/environments/environment.prod.ts` — Supabase prod config filled
- ✅ `angular.json` — `fileReplacements` added to production config
- ✅ `.dev.vars` — local wrangler secret placeholder (gitignored)
- ✅ `npm run build` passes locally
- ✅ Cloudflare Workers project deployed via `wrangler deploy` (Phase 5)
- ✅ `OPENROUTER_API_KEY` secret set (Phase 6)
- ⬜ Git integration / auto-deploy via Cloudflare dashboard (Phase 7) — optional, manual deploy via `wrangler deploy` works
- ✅ End-to-end verification passed (Phase 8)

**Live URL:** `https://drive-mate.marcinjaro95.workers.dev`

---

## Files Created / Modified

| File | Status | Notes |
|---|---|---|
| `package.json` | ✅ done | `wrangler ^4.94.0` in devDependencies |
| `wrangler.toml` | ✅ done | Workers config: `main`, `[assets]`, Smart Placement |
| `.gitignore` | ✅ done | `.env`, `.dev.vars` entries added |
| `src/index.html` | ✅ done | Title: `DriveMate` |
| `src/environments/environment.ts` | ✅ done | Dev Supabase config (real values) |
| `src/environments/environment.prod.ts` | ✅ done | Prod Supabase config (real values) |
| `angular.json` | ✅ done | `fileReplacements` in production build config |
| `.dev.vars` | ✅ done | Local wrangler secret placeholder (gitignored) |
| `functions/tsconfig.json` | ✅ done | Workers types scope |
| `functions/worker.ts` | ✅ done | Main Worker: `/api/ai` proxy + ASSETS fallthrough |
| `functions/api/ai.ts` | ✅ removed | Was Pages Function format — replaced by `worker.ts` |

---

## Phase 0 — Prerequisites ✅ DONE

### 0.1 — Local tooling ✅
- Node.js 22.18.0
- npm 11.15.0
- Wrangler 4.94.0
- Git 2.46.2

### 0.2 — Cloudflare account ✅
- Account ID: `1045124760937fe73c7eaa433bffe98d`
- `wrangler login` completed (OAuth)

### 0.3 — Supabase project ✅
- Project URL: `https://hftjmsmkmfiasseubjpz.supabase.co`
- Anon key filled in environment files

### 0.4 — OpenRouter account ✅
- Account exists; API key on hand (goes into Phase 6)

### 0.5 — GitHub repository ✅
- Repository exists; `master` branch is current

---

## Phase 1 — Wrangler Install & Auth ✅ DONE

- `wrangler ^4.94.0` in `devDependencies`
- `npx wrangler login` complete
- Account ID confirmed

---

## Phase 2 — Core Config Files ✅ DONE

### `wrangler.toml`
```toml
name = "drive-mate"
main = "functions/worker.ts"
compatibility_date = "2026-05-23"

[assets]
directory = "dist/drive-mate/browser"
binding = "ASSETS"
not_found_handling = "single-page-application"

[placement]
mode = "smart"
```

- `main` — Worker entry point (handles all requests)
- `[assets]` — serves Angular SPA static files via `ASSETS` binding
- `not_found_handling = "single-page-application"` — returns `index.html` for unknown paths (Angular router handles them)
- `[placement] mode = "smart"` — routes Worker nearest to Supabase (Frankfurt)
- **Never** add `account_id`, secrets, or API keys here

---

## Phase 3 — Angular Environment Files ✅ DONE

- `src/environments/environment.ts` — dev config with real Supabase values
- `src/environments/environment.prod.ts` — prod config with real Supabase values
- `angular.json` — `fileReplacements` added to production configuration

---

## Phase 4 — Worker (`functions/worker.ts`) ✅ DONE

Single Worker entry point at `functions/worker.ts`:
- **`/api/ai` POST** — OpenRouter streaming proxy (injects `OPENROUTER_API_KEY`)
- **`/api/ai` OPTIONS** — CORS preflight
- **Everything else** — `env.ASSETS.fetch(request)` → serves SPA, falls back to `index.html` for SPA routes

`functions/tsconfig.json` scopes Workers types separately from the Angular app tsconfig.

---

## Phase 5 — Deploy Worker ✅ DONE

Deployed via `npx wrangler deploy` (CLI, not dashboard). Worker is live with static assets bound.

**Live URL:** `https://drive-mate.marcinjaro95.workers.dev`

Note: `workers_dev = true` was required in `wrangler.toml` to activate the `.workers.dev` subdomain.

**Optional (not done) — Git integration via Cloudflare dashboard:**
If auto-deploy on push is desired, connect the repo from Workers & Pages → Create application → Worker → Connect to Git. Set build command `npm run build`, deploy command `npx wrangler deploy`, and add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` env vars. For now, manual `npx wrangler deploy` after `npm run build` is the deploy flow.

---

## Phase 6 — Secrets ✅ DONE

`OPENROUTER_API_KEY` secret is set. Verified: `npx wrangler secret list` shows it. Proxy tested and returns valid responses.

### Supabase vars (build-time, baked into JS bundle)
Already in `src/environments/environment.prod.ts` (committed). Compiled into the bundle at build time — no additional steps needed.

---

## Phase 7 — Git Integration Auto-Deploy ⬜ OPTIONAL / SKIPPED

Git integration via Cloudflare dashboard was not wired up. Current deploy flow: `npm run build && npx wrangler deploy` run locally. If CI auto-deploy is needed later, connect via Workers & Pages → Git integration and set `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in dashboard env vars.

---

## Phase 8 — End-to-End Verification ✅ DONE (2026-05-23)

All checks verified against `https://drive-mate.marcinjaro95.workers.dev`:

- ✅ **SPA loads** — HTTP 200, `<title>DriveMate</title>`, Angular bundle served
- ✅ **SPA routing** — `/nonexistent-route` returns HTTP 200 with `index.html` (Angular router handles it)
- ✅ **Proxy non-streaming** — `POST /api/ai` returns valid OpenRouter JSON (`choices[0].message.content = "ok"`)
- ✅ **Proxy streaming** — `POST /api/ai` with `"stream":true` returns SSE chunks (`data: {...}` lines)
- ⬜ **Rollback** — not tested; available via Workers → drive-mate → Deployments → Rollback in dashboard

---

## Dependency Order

```
Phase 0 (prerequisites) ✅ DONE
  └── Phase 1 (wrangler install + auth) ✅ DONE
        ├── Phase 2 (wrangler.toml) ✅ DONE
        ├── Phase 3 (environment files, angular.json) ✅ DONE
        └── Phase 4 (functions/worker.ts) ✅ DONE
              └── Phase 5 (wrangler deploy — Worker live) ✅ DONE
                    ├── Phase 6 (OPENROUTER_API_KEY secret) ✅ DONE
                    ├── Phase 7 (Git auto-deploy) ⬜ SKIPPED (optional)
                    └── Phase 8 (end-to-end verification) ✅ DONE
```
