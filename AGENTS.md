# Repository Guidelines

DriveMate is an Angular 21 SPA for car maintenance tracking with AI-generated service schedules. Stack: Angular 21 standalone components, Supabase (auth + PostgreSQL + RLS), Cloudflare Pages, GitHub Actions CI.

## Hard Rules

- **Data isolation is non-negotiable.** Every Supabase query must apply Row Level Security. One user must never be able to read or enumerate another user's car or service records.
- **AI schedule items must cite a source.** Never render a maintenance item without a traceable origin (manufacturer schedule or a user service record). Hallucinated intervals without attribution must not reach the UI.
- **Do not write to `context/archive/`.** That directory is immutable. Use `context/changes/` for any work-in-progress artifacts.
- **`ng generate` skips test files by default** (`skipTests: true` across all schematics in `angular.json`). Write Vitest specs manually when needed.

## Project Structure

- `src/app/` — app root: `app.ts`, `app.html`, `app.scss`, `app.config.ts`, `app.routes.ts`
- `src/main.ts` — bootstrap entry; `src/styles.scss` — global SCSS
- `public/` — static assets for Cloudflare Pages
- `context/` — 10x workflow artifacts; `context/archive/` is read-only

Full PRD: `@context/foundation/prd.md`. Stack rationale: `@context/foundation/tech-stack.md`.

## Commands

- `npm start` — dev server at `localhost:4200` (auto-reloads)
- `npm run build` — production build to `dist/`
- `npm test` — Vitest unit tests via Angular CLI
- `npm run watch` — dev build with watch mode

## Coding Style & Naming

- 2-space indent, single quotes, 100-char line width; Prettier enforces all three (`@package.json`).
- TypeScript strict mode, `noImplicitOverride`, and Angular strict templates are on (`@tsconfig.json`).
- Selector prefix: `app-`.
- File naming: `<feature>.ts` / `<feature>.html` / `<feature>.scss` — no `.component.` infix. See `@src/app/app.ts` as the reference shape for signals-based state.

## Testing

Framework: Vitest via Angular CLI. Specs are not auto-generated (schematics set `skipTests: true`). Write spec files manually alongside the unit under test. Run: `npm test`.

## Commit & PR Guidelines

No convention established in git history yet. Document the agreed format here once set. CI auto-deploys to Cloudflare Pages on merge.

## Architecture Notes

- FR-005 (AI schedule): the Anthropic API call must route through a server-side proxy (Cloudflare Worker or Supabase Edge Function) — the SPA cannot hold an API key.
- FR-001/FR-004 (VIN lookup): the EU/Polish-market VIN API is unresolved — see Open Question 1 in `@context/foundation/prd.md` before starting this work.
