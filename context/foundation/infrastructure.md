---
project: DriveMate
researched_at: 2026-05-23
last_updated: 2026-06-21
recommended_platform: Cloudflare Workers + Pages
actual_platform: Cloudflare Workers (Static Assets)
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Angular 21 (static SPA)
  runtime: Browser + Cloudflare Workers (AI proxy + VIN proxy)
  database: Supabase (external, PostgreSQL + RLS)
  ai_gateway: OpenRouter (external)
  vin_api: AutoRef EU (primary), NHTSA (fallback)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

The Angular SPA is served as static files from Cloudflare Pages (free, unlimited bandwidth, automatic CDN). The OpenRouter API proxy — the only server-side component — runs as a Cloudflare Pages Function (a Worker co-located in the same Pages project), keeping the entire deployment to a single `wrangler pages deploy` command. At 10k–100k monthly requests this stack costs $0. The user already has Cloudflare familiarity, Wrangler CLI covers the full operational loop, and Cloudflare publishes the most complete agent-readable documentation of any evaluated platform (`llms.txt`, per-product scoped URLs, markdown content negotiation on every page). All five agent-friendly criteria pass.

### Actual Implementation (as of 2026-06-21)

The project uses **Workers Static Assets** instead of Cloudflare Pages. `wrangler.toml` sets `main = "functions/worker.ts"` with an `[assets]` binding pointing to `dist/drive-mate/browser`. The Worker (`functions/worker.ts`) serves the SPA and handles two API routes: `POST /api/ai` (OpenRouter streaming proxy) and `POST /api/vin` (AutoRef EU → NHTSA fallback VIN lookup). Deploy command: `npx wrangler deploy`. Production URL: `https://drive-mate.marcinjaro95.workers.dev`.

Key differences from the Pages recommendation:

- No automatic per-branch preview URLs (Pages feature only).
- SPA and proxy deploy atomically in a single `wrangler deploy` (equivalent to the Pages Function atomic deploy).
- Rollback via `wrangler rollback` (Workers versioning), not the Pages dashboard.
- No CI deploy step yet — must be added (see Getting Started).

Wrangler is pinned at `^4.94.0` in `devDependencies`.

---

## Platform Comparison

### Scoring Matrix

| Platform                       | CLI-first | Managed / Serverless | Agent-readable docs | Stable deploy API | MCP / Integration   | Total     |
| ------------------------------ | --------- | -------------------- | ------------------- | ----------------- | ------------------- | --------- |
| **Cloudflare Workers + Pages** | Pass      | Pass                 | Pass                | Pass              | Pass                | **5 / 5** |
| Vercel                         | Pass      | Pass                 | Pass                | Pass              | Partial (beta)      | 4½ / 5    |
| Netlify                        | Partial   | Pass                 | Pass                | Pass              | Pass (GA)           | 4½ / 5    |
| Railway                        | Partial   | Partial              | Pass                | Pass              | Partial (beta)      | 3½ / 5    |
| Render                         | Partial   | Pass                 | Partial             | Partial           | Pass (GA)           | 3½ / 5    |
| Fly.io                         | Pass      | Partial              | Partial             | Pass              | Fail (experimental) | 3 / 5     |

Soft-weight adjustments applied: Cloudflare familiarity (Q3) breaks the tie with Vercel/Netlify. No persistent-connection requirement (Q1) keeps all platforms in scope. Single-region preference (Q4) and external Supabase + OpenRouter (Q5) are neutral across all candidates.

---

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

5/5 criteria pass. Pages hosts the Angular SPA on a global CDN at $0 with unlimited bandwidth. Workers (or Pages Functions) run the OpenRouter proxy at the edge with a free tier of 100k requests/day (~3M/month). Wrangler CLI covers deploy, rollback (`wrangler rollback`), and log tailing (`wrangler tail`) in one tool. Documentation is available as `llms.txt`, per-product scoped markdown, and content-negotiated markdown on every docs page — best-in-class for agent consumption. The GA `mcp-server-cloudflare` package exposes 2,500+ Cloudflare API endpoints to MCP clients. User already has hands-on Cloudflare experience; no ramp-up.

#### 2. Vercel

4½/5. Deploy and rollback are fully CLI-driven (`vercel --prod`, `vercel rollback`). `llms.txt` and `llms-full.txt` are published. Angular SPA deploy is zero-config except for one required `vercel.json` SPA rewrite rule (`/* → /index.html`). Hobby tier is free at this traffic volume. The Vercel MCP server (`mcp.vercel.com`) is in **Public Beta** — functional but not GA. No user familiarity advantage. Scores identically to Netlify but MCP maturity gap favours Vercel for now (Vercel's overall tool surface is larger).

#### 3. Netlify

4½/5. GA MCP server (`netlify-mcp`) is the strongest MCP story of the three shortlisted platforms. `llms.txt` is published; `netlify logs` command added May 2026. CLI rollback is **not available** — rollback requires the dashboard or API. Function timeout is **10 seconds** by default (26s on paid), which an OpenRouter AI completion can exceed; requires careful timeout handling. Credit-based pricing (300 credits/month hard cap on Free) can **suspend all sites** for the rest of the billing cycle if exceeded — meaningful risk for an active development loop. Personal plan ($9/month) is the safe minimum for production.

---

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. **Deprecated CLI command is everywhere.** `wrangler pages publish` (removed in Wrangler v4) dominates tutorials, StackOverflow answers, and AI training data. An agent generating a CI workflow without explicit guidance will reach for the wrong command. Correct command: `wrangler pages deploy`.
2. **Angular output path trap.** Angular 17+ outputs to `dist/drive-mate/browser`. Cloudflare's own dashboard default and many guides still reference `dist/drive-mate`. Wrong path = successful deploy, blank page, no error.
3. **10ms CPU-time limit on the free Workers tier.** The proxy is mostly I/O wait (correct), but any synchronous JSON transformation that accumulates past 10ms CPU per invocation fails silently on the free tier. Invisible in `wrangler dev` (wall-clock only).
4. **Workers ≠ Node.js.** The OpenRouter JS SDK may rely on Node.js `http`/`https` modules that don't exist in the Workers runtime. Must verify SDK Web Platform compatibility before integrating, or fall back to raw `fetch`.
5. **Three overlapping deployment patterns.** Workers Static Assets, Pages Functions, and a separate Worker proxy each have different `wrangler.toml` shapes and compose differently. Picking the wrong one early means a mid-project refactor.

### Pre-Mortem — How This Could Fail

The DriveMate deploy launched cleanly: Pages served the Angular SPA instantly, the Worker proxy forwarded OpenRouter completions correctly in testing. Problems accumulated in production.

Six weeks in, maintenance schedule generation began returning truncated responses for high-mileage vehicles. Root cause: Cloudflare Workers enforce a 6 MB response body limit; verbose AI completions from OpenRouter were silently cut at that boundary. Fixing this required switching from buffered proxy to streaming (`ReadableStream` / `TransformStream`) — a non-trivial refactor, discovered through community forums rather than official docs.

Three months in, Supabase latency spiked without explanation. The Worker was routing to US edge nodes despite Polish users — Cloudflare places Workers nearest the _user_, not the _origin_. Supabase was in eu-central-1. Enabling Smart Placement (`[placement] mode = "smart"` in `wrangler.toml`) fixed it after two weeks of confused performance investigation.

Four months in, a Wrangler major version bump changed the CI authentication token format. The pipeline broke silently on the next deploy; recovery took two days. Cloudflare's platform ships fast — CLI commands and auth flows change underneath you.

### Unknown Unknowns

1. **6 MB response body limit.** OpenRouter completions for detailed maintenance schedules can exceed this. Streaming must be designed in from the start — retrofitting is painful.
2. **Smart Placement must be explicitly enabled.** Without it, the Worker runs nearest the user's edge, adding 150–200ms round-trip latency to Supabase (Frankfurt). One line in `wrangler.toml` fixes it; the risk is not knowing it's needed.
3. **Pages project must exist before CI can deploy.** The first deploy must run manually (`wrangler pages deploy --project-name=drive-mate`) to create the project. CI will fail until this one-time step is done.
4. **Supabase Realtime won't work from a standard Worker.** `fetch`-based Supabase queries work in Workers; WebSocket Realtime subscriptions require Durable Objects. The app doesn't need Realtime now — but this is a meaningful constraint if the roadmap ever adds it.
5. **Using Pages Functions instead of a separate Worker eliminates the split-deploy risk.** If the proxy is a Pages Function (inside `functions/` in the Pages project), it deploys atomically with the SPA — one command, one deployment. A separate standalone Worker requires two deploy commands in CI and risks frontend/backend version skew.

---

## Operational Story

- **Preview deploys**: Workers Static Assets does not provide automatic per-branch preview URLs. To test a branch, deploy manually with `npx wrangler deploy --env preview` (requires a `[env.preview]` block in `wrangler.toml`) or run locally with `npx wrangler dev`.
- **Secrets**: `OPENROUTER_API_KEY` and `AUTOREF_API_KEY` are stored as Workers Secrets (`wrangler secret put <NAME>`). GitHub Actions CI uses `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as repository secrets — never embed them in `wrangler.toml`.
- **Rollback**: `wrangler rollback [version-id]` rolls back to any prior Worker version (defaults to the previous deploy, completes in seconds). Supabase DB migrations do not roll back automatically — data migrations require manual intervention.
- **Approval**: Agent may trigger production deploys via `npx wrangler deploy` unattended. Rotating a secret (`wrangler secret put`) or deleting the Worker requires human action. Supabase table drops and RLS policy changes always require human review.
- **Logs**: `wrangler tail` streams Worker request logs in real time (`--format json` for structured output). Log history beyond the real-time buffer requires a configured Cloudflare Logpush destination (paid feature).

---

## Risk Register

| Risk                                                                               | Source           | Likelihood | Impact | Status / Mitigation                                                                                                                   |
| ---------------------------------------------------------------------------------- | ---------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Agent uses `wrangler pages deploy` (Pages command) instead of `wrangler deploy`    | Actual deviation | H          | M      | **Mitigated**: project uses Workers Static Assets; correct command is `npx wrangler deploy`.                                          |
| Angular output path misconfigured (`dist/drive-mate` vs `dist/drive-mate/browser`) | Research finding | H          | H      | **Mitigated**: `wrangler.toml` hardcodes `dist/drive-mate/browser` in `[assets] directory`.                                           |
| OpenRouter completions exceed 6 MB Workers response body limit                     | Unknown unknowns | M          | H      | **Mitigated**: `handleAI` streams via `upstream.body` (ReadableStream passthrough), no buffering.                                     |
| Worker routes to user edge, not Supabase region, adding 150–200ms latency          | Unknown unknowns | H          | M      | **Mitigated**: `[placement] mode = "smart"` is set in `wrangler.toml`.                                                                |
| OpenRouter SDK uses Node.js APIs unavailable in Workers runtime                    | Devil's advocate | M          | H      | **Mitigated**: proxy uses raw `fetch` + OpenRouter REST API directly, no SDK.                                                         |
| Wrangler major version breaks CI authentication                                    | Pre-mortem       | M          | M      | **Mitigated**: pinned at `"wrangler": "^4.94.0"` in `devDependencies`; do not use `@latest` in CI.                                    |
| No deploy step in CI — production deploy is manual                                 | Actual gap       | H          | M      | **Open**: `.github/workflows/ci.yml` has no deploy job. Must add `npx wrangler deploy` step with `CLOUDFLARE_API_TOKEN` secret.       |
| CORS `ALLOWED_ORIGINS` hardcoded to `workers.dev` domain                           | Actual gap       | L          | M      | **Open**: if custom domain is added, `functions/worker.ts:2` must be updated to include the new origin.                               |
| AutoRef API key missing or expired silently fails VIN lookup                       | Operational      | M          | M      | `handleVin` returns `500` when `AUTOREF_API_KEY` is unset; NHTSA fallback activates on AutoRef `null` result — not on 5xx from proxy. |

---

## Getting Started

_This section reflects the Workers Static Assets setup that is actually in use._

1. **Install Wrangler:** already in `devDependencies` as `"wrangler": "^4.94.0"`. Use the local binary (`npx wrangler`) — do not install globally.
2. **Authenticate:** `npx wrangler login` — opens a browser to authorize the Cloudflare account.
3. **Local dev:** `npx wrangler dev` — serves the Worker + SPA locally, reads secrets from `.dev.vars` (not committed).
4. **Deploy (once manually, then via CI):** `npm run build && npx wrangler deploy` — builds the Angular SPA and deploys the Worker with static assets. The Worker name (`drive-mate`) is set in `wrangler.toml`.
5. **Set secrets:** `npx wrangler secret put OPENROUTER_API_KEY` and `npx wrangler secret put AUTOREF_API_KEY` — enter each key when prompted.
6. **Wire up GitHub Actions CI (pending):** add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets, then add a deploy job to `.github/workflows/ci.yml`:
   ```yaml
   deploy:
     if: github.ref == 'refs/heads/master'
     needs: test
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: actions/setup-node@v4
         with: { node-version: '22', cache: 'npm' }
       - run: npm ci
       - run: npm run build
       - run: npx wrangler deploy
         env:
           CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
           CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
   ```

---

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup beyond the deploy step
- Production-scale architecture (multi-region, HA, DR)
