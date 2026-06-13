---
project: DriveMate
researched_at: 2026-05-23
recommended_platform: Cloudflare Workers + Pages
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Angular 21 (static SPA)
  runtime: Browser + Cloudflare Workers (AI proxy)
  database: Supabase (external, PostgreSQL + RLS)
  ai_gateway: OpenRouter (external)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

The Angular SPA is served as static files from Cloudflare Pages (free, unlimited bandwidth, automatic CDN). The OpenRouter API proxy — the only server-side component — runs as a Cloudflare Pages Function (a Worker co-located in the same Pages project), keeping the entire deployment to a single `wrangler pages deploy` command. At 10k–100k monthly requests this stack costs $0. The user already has Cloudflare familiarity, Wrangler CLI covers the full operational loop, and Cloudflare publishes the most complete agent-readable documentation of any evaluated platform (`llms.txt`, per-product scoped URLs, markdown content negotiation on every page). All five agent-friendly criteria pass.

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

- **Preview deploys**: Every push to a non-main branch automatically generates a `<hash>.drive-mate.pages.dev` preview URL. Preview deployments use separate secret bindings configured in the Cloudflare dashboard under the Pages project's "Preview" environment. Branch protection (e.g. Cloudflare Access) can be applied to preview URLs if needed.
- **Secrets**: OpenRouter API key is stored as a Workers Secret (`wrangler secret put OPENROUTER_API_KEY`). Must be set separately for Production and Preview environments via the dashboard. GitHub Actions CI uses `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as repository secrets — never embed them in `wrangler.toml`.
- **Rollback**: `wrangler rollback [version-id]` for Workers (defaults to the previous version, completes in seconds). Pages deployments can be rolled back to any prior successful build via the dashboard "Rollback" button. Supabase DB migrations do not roll back automatically — data migrations must be considered separately.
- **Approval**: Agent may trigger production deploys via `wrangler pages deploy` unattended after the Pages project exists. Rotating the OpenRouter secret (`wrangler secret put`) or deleting the Pages project requires human action. Supabase table drops and RLS policy changes always require human review.
- **Logs**: `wrangler tail` streams Worker request logs in real time (JSON output). `wrangler pages deployment tail` streams Pages Functions logs. Both support `--format json` for structured output. Log history (beyond the real-time buffer) requires a configured log drain or Cloudflare Logpush (paid feature).

---

## Risk Register

| Risk                                                                               | Source           | Likelihood | Impact | Mitigation                                                                                                          |
| ---------------------------------------------------------------------------------- | ---------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| Agent uses deprecated `wrangler pages publish` instead of `wrangler pages deploy`  | Research finding | H          | M      | Pin in AGENTS.md: always use `wrangler pages deploy dist/drive-mate/browser`. Document in CI workflow comment.      |
| Angular output path misconfigured (`dist/drive-mate` vs `dist/drive-mate/browser`) | Research finding | H          | H      | Hardcode the full path in every deploy command and the Pages dashboard; never use a glob or short path.             |
| OpenRouter completions exceed 6 MB Workers response body limit                     | Unknown unknowns | M          | H      | Implement the proxy as a streaming passthrough (`TransformStream`) from day one — do not buffer the full response.  |
| Worker routes to user edge, not Supabase region, adding 150–200ms latency          | Unknown unknowns | H          | M      | Add `[placement]\nmode = "smart"` to `wrangler.toml` before first production deploy.                                |
| OpenRouter SDK uses Node.js APIs unavailable in Workers runtime                    | Devil's advocate | M          | H      | Verify SDK Web Platform compatibility before integrating; fall back to raw `fetch` + OpenRouter REST API if needed. |
| Wrangler major version breaks CI authentication in GitHub Actions                  | Pre-mortem       | M          | M      | Pin Wrangler version in `package.json` devDependencies (e.g. `"wrangler": "^3.x"`) — do not use `@latest` in CI.    |
| First CI run fails because Pages project doesn't exist yet                         | Unknown unknowns | H          | M      | Run `wrangler pages deploy dist/drive-mate/browser --project-name=drive-mate` manually once before enabling CI.     |
| SPA/proxy version skew if proxy is a separate Worker deployed independently        | Unknown unknowns | M          | M      | Use Pages Functions (`functions/` directory inside the Pages project) so SPA and proxy deploy atomically.           |

---

## Getting Started

1. **Install Wrangler:** add `"wrangler": "^3"` to `devDependencies` in `package.json` and run `npm install`. Use the local binary (`npx wrangler`) rather than a global install to ensure version pinning across environments.
2. **Authenticate:** `npx wrangler login` — opens a browser to authorize your Cloudflare account.
3. **Create the Pages project (once):** build the app (`npm run build`) then run `npx wrangler pages deploy dist/drive-mate/browser --project-name=drive-mate`. This creates the project on the dashboard and completes the first production deploy.
4. **Add the Pages Function proxy:** create a `functions/api/ai.ts` file in the repo root (Cloudflare Pages Functions directory). The function receives the Angular SPA's fetch requests and forwards them to OpenRouter using `fetch()`. The `functions/` directory deploys automatically with the next `wrangler pages deploy`.
5. **Set secrets:** `npx wrangler secret put OPENROUTER_API_KEY` — enter the key when prompted. Repeat for the Preview environment via the dashboard if needed.
6. **Enable Smart Placement:** add `[placement]\nmode = "smart"` to `wrangler.toml` to route the proxy Worker nearest to Supabase (Frankfurt) rather than to the user's edge node.
7. **Wire up GitHub Actions CI:** set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets; add a deploy step: `npx wrangler pages deploy dist/drive-mate/browser --project-name=drive-mate --branch=main`.

---

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup beyond the deploy step
- Production-scale architecture (multi-region, HA, DR)
