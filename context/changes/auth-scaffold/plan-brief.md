# Auth Scaffold — Plan Brief

> Full plan: `context/changes/auth-scaffold/plan.md`

## What & Why

DriveMate's PRD requires all routes to be gated behind authentication and mandates that one user can never see another's data. Before any feature work can begin, the app needs a working auth layer. This change wires Supabase email+password authentication end-to-end: install the client library, reactive auth state, protected routing, and Material login/signup forms.

## Starting Point

The project is a minimal Angular 21 standalone bootstrap with empty routes and no auth infrastructure. Supabase credentials are already in both environment files, but `@supabase/supabase-js` is not installed and `createClient` is never called anywhere in the codebase.

## Desired End State

An unauthenticated visitor is redirected to `/login` regardless of which URL they access. After signing in or signing up they land on `/dashboard`. The `AuthService` exposes `currentUser`, `isAuthenticated`, and `isLoading` as Angular signals, giving every future feature a reactive, testable handle on session state. Email confirmation is disabled in Supabase for MVP; the full confirmation flow is a later change.

## Key Decisions Made

| Decision           | Choice                                       | Why (1 sentence)                                                                    |
| ------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Auth methods       | Email+password only                          | Unblocks all downstream work now; OAuth is a follow-up change                       |
| Scope              | Sign-in / sign-up / sign-out only            | Profile/account management belongs with FR-003 (car delete / GDPR)                  |
| Auth state         | Signals-based `AuthService`                  | Matches the signals-first pattern already in `app.ts`; avoids RxJS on the auth path |
| Auth UI            | Custom Angular components + Angular Material | Full style control; no external auth-UI library dependency                          |
| Post-auth redirect | `/dashboard` always                          | Simple and predictable; intended-URL tracking is out of MVP scope                   |
| Error display      | Inline below submit button                   | Zero extra infrastructure; standard accessible form UX                              |
| Email confirmation | Disable in Supabase dashboard                | Removes an entire UI state and callback route from MVP scope                        |
| Testing            | `AuthService` unit tests only                | Covers the riskiest state-transition logic; UI forms verified manually              |

## Scope

**In scope:**

- Install `@supabase/supabase-js` + Angular Material
- `SupabaseService` singleton (typed Supabase client)
- `AuthService` with signals and `signIn` / `signUp` / `signOut`
- Functional `authGuard` with page-refresh safety (`initialized` Promise)
- Route tree: public `/login`, `/signup`; protected `/dashboard` shell
- Angular Material login + signup forms with inline error display
- Placeholder `DashboardComponent` with sign-out action
- Vitest unit tests for `AuthService`

**Out of scope:**

- OAuth (Google or other)
- Email confirmation callback route
- Password reset / magic-link
- Account/profile management page
- Reverse auth guard (logged-in users on `/login` are not redirected away)
- Integration or e2e tests

## Architecture / Approach

`SupabaseService` (root singleton) holds the `SupabaseClient` instance initialized from environment variables. `AuthService` (root singleton) injects it, calls `getSession()` once on construction to hydrate state, and registers `onAuthStateChange` as the exclusive updater of the `currentUser` signal. The `authGuard` awaits `AuthService.initialized` (a Promise that resolves after `getSession()` completes) before checking `isAuthenticated()` — this prevents incorrect redirects on page refresh. The three UI components (`LoginComponent`, `SignupComponent`, `DashboardComponent`) inject `AuthService` and call its methods; Supabase errors are rendered inline.

## Phases at a Glance

| Phase                             | What it delivers                                                   | Key risk                                                                              |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1. Dependencies & Supabase client | Packages installed, `SupabaseService` created, animations wired    | `ng add @angular/material` is interactive — must be run manually with correct choices |
| 2. AuthService + auth guard       | Reactive session signals, route protection, full route tree        | Auth init race on page refresh (mitigated by `initialized` Promise)                   |
| 3. Auth UI components             | Working login/signup forms, dashboard placeholder, end-to-end flow | Angular Material import paths — verify against installed version                      |
| 4. AuthService unit tests         | `AuthService` signal transitions verified against mocked Supabase  | Mocking `onAuthStateChange` (callback-based) in Vitest requires a controllable fake   |

**Prerequisites:** "Confirm email" must be disabled in the Supabase project's Authentication settings before Phase 3 manual testing.
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- Supabase email confirmation is assumed disabled in the dashboard; if left on, sign-up won't produce a session and the `/dashboard` redirect will silently fail
- Angular Material v19+ schematic in Angular 21 is assumed to wire `provideAnimationsAsync()` automatically; if not, Phase 1 includes a manual fallback

## Success Criteria (Summary)

- An unauthenticated visitor hitting any URL lands on `/login`
- A user can sign up, sign in, and sign out using email+password with Angular Material forms
- Refreshing the page while logged in keeps the user on `/dashboard` (not redirected to `/login`)
