# Auth Scaffold Implementation Plan

## Overview

Implement end-to-end authentication for DriveMate so every app route is gated behind a Supabase email+password flow. The change installs the Supabase client library, builds a signals-based `AuthService`, wires an `authGuard` onto all protected routes, and delivers Angular Material login/signup forms with inline error handling.

## Current State Analysis

The project is a minimal Angular 21 standalone bootstrap with an empty route table and no authentication infrastructure. The Supabase project URL and anon key are already in both environment files, but `@supabase/supabase-js` is not installed and no `createClient` call exists anywhere in the codebase. Angular Material is also absent. The root `App` component renders placeholder content with a `RouterOutlet` — ready to host an auth-gated route tree.

## Desired End State

An unauthenticated visitor landing on any URL is redirected to `/login`. After successful login or sign-up they land on `/dashboard` (a placeholder for now). The `AuthService` exposes reactive signals (`currentUser`, `isAuthenticated`, `isLoading`) that downstream features will read to scope their Supabase queries to the authenticated user. A `SupabaseService` singleton holds the initialized client and is the single point of Supabase client instantiation in the app.

### Key Discoveries:

- `src/environments/environment.ts` already contains `supabaseUrl` and `supabaseAnonKey` — no new env wiring needed (`src/environments/environment.ts:1-5`)
- `src/app/app.config.ts` provides `provideRouter(routes)` and `provideBrowserGlobalErrorListeners()` — `provideAnimationsAsync()` (required by Angular Material) slots in here (`src/app/app.config.ts:1-11`)
- `src/app/app.routes.ts` is currently empty — the full route tree is defined here from scratch (`src/app/app.routes.ts:1-3`)
- `src/app/app.html` renders Angular welcome content with a `RouterOutlet` — it will be reduced to just `<router-outlet />` in Phase 3
- No existing Angular Material dependency; it must be added via `ng add` which also installs the prebuilt theme into `angular.json`

## What We're NOT Doing

- No OAuth (Google or other) — email+password only for MVP
- No email confirmation flow — Supabase email confirmation must be disabled in the project dashboard before testing
- No `/account` or profile management page
- No reverse auth guard (logged-in users visiting `/login` are not redirected away — acceptable for MVP)
- No remember-me, password reset, or magic-link flows
- No integration or e2e tests for the auth UI — unit tests cover `AuthService` only

## Implementation Approach

Four sequential phases: install dependencies and create the Supabase client singleton, build the `AuthService` and `authGuard` with the route tree, create the Angular Material UI components, then write `AuthService` unit tests. Each phase is independently verifiable.

## Critical Implementation Details

**Auth state initialization race.** Supabase's `auth.getSession()` is always asynchronous — the initial session cannot be resolved synchronously on app boot. The `AuthService` exposes a public `initialized: Promise<void>` that resolves once `getSession()` completes and the `currentUser` signal is set. The `authGuard` must `await auth.initialized` before checking `isAuthenticated()` to avoid incorrectly redirecting authenticated users who refresh the page. This is the only place `await` appears in the guard — treat it as load-bearing.

**`onAuthStateChange` is the exclusive updater of `currentUser`.** After initialization, Supabase fires the listener on every session change (sign-in, sign-out, token refresh). The `currentUser` signal must be updated exclusively from this listener so all downstream consumers stay in sync automatically. `signIn`, `signUp`, and `signOut` do not set the signal directly — they call the Supabase auth method and let the listener do the update.

---

## Phase 1: Dependencies & Supabase Client

### Overview

Install the two missing packages (`@supabase/supabase-js` and Angular Material), create a single `SupabaseService` that owns the initialized Supabase client, and wire `provideAnimationsAsync()` into `app.config.ts`.

### Changes Required:

#### 1. Install packages

**File**: project root (terminal commands, not a source file)

**Intent**: Add `@supabase/supabase-js` to `package.json` dependencies, and add Angular Material (including `@angular/cdk`) with its prebuilt theme wired into `angular.json`.

**Contract**: Run `npm install @supabase/supabase-js`, then run `ng add @angular/material` — select the `indigo-pink` prebuilt theme, enable global typography, and use async animations. The `ng add` schematic updates `angular.json` (adds theme CSS to `styles`), `src/index.html` (font preconnect links), and may add `provideAnimationsAsync()` to `app.config.ts`. Verify after running.

#### 2. `src/app/core/supabase.service.ts` (new file)

**Intent**: Provide a single, injectable Supabase client instance so every service gets the same initialized client without calling `createClient` in multiple places.

**Contract**: `@Injectable({ providedIn: 'root' })` class with a single property `client: SupabaseClient` initialized from `environment.supabaseUrl` and `environment.supabaseAnonKey`.

#### 3. `src/app/app.config.ts` (modify)

**Intent**: Add `provideAnimationsAsync()` to the providers array so Angular Material components can use animations.

**Contract**: Import `provideAnimationsAsync` from `@angular/platform-browser/animations/async` and add it to the `providers` array. If the `ng add` schematic already added it, skip this step.

### Success Criteria:

#### Automated Verification:

- `npm run build` completes with no TypeScript errors
- `@supabase/supabase-js` appears in `package.json` dependencies
- `@angular/material` and `@angular/cdk` appear in `package.json` dependencies
- A prebuilt Material theme CSS entry is listed in the `styles` array of `angular.json`

#### Manual Verification:

- `npm start` runs without console errors
- App still renders (no blank screen from broken provider wiring)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: AuthService + Auth Guard

### Overview

Build the reactive authentication layer: a signals-based `AuthService` that bridges Supabase's callback-based session events to Angular signals, a functional `authGuard` that awaits auth initialization before deciding on access, and a route tree that gates the app shell behind that guard.

### Changes Required:

#### 1. `src/app/core/auth/auth.service.ts` (new file)

**Intent**: Centralize all Supabase auth operations and expose reactive session state as Angular signals so any component or guard can read the current user without subscribing to observables or calling Supabase directly.

**Contract**: `@Injectable({ providedIn: 'root' })` class that injects `SupabaseService` and exposes:
- `currentUser: Signal<User | null>` — writable signal, updated only by `onAuthStateChange`
- `isAuthenticated: Signal<boolean>` — computed from `currentUser`
- `isLoading: Signal<boolean>` — true until the first `getSession()` call resolves
- `initialized: Promise<void>` — resolves when `getSession()` completes and `isLoading` is set to false

Constructor calls `getSession()` once to hydrate initial state, then registers `onAuthStateChange` to keep `currentUser` updated on all subsequent events. Methods:
- `signIn(email: string, password: string): Promise<AuthError | null>` — calls `signInWithPassword`; returns the error or null
- `signUp(email: string, password: string): Promise<AuthError | null>` — calls `supabase.auth.signUp`; returns the error or null
- `signOut(): Promise<void>` — calls `supabase.auth.signOut`

None of the three methods update `currentUser` directly — the `onAuthStateChange` listener is the exclusive updater.

#### 2. `src/app/core/auth/auth.guard.ts` (new file)

**Intent**: Protect all routes under the authenticated shell by awaiting `AuthService.initialized` before checking session state, so page-refresh scenarios don't incorrectly redirect authenticated users.

**Contract**: A `CanActivateFn` named `authGuard`. Injects `AuthService` and `Router`, awaits `auth.initialized`, then returns `true` if `auth.isAuthenticated()` or `router.createUrlTree(['/login'])` otherwise.

#### 3. `src/app/app.routes.ts` (replace)

**Intent**: Define the full route tree — public auth routes and a protected shell that covers all future feature routes.

**Contract**:
```
/login         → LoginComponent         (public, no guard)
/signup        → SignupComponent        (public, no guard)
/ (root)       → protected shell        (canActivate: [authGuard])
  /dashboard   → DashboardComponent
  / (empty)    → redirectTo 'dashboard', pathMatch: 'full'
```
`LoginComponent`, `SignupComponent`, and `DashboardComponent` are the components created in Phase 3. Forward-reference them here; imports will be added in Phase 3.5.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes with no TypeScript errors

#### Manual Verification:

- Visiting `http://localhost:4200/` while unauthenticated redirects to `/login`
- Visiting `http://localhost:4200/dashboard` while unauthenticated redirects to `/login`
- No console errors on redirect

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Auth UI Components

### Overview

Build the login and signup Angular Material forms, a placeholder dashboard with a sign-out button, and reduce the app root template to a bare `<router-outlet>`.

### Changes Required:

#### 1. `src/app/app.html` (replace)

**Intent**: The root template currently renders Angular welcome content. It must become a bare router outlet so auth and app views own their own layout entirely.

**Contract**: Replace entire file content with `<router-outlet />`.

#### 2. `src/app/auth/login/login.ts` + `login.html` + `login.scss` (new files)

**Intent**: A standalone login form that calls `AuthService.signIn()` with the user's email and password, navigates to `/dashboard` on success, and displays Supabase error messages inline below the submit button.

**Contract**: Standalone `LoginComponent` (selector `app-login`). Imports: `ReactiveFormsModule`, `MatFormFieldModule`, `MatInputModule`, `MatButtonModule`, `RouterModule` (for a link to `/signup`). Template has two `mat-form-field` controls (`email`, `password`), a submit `mat-raised-button`, and a `<p>` error paragraph bound to a local `errorMessage = signal<string | null>(null)` — visible only when non-null. On submit: if `signIn()` returns an error, set `errorMessage` to `error.message`; if it returns null, `router.navigate(['/dashboard'])`.

#### 3. `src/app/auth/signup/signup.ts` + `signup.html` + `signup.scss` (new files)

**Intent**: A standalone sign-up form following the same pattern as login, calling `AuthService.signUp()` and navigating to `/dashboard` on success.

**Contract**: Standalone `SignupComponent` (selector `app-signup`). Same Material imports as login plus a link to `/login`. Identical error-display pattern with `errorMessage = signal<string | null>(null)`. On submit calls `authService.signUp(email, password)`.

#### 4. `src/app/dashboard/dashboard.ts` + `dashboard.html` (new files)

**Intent**: A minimal placeholder for the authenticated app shell. Must exist as a real routable component so the guard and post-login redirect work end-to-end; it will be extended in future changes.

**Contract**: Standalone `DashboardComponent` (selector `app-dashboard`). Template renders a heading and a sign-out button that calls `authService.signOut()` then navigates to `/login`.

#### 5. `src/app/app.routes.ts` (update imports)

**Intent**: Add the component imports for the three components created in steps 2–4 so the forward references added in Phase 2 resolve at compile time.

**Contract**: Import `LoginComponent`, `SignupComponent`, and `DashboardComponent` into the routes file. No route structure changes.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes with no TypeScript errors or template errors

#### Manual Verification:

- Visiting `/login` renders the Angular Material login form with email + password fields
- Visiting `/signup` renders the signup form with a link back to login
- Submitting the login form with an incorrect password displays an inline error below the submit button; no navigation occurs
- Submitting valid credentials logs the user in and navigates to `/dashboard`
- Clicking sign-out on the dashboard returns to `/login`
- Visiting `/dashboard` while unauthenticated redirects to `/login`
- Refreshing the page while signed in keeps the user on `/dashboard` (not redirected to `/login`)
- UI is usable on a 375 px wide viewport with no horizontal scroll

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 4: AuthService Unit Tests

### Overview

Write Vitest unit tests for `AuthService` that verify signal state transitions using a mocked `SupabaseService`, covering initialization, sign-in success/failure, sign-up success/failure, and sign-out.

### Changes Required:

#### 1. `src/app/core/auth/auth.service.spec.ts` (new file)

**Intent**: Verify that `AuthService` correctly maps Supabase auth outcomes to Angular signal state, using a mock `SupabaseService` so tests are fast, isolated, and network-free.

**Contract**: Vitest spec using Angular `TestBed`. Provides `AuthService` and a mock `SupabaseService` whose `client.auth` methods return controlled Promises and expose a controllable `onAuthStateChange` callback. Tests cover:

- **Initial state**: `isLoading()` is true before `getSession()` resolves; `isAuthenticated()` is false
- **Initialization with session**: after `getSession()` resolves with a session, `currentUser()` is the session user, `isAuthenticated()` is true, `isLoading()` is false, `initialized` promise has resolved
- **Initialization without session**: after `getSession()` resolves with null, `currentUser()` is null, `isAuthenticated()` is false
- **`signIn` success**: `onAuthStateChange` fires with a session → `currentUser()` is updated; `signIn()` returns null
- **`signIn` failure**: Supabase returns an `AuthError` → `signIn()` returns the error; `currentUser()` remains null
- **`signUp` success**: same pattern as signIn success
- **`signOut`**: `onAuthStateChange` fires with null session → `currentUser()` becomes null

### Success Criteria:

#### Automated Verification:

- `npm test` runs all specs and every case in `auth.service.spec.ts` passes
- `npm run build` passes (no TypeScript errors in the spec file)

#### Manual Verification:

- Test output shows all `AuthService` spec cases as green with no skipped tests

---

## Testing Strategy

### Unit Tests:

- `AuthService` signal transitions — see Phase 4
- Key edge cases: `isLoading` before/after initialization; `signIn` success and error paths; `signOut` clearing `currentUser`

### Integration Tests:

- None in this change — end-to-end auth flow is verified manually in Phase 3

### Manual Testing Steps:

1. Open the app at `localhost:4200` while signed out — confirm redirect to `/login`
2. Submit the login form with an incorrect password — confirm inline error appears, no navigation
3. Submit valid credentials (a test account created via Supabase dashboard) — confirm navigation to `/dashboard`
4. Click sign-out — confirm return to `/login`
5. Navigate directly to `/dashboard` while signed out — confirm redirect to `/login`
6. Sign in, then refresh the page — confirm the user stays on `/dashboard` (not redirected)
7. Resize viewport to 375 px — confirm no horizontal scrollbar on login and signup screens

## Performance Considerations

None specific to this change — auth is a one-time initialization path, not a hot rendering path.

## References

- PRD access control spec: `context/foundation/prd.md` (Access Control section)
- Tech stack rationale: `context/foundation/tech-stack.md`
- Supabase environment config: `src/environments/environment.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dependencies & Supabase Client

#### Automated

- [x] 1.1 `npm run build` passes with no TypeScript errors
- [x] 1.2 `@supabase/supabase-js` appears in `package.json` dependencies
- [x] 1.3 `@angular/material` and `@angular/cdk` appear in `package.json` dependencies
- [x] 1.4 A prebuilt Material theme CSS entry is listed in `angular.json` styles

#### Manual

- [ ] 1.5 `npm start` runs without console errors
- [ ] 1.6 App still renders with no blank screen

### Phase 2: AuthService + Auth Guard

#### Automated

- [ ] 2.1 `npm run build` passes with no TypeScript errors

#### Manual

- [ ] 2.2 Visiting `/` while unauthenticated redirects to `/login`
- [ ] 2.3 Visiting `/dashboard` while unauthenticated redirects to `/login`
- [ ] 2.4 No console errors on redirect

### Phase 3: Auth UI Components

#### Automated

- [ ] 3.1 `npm run build` passes with no TypeScript errors or template errors

#### Manual

- [ ] 3.2 `/login` renders Angular Material login form with email + password fields
- [ ] 3.3 `/signup` renders Angular Material signup form with a link to login
- [ ] 3.4 Invalid password shows inline error below submit button; no navigation
- [ ] 3.5 Valid credentials log in and navigate to `/dashboard`
- [ ] 3.6 Sign-out returns to `/login`
- [ ] 3.7 Unauthenticated access to `/dashboard` redirects to `/login`
- [ ] 3.8 Page refresh while signed in keeps user on `/dashboard`
- [ ] 3.9 UI is usable at 375 px viewport with no horizontal scroll

### Phase 4: AuthService Unit Tests

#### Automated

- [ ] 4.1 `npm test` passes with all `auth.service.spec.ts` cases green
- [ ] 4.2 `npm run build` passes with no TypeScript errors in the spec file

#### Manual

- [ ] 4.3 Test output shows all AuthService spec cases green with no skipped tests
