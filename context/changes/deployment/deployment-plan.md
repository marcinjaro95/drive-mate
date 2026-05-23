# DriveMate — Cloudflare Pages Deployment Plan

## Context

DriveMate is an Angular 21 SPA skeleton (zero features implemented) that needs its full Cloudflare Pages infrastructure wired up. The platform decision is finalized in `context/foundation/infrastructure.md`. This plan executes that decision: static SPA on Pages, OpenRouter AI proxy as a Pages Function (streaming), Smart Placement for Supabase latency, and GitHub Actions CI for auto-deploy on merge.

**Current state:** No wrangler, no wrangler.toml, no functions/, no CI, no environment files, `index.html` title is still `BootstrapScaffoldTemp`.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `package.json` | add `"wrangler": "^3"` to devDependencies |
| `wrangler.toml` | create — Pages config + Smart Placement |
| `.gitignore` | add `.env`, `.dev.vars` entries |
| `src/index.html` | fix title `BootstrapScaffoldTemp` → `DriveMate` |
| `src/environments/environment.ts` | create — dev Supabase config |
| `src/environments/environment.prod.ts` | create — prod Supabase config |
| `angular.json` | add `fileReplacements` to production build config |
| `.env` (never commit) | create — local dev Supabase vars |
| `.dev.vars` (never commit) | create — local wrangler dev OpenRouter key |
| `functions/tsconfig.json` | create — Workers types scope, separate from app tsconfig |
| `functions/api/ai.ts` | create — streaming OpenRouter proxy |
| ~~`.github/workflows/deploy.yml`~~ | **not needed** — using Cloudflare native Git integration |

---

## Phase 0 — Prerequisites

Everything that must be in place before Phase 1 begins. These are one-time setup steps, not repeated per deploy.

### 0.1 — Local tooling

| Tool | Minimum version | Check | Install if missing |
|---|---|---|---|
| Node.js | 22 LTS | `node --version` | [nodejs.org](https://nodejs.org) — use LTS |
| npm | 10+ | `npm --version` | Bundled with Node.js |
| Angular CLI | 21 | `npx ng version` | Already in devDependencies — no global install needed |
| Git | any | `git --version` | Git for Windows |

**Node version note:** Cloudflare's build infra default may differ from your local Node. Add `NODE_VERSION=22` to the Cloudflare dashboard environment variables (Phase 5) to pin it. Your local version and Cloudflare's build version must match to avoid lockfile/build discrepancies.

**Windows path note:** Run all commands in PowerShell from `E:\My projects\drive-mate`. The `npx` commands use the project-local `node_modules/.bin/` — no global wrangler needed.

### 0.2 — Cloudflare account

- [ ] **Account exists** — create at [dash.cloudflare.com](https://dash.cloudflare.com) if not already
- [ ] **Free plan** is sufficient for MVP (100k requests/day Workers free tier, unlimited Pages bandwidth)
- [ ] **Account ID** — find it in the Cloudflare dashboard right sidebar on any zone page, or via `npx wrangler whoami` after Phase 1 auth. Save it — needed for wrangler secret commands.
- [ ] **Zone not required** — Pages deploys to `*.pages.dev` subdomain for free; a custom domain (e.g. `drive-mate.pl`) can be added later via the dashboard

### 0.3 — Supabase project setup ⚠️ Human Gate

Supabase is an external service. The project must exist before the environment values can be filled into the Angular environment files (Phase 3).

**Steps:**
1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose organization, set project name (e.g. `drive-mate`), set a strong database password, select region **Central EU (Frankfurt)** — matches the `eu-central-1` Supabase region that Smart Placement targets
3. Wait for the project to provision (~2 minutes)
4. Go to **Project Settings → API**:
  - Copy **Project URL** → this is `VITE_SUPABASE_URL` (format: `https://<ref>.supabase.co`)
  - Copy **anon (public)** key → this is `VITE_SUPABASE_ANON_KEY`
  - **Do NOT use the `service_role` key** in the frontend or anywhere in the SPA — it bypasses RLS

**Why Frankfurt?** The Cloudflare Pages proxy uses Smart Placement to route nearest to the database origin. Selecting Frankfurt (eu-central-1) keeps the Worker-to-Supabase round-trip under 10ms instead of 150–200ms if the Worker lands on a US edge node.

**RLS note:** Supabase tables created in this project must have Row Level Security enabled before the app goes live. This is a hard rule from AGENTS.md — don't skip it even during prototyping.

### 0.4 — OpenRouter account

- [ ] Account exists at [openrouter.ai](https://openrouter.ai)
- [ ] API key created (format: `sk-or-v1-...`)
- [ ] **Keep the key** — it goes into Cloudflare Pages secrets in Phase 6, never into any committed file

### 0.5 — GitHub repository

- [ ] Repository exists at GitHub (public or private)
- [ ] `main` branch exists and has the current codebase committed
- [ ] `package-lock.json` is committed (it is — not in `.gitignore`)

**Verify all prerequisites before Phase 1:**
```powershell
node --version   # must be 22.x
git --version
```

---

## Phase 1 — Wrangler Install & Auth
- [ ] Add `"wrangler": "^3"` to `devDependencies` in `package.json` and run `npm install`
  - Pin to `^3` (NOT `^4` — v4 removed `wrangler pages publish` and introduced breaking auth changes)
  - Use local `npx wrangler`, not global install, so CI and dev use the same version
- [ ] `npx wrangler login` — opens browser OAuth flow; writes token to `~/.wrangler/config/default.toml`
- [ ] `npx wrangler whoami` — verify auth; **copy the account ID**, needed for Phase 7

**Edge case:** If the OAuth callback is blocked (corporate proxy / WSL2), use `npx wrangler login --browser` for manual URL copy. Run from PowerShell (not WSL) since the project is on a Windows path `E:\`.

---

## Phase 2 — Core Config Files

### `wrangler.toml` (create at repo root)
```toml
name = "drive-mate"
pages_build_output_dir = "dist/drive-mate/browser"
compatibility_date = "2026-05-23"

[placement]
mode = "smart"
```

- `pages_build_output_dir` is the Pages-specific key (not `main` or `[build]` — those are for Workers)
- `compatibility_date` pins the Workers runtime — required for Pages Functions
- `[placement] mode = "smart"` routes the proxy Worker nearest to Supabase (Frankfurt), cutting latency by ~150ms. **Takes up to 15 minutes** to analyze after deploy; needs traffic from multiple regions before it kicks in.
- **Never** add `account_id`, `OPENROUTER_API_KEY`, or any secrets here

**Verify:** `npx wrangler pages project list` — should succeed (no `drive-mate` yet, that's fine)

### `.gitignore` additions
```
.env
.env.local
.env.*.local
.dev.vars
```

### `src/index.html`
- Change `<title>BootstrapScaffoldTemp</title>` → `<title>DriveMate</title>`

---

## Phase 3 — Angular Environment Files

Angular 21 with `@angular/build:application` uses `fileReplacements` to swap env files between build configs. The Supabase anon key is public-safe by design (RLS enforces access control); it's fine to commit it in environment files.

### `src/environments/environment.ts` (development)
```typescript
export const environment = {
  production: false,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
};
```

### `src/environments/environment.prod.ts` (production)
```typescript
export const environment = {
  production: true,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
};
```

> **Developer gate:** Fill in real Supabase values after creating the Supabase project. These are the same values for both files during MVP; they diverge once separate staging/prod Supabase projects are created.

### `angular.json` — add `fileReplacements` to production config
In the `"production"` configuration block under `architect.build.configurations`, add:
```json
"fileReplacements": [
  {
    "replace": "src/environments/environment.ts",
    "with": "src/environments/environment.prod.ts"
  }
]
```

### Local dev files (never commit)

`.env` — used by Angular dev server for any future VITE_ vars:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

`.dev.vars` — wrangler equivalent of `.env` for Pages Functions local dev:
```
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY_HERE
```

**Verify:** `npm run build` completes without errors.

---

## Phase 4 — Pages Function Proxy (`functions/api/ai.ts`)

### `functions/tsconfig.json`
Separate tsconfig scoped to the functions directory — keeps Workers types out of the Angular app's compilation unit (avoids `Request`/`Response` type conflicts with DOM).

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "noEmit": true
  },
  "include": ["./**/*.ts"]
}
```

After Phase 5 (first deploy), run `npx wrangler types --path=functions/worker-configuration.d.ts` to generate binding-aware types and add `"types": ["./worker-configuration.d.ts"]` to this tsconfig. This is Cloudflare's current recommended approach (preferred over installing `@cloudflare/workers-types` manually).

### `functions/api/ai.ts`

```typescript
interface Env {
  OPENROUTER_API_KEY: string;
}

const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestPost(
  context: { request: Request; env: Env },
): Promise<Response> {
  const { request, env } = context;

  if (!env.OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Raw fetch — NOT the OpenRouter SDK (which may use Node.js APIs unavailable in Workers runtime)
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://drive-mate.pages.dev',
      'X-Title': 'DriveMate',
    },
    body: JSON.stringify(body),
  });

  // Pass upstream.body directly — avoids buffering the full response in memory.
  // Workers have a 6 MB response body limit; AI completions for verbose maintenance
  // schedules can exceed this. Streaming passthrough bypasses the limit.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      ...CORS_HEADERS,
    },
  });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
```

**Why raw `fetch` not the SDK:** The OpenRouter JS SDK likely uses `node:http`/`node:https` which don't exist in the Workers runtime. Raw `fetch` always works (it's a Web Platform API).

**Why `upstream.body` passthrough:** Direct stream relay — no buffering, no 6 MB cap, SSE chunks pass through unmodified for streaming completions.

**Angular SPA calls this proxy at:** `/api/ai` (relative URL, no CORS issues)

**Edge cases:**
- `upstream.body` can be `null` for 204/304 responses. Guard: `upstream.body ?? new ReadableStream()`
- `functions/` must be at repo root (not `src/functions/`) — Cloudflare Pages only reads root-level `functions/`
- `onRequestPost` = only POST requests; `onRequestOptions` = CORS preflight only

**Local test:** `npm run build && npx wrangler pages dev dist/drive-mate/browser`
Then: `curl -X POST http://localhost:8788/api/ai -H "Content-Type: application/json" -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'`

---

## Phase 5 — Create Pages Project via Cloudflare Dashboard ⚠️ Human Gate

Using Cloudflare's native Git integration — Cloudflare watches the GitHub repo and auto-deploys on every push to `main`. No GitHub Actions workflow needed.

**Steps (all in Cloudflare dashboard):**

1. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Authorize GitHub (if not already) → select the `drive-mate` repository → click **Begin setup**
3. Configure build settings:
  - **Project name:** `drive-mate`
  - **Production branch:** `main`
  - **Framework preset:** None (Angular is not in the preset list — configure manually)
  - **Build command:** `npm run build`
  - **Build output directory:** `dist/drive-mate/browser`
  - **Root directory:** *(leave blank)*
4. Under **Environment Variables (advanced)** — add build-time variables:
  - `VITE_SUPABASE_URL` = `https://YOUR_PROJECT_REF.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = `YOUR_SUPABASE_ANON_KEY`
5. Click **Save and Deploy** — Cloudflare triggers the first build from the current `main` HEAD

**What this does:** Creates the `drive-mate` Pages project, runs `npm run build` on Cloudflare's build infra, serves the SPA at `https://drive-mate.pages.dev`. `wrangler.toml` (committed to the repo) is read by the build — including `pages_build_output_dir` and `[placement]`.

**Verify:**
- Build completes in the dashboard without errors
- Visit `https://drive-mate.pages.dev` — Angular app loads
- `npx wrangler pages project list` — `drive-mate` appears

**From this point on:** Every push to `main` triggers an automatic Cloudflare build and production deploy. Every PR branch gets a preview deployment at `https://<hash>.drive-mate.pages.dev`.

**Edge cases:**
- Build fails with "dist/drive-mate/browser not found" → `wrangler.toml` `pages_build_output_dir` is wrong or the repo doesn't have the build output dir committed (correct — `dist/` is in `.gitignore`, Cloudflare builds it fresh each time)
- Preview deployments fail because env vars are only set for Production → add the same vars under **Preview** environment in Pages > Settings > Environment Variables
- Node.js version mismatch → add `NODE_VERSION=22` environment variable in the dashboard build settings

---

## Phase 6 — Secrets

### OpenRouter API key (Cloudflare-side secret, runtime-injected)
```powershell
npx wrangler pages secret put OPENROUTER_API_KEY --project-name=drive-mate
# Interactive prompt — paste key, Enter
```

For Preview environment (PR preview deployments):
```powershell
npx wrangler pages secret put OPENROUTER_API_KEY --project-name=drive-mate --env preview
```

**Verify:** `npx wrangler pages secret list --project-name=drive-mate` — `OPENROUTER_API_KEY` must appear (value never shown).

Then make a live request:
```powershell
curl -X POST https://drive-mate.pages.dev/api/ai `
  -H "Content-Type: application/json" `
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Respond with: ok"}]}'
```

### Supabase vars (Cloudflare Pages build-time, NOT secrets)
In Cloudflare dashboard: Pages > drive-mate > Settings > Environment Variables > Production:
- `VITE_SUPABASE_URL` = `https://YOUR_PROJECT_REF.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `YOUR_SUPABASE_ANON_KEY`

These are build-time values baked into the JS bundle, not runtime secrets — add as plain variables (not encrypted secrets).

---

## Phase 7 — Verify Cloudflare Git Integration

Cloudflare's native Git integration handles all auto-deploy; no GitHub Actions workflow is needed. This phase confirms the integration is fully wired.

**Checklist:**

- [ ] Push a trivial commit to `main` → Cloudflare dashboard shows a new production deployment triggered automatically (no manual action)
- [ ] Open a feature branch + push → Cloudflare creates a preview deployment at `https://<hash>.drive-mate.pages.dev`
- [ ] Confirm the Cloudflare build log shows `npm run build` ran successfully
- [ ] Confirm environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are present in both Production and Preview environments in the dashboard (Pages > drive-mate > Settings > Environment Variables)
- [ ] Confirm `wrangler.toml` is being read: check that the deployed output matches `dist/drive-mate/browser` and that Smart Placement is active in Pages > drive-mate > Functions > Smart Placement

**Cloudflare build infrastructure notes:**
- Cloudflare uses its own Node.js version — add `NODE_VERSION=22` env var in dashboard settings if the default is too old
- Build minutes are free up to 500/month on the Free plan
- Builds run on Cloudflare's Linux infra; Windows-specific issues won't appear here

---

## Phase 8 — End-to-End Verification

- [ ] **SPA loads** — visit `https://drive-mate.pages.dev`, Angular app renders, no 404 for JS/CSS assets
- [ ] **SPA routing** — navigate to `https://drive-mate.pages.dev/nonexistent` → Angular router handles it (not a Cloudflare 404). Cloudflare Pages serves `index.html` as fallback automatically.
- [ ] **Proxy non-streaming** — `curl -X POST https://drive-mate.pages.dev/api/ai -H "Content-Type: application/json" -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"say ok"}]}'` → valid JSON response
- [ ] **Proxy streaming** — same but add `"stream":true` and `curl -N` flag → SSE chunks arrive progressively (not all at once)
- [ ] **Preview deployment** — open a PR → CI workflow completes → preview URL posted to PR (via GitHub Deployments)
- [ ] **Rollback drill** — Cloudflare dashboard > Pages > drive-mate > Deployments > pick previous > Rollback (completes in ~5 seconds)
- [ ] **Smart Placement (deferred)** — after sustained multi-region traffic, `npx wrangler tail --project-name=drive-mate --format json` → `coloCode` should be `FRA` (Frankfurt) not a US PoP. Takes up to 15 minutes; skip this check on first deploy.

---

## Artifact Persistence

The approved plan is saved as a project artifact at `context/changes/deployment/deployment-plan.md` (WIP area per AGENTS.md). This is the first thing executed after plan approval, before any tooling or config changes. It serves as the audit trail for "what was supposed to happen" if the live run goes sideways, and is consumed downstream by milestone-planning skills as ground truth for "what's already deployed".

---

## Dependency Order

```
Phase 0 (prerequisites: Node.js, Cloudflare account, Supabase project, OpenRouter key) ⚠️ HUMAN GATE
  └── Phase 1 (wrangler install + auth)
        ├── Phase 2 (wrangler.toml, .gitignore, index.html) ─── parallel
        └── Phase 3 (environment files, angular.json) ────────── parallel with Phase 2
              └── Phase 4 (functions/api/ai.ts)
                    └── Phase 5 (Cloudflare dashboard: connect GitHub repo) ⚠️ HUMAN GATE
                          ├── Phase 6 (secrets via wrangler CLI + dashboard)
                          └── Phase 7 (verify Git integration auto-deploy)
                                └── Phase 8 (verification)
```

Phases 2 and 3 can be written simultaneously. Phase 5 is the hard gate where local setup ends and Cloudflare account configuration begins (dashboard, no CLI needed for the deploy itself).
