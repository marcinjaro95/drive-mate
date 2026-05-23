# DriveMate — Cloudflare Workers Deployment Plan

## Context

DriveMate is an Angular 21 SPA skeleton (zero features implemented) that needs its full Cloudflare infrastructure wired up. The platform decision is finalized in `context/foundation/infrastructure.md`. This plan executes that decision: Angular SPA + OpenRouter AI proxy served by a single **Cloudflare Worker** with static asset binding (Workers Static Assets), Smart Placement for Supabase latency, and Cloudflare native Git integration for auto-deploy on push.

**Architecture:** One Worker (`functions/worker.ts`) handles all requests. `/api/ai` is the OpenRouter streaming proxy; everything else is served from the `[assets]` binding (`dist/drive-mate/browser`), with `not_found_handling = "single-page-application"` for Angular SPA routing.

**Deployed URL:** `https://drive-mate.workers.dev` (custom domain addable later)

**Current state (2026-05-23):**
- ✅ Wrangler v4 installed
- ✅ `wrangler login` completed (account: `1045124760937fe73c7eaa433bffe98d`)
- ✅ `wrangler.toml` — Workers config with `[assets]` + Smart Placement
- ✅ `functions/worker.ts` — OpenRouter proxy + asset passthrough
- ✅ `functions/tsconfig.json` — Workers-scoped tsconfig
- ✅ `.gitignore` — `.env`, `.dev.vars` added
- ✅ `src/index.html` — title fixed to `DriveMate`
- ✅ `src/environments/environment.ts` — Supabase dev config filled
- ✅ `src/environments/environment.prod.ts` — Supabase prod config filled
- ✅ `angular.json` — `fileReplacements` added to production config
- ✅ `.dev.vars` — local wrangler secret placeholder (gitignored)
- ✅ `npm run build` passes locally
- ⬜ Cloudflare Workers project created in dashboard (Phase 5)
- ⬜ `OPENROUTER_API_KEY` secret set (Phase 6)
- ⬜ Git integration wired + auto-deploy verified (Phase 7)
- ⬜ End-to-end verification (Phase 8)

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

## Phase 5 — Create Workers Project via Cloudflare Dashboard ⚠️ HUMAN GATE

**Steps (all in Cloudflare dashboard):**

1. **Workers & Pages → Create application → Worker**
   - (NOT Pages — this is a Worker with static assets)
2. **Connect to Git** → authorize GitHub → select `drive-mate` repository
3. **Build settings:**
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Build output directory:** *(leave blank — wrangler reads `wrangler.toml`)*
4. **Environment variables — add for both Production and Preview:**
   - `CLOUDFLARE_API_TOKEN` = a scoped Cloudflare API token (needed for `wrangler deploy` to authenticate in CI)
   - `CLOUDFLARE_ACCOUNT_ID` = `1045124760937fe73c7eaa433bffe98d`

**How to create `CLOUDFLARE_API_TOKEN`:**
- Cloudflare Dashboard → **My Profile → API Tokens → Create Token**
- Use template **"Edit Cloudflare Workers"** — grants Workers Script + Account read
- Copy the token immediately (shown once)

**What this does:** On every push to `master`, Cloudflare runs `npm run build` (produces `dist/drive-mate/browser/`) then `npx wrangler deploy` (uploads Worker script + assets to Cloudflare's edge). The site is served at `https://drive-mate.workers.dev`.

**Verify:**
- Build completes without errors in the dashboard
- Visit `https://drive-mate.workers.dev` — Angular app loads

---

## Phase 6 — Secrets

### OpenRouter API key (runtime secret, never committed)
```powershell
npx wrangler secret put OPENROUTER_API_KEY
# Interactive prompt — paste key, Enter
```

**Verify:** `npx wrangler secret list` — `OPENROUTER_API_KEY` appears (value never shown).

Then test the live proxy:
```powershell
curl -X POST https://drive-mate.workers.dev/api/ai `
  -H "Content-Type: application/json" `
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Respond with: ok"}]}'
```

### Supabase vars (build-time, baked into JS bundle)
These are already in `src/environments/environment.prod.ts` (committed). No additional steps needed — they're compiled into the bundle at build time.

---

## Phase 7 — Verify Git Integration Auto-Deploy

- [ ] Push a trivial commit to `master` → dashboard shows a new production deployment triggered automatically
- [ ] Open a feature branch + push → preview deployment created
- [ ] Confirm build log shows `npm run build` then `npx wrangler deploy` ran successfully
- [ ] Confirm `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are present in both Production and Preview environments

---

## Phase 8 — End-to-End Verification

- [ ] **SPA loads** — `https://drive-mate.workers.dev` — Angular app renders, no 404 for JS/CSS assets
- [ ] **SPA routing** — `https://drive-mate.workers.dev/nonexistent` → Angular router handles it (not a Cloudflare 404); `not_found_handling = "single-page-application"` ensures `index.html` is returned
- [ ] **Proxy non-streaming** — `curl -X POST https://drive-mate.workers.dev/api/ai -H "Content-Type: application/json" -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"say ok"}]}'` → valid JSON response
- [ ] **Proxy streaming** — same but add `"stream":true` and `curl -N` → SSE chunks arrive progressively
- [ ] **Rollback** — Workers → drive-mate → Deployments → pick previous → Rollback

---

## Dependency Order

```
Phase 0 (prerequisites) ✅ DONE
  └── Phase 1 (wrangler install + auth) ✅ DONE
        ├── Phase 2 (wrangler.toml) ✅ DONE
        ├── Phase 3 (environment files, angular.json) ✅ DONE
        └── Phase 4 (functions/worker.ts) ✅ DONE
              └── Phase 5 (Cloudflare dashboard: create Worker, connect GitHub) ⚠️ HUMAN GATE
                    ├── Phase 6 (secrets via wrangler CLI)
                    └── Phase 7 (verify Git integration auto-deploy)
                          └── Phase 8 (end-to-end verification)
```
