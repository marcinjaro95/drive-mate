# Car Add + AI Schedule Implementation Plan

## Overview

S-01 from the DriveMate roadmap: user fills in car details (make, model, year, engine capacity, fuel type, optional mileage) → car is saved → user lands directly on the AI-generated maintenance schedule. Schedule is generated via OpenRouter (Gemini Flash 2.0) through the existing Cloudflare Worker proxy, persisted as JSONB on the `vehicles` row, and rendered with hard source-attribution enforcement.

## Current State Analysis

F-01 (auth) and F-02 (data schema + RLS) are complete. The codebase has:
- `VehicleService` with full CRUD, throw-on-error pattern (`src/app/core/vehicles/vehicle.service.ts`)
- `Vehicle` and `ServiceRecord` TypeScript models (`src/app/core/models/`)
- Cloudflare Worker at `functions/worker.ts` proxying `POST /api/ai` to OpenRouter — transparent passthrough, no Worker changes needed
- Dashboard shell at `src/app/dashboard/dashboard.ts` — shows only a sign-out button today
- Route tree: `/login`, `/signup`, `/dashboard` — no child routes exist

**What does not exist yet:**
- `ai_schedule` JSONB column on the `vehicles` table
- `ScheduleItem` TypeScript interface
- `AiScheduleService` (prompt building, parsing, filtering, persistence)
- Vehicle list, add form, or schedule view components
- Child routes under `/dashboard`

## Desired End State

After this plan:
- User navigates to `/dashboard` → sees their vehicle list (empty state with CTA if none)
- User clicks "Add your car" → fills the form → lands directly on `/dashboard/vehicles/:id` where the schedule loads
- Schedule is generated once and cached as JSONB; future visits load instantly from the DB
- Every rendered maintenance item shows a non-empty source citation; items missing `source` are silently dropped before render

### Key Discoveries

- `functions/worker.ts:34` — Worker transparently proxies the request body to OpenRouter; `AiScheduleService` constructs the full OpenRouter-compatible body (model + messages + response_format); no Worker changes needed
- `src/app/core/vehicles/vehicle.service.ts:34` — `createVehicle`'s payload type must explicitly exclude `ai_schedule`; the form never sets it, and the schedule is always written post-creation via `updateVehicle`
- `supabase/migrations/20260604000002_fix_updated_at_search_path.sql` — latest migration; new migration must use a later timestamp and not redefine existing objects
- `src/app/core/models/vehicle.model.ts:15` — `NewVehicle` derives from `Vehicle`; adding `ai_schedule` to `Vehicle` automatically flows into `VehicleUpdate` (used for the persist call), which is the desired behaviour

## What We're NOT Doing

- VIN lookup or auto-fill (S-03, blocked pending EU VIN API validation)
- Marking service done / schedule recalculation (S-02)
- Car deletion (S-04)
- User-triggered schedule regeneration when a valid schedule already exists (deferred to S-02)
- Streaming AI response (SSE) — one-shot fetch is sufficient for Gemini Flash 2.0
- Component-level Vitest specs — service + parsing logic specs only (no component test setup)
- Editing existing vehicles

## Implementation Approach

Five sequential phases. Phases 1–2 are purely data and service layer; phases 3–5 add UI. Each phase has a verification gate before the next begins.

1. Extend the DB schema and TypeScript types for `ai_schedule`
2. Build `AiScheduleService` with Vitest specs
3. Refactor dashboard into a layout shell with child routes and `VehicleListComponent`
4. Build `VehicleAddComponent` (car-add form)
5. Build `ScheduleViewComponent` (schedule rendering with skeleton, error, retry)

## Critical Implementation Details

**`createVehicle` payload exclusion**: `ai_schedule` will appear in `NewVehicle` (derived from `Vehicle`) once Phase 1 adds the field. The create payload must explicitly exclude it — update `createVehicle`'s parameter type to `Omit<NewVehicle, 'user_id' | 'ai_schedule'>` in Phase 1 or the form will get a TypeScript error.

**Two-level parse for the AI response**: The `/api/ai` endpoint returns an OpenAI Chat Completions envelope. The schedule JSON is a _string_ embedded inside `choices[0].message.content` — it must be `JSON.parse()`d _after_ the outer HTTP response JSON is decoded. The `response_format: { type: 'json_object' }` field in the request body instructs Gemini Flash to return valid JSON; the required top-level key is `"items"`.

**Source attribution filter is the only render gate**: An item reaches the UI only if `typeof item.source === 'string' && item.source.trim().length > 0`. This guard lives in `AiScheduleService` (tested by spec) and the Angular template trusts the pre-filtered array unconditionally.

---

## Phase 1: DB Migration + TypeScript Types

### Overview

Add `ai_schedule JSONB` to the `vehicles` table and extend the TypeScript models to include it. No UI changes. Establishes the type contract that all later phases depend on.

### Changes Required

#### 1. New migration

**File**: `supabase/migrations/20260607000000_add_ai_schedule_column.sql`

**Intent**: Add a nullable JSONB column to `vehicles` for storing persisted AI schedules.

**Contract**:
```sql
ALTER TABLE vehicles ADD COLUMN ai_schedule jsonb DEFAULT NULL;
```
No new RLS policy needed — the existing `vehicles_select` / `vehicles_update` policies already scope this column to `auth.uid()`.

#### 2. New model file

**File**: `src/app/core/models/schedule-item.model.ts`

**Intent**: Define the canonical shape of a single maintenance item as produced by the AI and stored in `ai_schedule`.

**Contract**: Export `Urgency` union type (`'overdue' | 'due_soon' | 'upcoming'`) and `ScheduleItem` interface with fields: `item: string`, `interval_km: number | null`, `next_due_km: number | null`, `next_due_date: string | null`, `urgency: Urgency`, `source: string`.

#### 3. Update Vehicle model

**File**: `src/app/core/models/vehicle.model.ts`

**Intent**: Extend the `Vehicle` interface to carry the persisted AI schedule field.

**Contract**: Add `import type { ScheduleItem } from './schedule-item.model'` at the top; add `ai_schedule: ScheduleItem[] | null` to the `Vehicle` interface after `current_mileage`. The `NewVehicle` and `VehicleUpdate` type aliases derive from `Vehicle` automatically — no changes to those lines needed.

#### 4. Update VehicleService createVehicle signature

**File**: `src/app/core/vehicles/vehicle.service.ts`

**Intent**: Prevent the form from accidentally passing `ai_schedule` in the create payload — the schedule is always written post-creation via `updateVehicle`.

**Contract**: Change `createVehicle`'s parameter type from `Omit<NewVehicle, 'user_id'>` to `Omit<NewVehicle, 'user_id' | 'ai_schedule'>` at line 34.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db reset` (local) or `supabase migration up`
- Type-check passes: `npx tsc --noEmit`
- Existing tests still pass: `npm test`

#### Manual Verification

- `ai_schedule` column visible in Supabase Studio table editor as nullable JSONB with default NULL
- No TypeScript errors reported by the IDE on `vehicle.model.ts` or `vehicle.service.ts`

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: AiScheduleService

### Overview

Core AI integration layer. Builds the OpenRouter-compatible request body, calls `/api/ai`, decodes the two-level response, enforces the source-attribution guardrail, persists the result via `VehicleService.updateVehicle`, and returns the filtered item list. Fully covered by Vitest specs before any UI work begins.

### Changes Required

#### 1. AiScheduleService

**File**: `src/app/core/ai-schedule/ai-schedule.service.ts`

**Intent**: Encapsulate the full AI schedule flow — prompt construction, HTTP call, response parsing, source filter, and DB persistence — behind a single public method.

**Contract**: `@Injectable({ providedIn: 'root' })` class. Inject `VehicleService`. Public `generateAndSave(vehicle: Vehicle): Promise<ScheduleItem[]>` method; private `buildPrompt(vehicle: Vehicle): string`. Follows the throw-on-error pattern (per `lessons.md`). The prompt asks the model for a JSON object `{ "items": [...] }` where each item has all `ScheduleItem` fields; it includes a one-item worked example to anchor the format and explicitly states that every item must have a non-empty `source`. After filtering, call `vehicleService.updateVehicle(vehicle.id, { ai_schedule: filtered })` to persist.

```typescript
// Two-level parse — the content field is a JSON string, not an object:
const httpRes = await fetch('/api/ai', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-2.0-flash-001',
    messages: [{ role: 'user', content: this.buildPrompt(vehicle) }],
    response_format: { type: 'json_object' },
  }),
});
if (!httpRes.ok) throw new Error(`AI proxy error: ${httpRes.status}`);
const envelope = await httpRes.json();
const parsed: { items: ScheduleItem[] } = JSON.parse(envelope.choices[0].message.content);
const filtered = parsed.items.filter(i => typeof i.source === 'string' && i.source.trim().length > 0);
await this.vehicleService.updateVehicle(vehicle.id, { ai_schedule: filtered });
return filtered;
```

#### 2. AiScheduleService spec

**File**: `src/app/core/ai-schedule/ai-schedule.service.spec.ts`

**Intent**: Verify the four critical paths and the prompt contract.

**Contract**: Use `vi.stubGlobal('fetch', vi.fn())` to mock the global fetch. Cover:
- Valid OpenRouter response → returns correctly typed filtered `ScheduleItem[]`
- Items where `source` is an empty string or missing are excluded from the return value
- `choices[0].message.content` is not valid JSON → method throws
- `fetch` returns a 500 status → method throws with the status code in the message
- `buildPrompt` output contains the vehicle's make, model, year, and fuel_type

### Success Criteria

#### Automated Verification

- `npm test` passes (all `AiScheduleService` specs green)
- `npx tsc --noEmit` passes

**Implementation Note**: Pause here after all specs pass before proceeding to Phase 3. (No manual verification step — service has no UI yet.)

---

## Phase 3: Dashboard Shell + Routing + VehicleListComponent

### Overview

Refactor the dashboard into a persistent layout shell with `<router-outlet>`. Add three child routes under `/dashboard`. Build `VehicleListComponent` as the default child, showing an empty-state CTA when the user has no cars and cards for each existing car.

### Changes Required

#### 1. App routes

**File**: `src/app/app.routes.ts`

**Intent**: Make the dashboard route a parent with three lazy-loaded children.

**Contract**: Add a `children` array to the existing dashboard route entry:
- `{ path: '', loadComponent: () => import('./vehicles/vehicle-list/vehicle-list').then(m => m.VehicleListComponent), pathMatch: 'full' }`
- `{ path: 'vehicles/new', loadComponent: () => import('./vehicles/vehicle-add/vehicle-add').then(m => m.VehicleAddComponent) }`
- `{ path: 'vehicles/:id', loadComponent: () => import('./vehicles/schedule-view/schedule-view').then(m => m.ScheduleViewComponent) }`

Follow the identical `loadComponent` pattern used by `/login` and `/signup`.

#### 2. DashboardComponent

**File**: `src/app/dashboard/dashboard.ts`

**Intent**: Refactor dashboard from a content page into a persistent layout shell that hosts child route components.

**Contract**: Add `RouterOutlet` to the `imports` array; remove any vehicle-rendering logic (it moves to `VehicleListComponent`); keep `signOut()` unchanged.

#### 3. Dashboard template

**File**: `src/app/dashboard/dashboard.html`

**Intent**: Minimal shell layout — a persistent header and a router outlet for all child views.

**Contract**: A `<header>` element containing the app name and the sign-out `<button mat-button>`; a `<main>` element containing `<router-outlet />`. All previous vehicle list markup is removed; the header sign-out button is the only persistent element.

#### 4. VehicleListComponent

**File**: `src/app/vehicles/vehicle-list/vehicle-list.ts`

**Intent**: Load and display the user's vehicles; guide first-time users directly to the add form.

**Contract**: `@Component` standalone, selector `app-vehicle-list`. Inject `VehicleService` and `Router`. Signals: `vehicles = signal<Vehicle[]>([])`, `isLoading = signal(true)`, `error = signal<string | null>(null)`. On `ngOnInit`: call `vehicleService.getVehicles()`, set the result on `vehicles`, set `isLoading(false)` in finally, set `error` in catch. Methods: `addCar()` → `router.navigate(['/dashboard/vehicles/new'])`; `openVehicle(id: string)` → `router.navigate(['/dashboard/vehicles', id])`.

#### 5. VehicleList template

**File**: `src/app/vehicles/vehicle-list/vehicle-list.html`

**Intent**: Empty state with a single CTA for new users; card list for returning users.

**Contract**:
- `@if (isLoading())` → centered `<mat-progress-spinner>`
- `@else if (error())` → error message paragraph
- `@else if (vehicles().length === 0)` → empty-state block: `<p>No cars added yet.</p>` + `<button mat-raised-button color="primary" (click)="addCar()">Add your first car</button>`
- `@else` → `@for (v of vehicles(); track v.id)` → `<mat-card (click)="openVehicle(v.id)">` showing `{{v.year}} {{v.make}} {{v.model}}` as the card title; `{{v.engine_capacity}}L {{v.fuel_type}}` as subtitle; current mileage if non-null

Imports: `MatCardModule`, `MatButtonModule`, `MatProgressSpinnerModule`.

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` passes
- `npm test` passes (no regressions)

#### Manual Verification

- `/dashboard` (authenticated) shows the vehicle list component — empty state on a fresh account
- "Add your first car" button navigates to `/dashboard/vehicles/new` (may return a blank outlet until Phase 4)
- Browser back button from `/dashboard/vehicles/new` returns to `/dashboard`
- Sign-out button in the header still works from any child route

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Vehicle Add Form

### Overview

`VehicleAddComponent` — a six-field reactive form that saves the car and navigates directly to the schedule view. Mileage is optional; all other fields are required with validation.

### Changes Required

#### 1. VehicleAddComponent

**File**: `src/app/vehicles/vehicle-add/vehicle-add.ts`

**Intent**: Capture car specs via a validated reactive form, persist via `VehicleService.createVehicle`, then route to the new car's schedule view to trigger AI generation.

**Contract**: Inject `FormBuilder`, `VehicleService`, `Router`. Form group with:
- `make`: `Validators.required`
- `model`: `Validators.required`
- `year`: `Validators.required`, `Validators.min(1900)`, `Validators.max(2030)`
- `engine_capacity`: `Validators.required`, `Validators.min(0.1)`, `Validators.max(20)`
- `fuel_type`: `Validators.required`
- `current_mileage`: no required validator, `Validators.min(0)` only

Signals: `isSubmitting = signal(false)`, `error = signal<string | null>(null)`.

`onSubmit()`: guard `if (form.invalid) return`; set isSubmitting true; extract raw values; call `vehicleService.createVehicle({ make, model, year, engine_capacity, fuel_type, vin: null, current_mileage: current_mileage ?? null })`; on success navigate to `['/dashboard/vehicles', vehicle.id]`; on catch set error signal and clear isSubmitting.

#### 2. VehicleAdd template

**File**: `src/app/vehicles/vehicle-add/vehicle-add.html`

**Intent**: Material form UI with a fuel-type select and an optional mileage field; inline validation feedback.

**Contract**: `<form [formGroup]="form" (ngSubmit)="onSubmit()">` with:
- `<mat-form-field>` + `<input matInput type="text">` for make and model
- `<mat-form-field>` + `<input matInput type="number">` for year, engine_capacity, and current_mileage; engine_capacity label "Engine capacity (L)"; current_mileage label "Current mileage (km) — optional"
- `<mat-form-field>` + `<mat-select formControlName="fuel_type">` with `<mat-option>` for five values: `petrol` (Petrol), `diesel` (Diesel), `electric` (Electric), `hybrid` (Hybrid), `lpg` (LPG)
- `<mat-error>` inside each required field for inline validation feedback on touch
- `@if (error())` error message above the submit button
- `<button mat-raised-button color="primary" type="submit" [disabled]="isSubmitting()">Save car</button>`
- `<a routerLink="/dashboard">Cancel</a>`

Imports: `ReactiveFormsModule`, `MatFormFieldModule`, `MatInputModule`, `MatSelectModule`, `MatButtonModule`, `RouterModule`.

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` passes

#### Manual Verification

- Form at `/dashboard/vehicles/new` renders all six fields with correct labels
- Submitting with empty required fields shows inline validation errors
- `current_mileage` accepts blank (no error) and a positive integer (no error); shows validation error on a negative value
- `fuel_type` select shows exactly five options
- Valid submit creates the vehicle in DB (confirm in Supabase Studio) and navigates to `/dashboard/vehicles/<uuid>`
- Cancel link returns to `/dashboard`
- Newly added car appears in the vehicle list when navigating back

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Schedule View Component

### Overview

`ScheduleViewComponent` — the core value screen. Loads the vehicle, triggers AI generation if `ai_schedule` is null, shows skeleton cards during generation, renders filtered items with urgency badges and source citations, and handles errors with a retry button.

### Changes Required

#### 1. ScheduleViewComponent

**File**: `src/app/vehicles/schedule-view/schedule-view.ts`

**Intent**: Orchestrate the load-or-generate flow; maintain loading, generating, and error states throughout.

**Contract**: Inject `VehicleService`, `AiScheduleService`, `ActivatedRoute`, `Router`. Signals: `vehicle = signal<Vehicle | null>(null)`, `scheduleItems = signal<ScheduleItem[]>([])`, `isLoading = signal(true)`, `isGenerating = signal(false)`, `error = signal<string | null>(null)`.

`ngOnInit()`:
1. `const id = this.route.snapshot.params['id']`
2. `this.vehicle.set(await this.vehicleService.getVehicle(id))` — if result is null, `router.navigate(['/dashboard'])` and return
3. `this.isLoading.set(false)`
4. `if (this.vehicle()!.ai_schedule?.length) { this.scheduleItems.set(this.vehicle()!.ai_schedule!); return; }`
5. Otherwise call `this.generateSchedule()`

`generateSchedule()`: set `isGenerating(true)`, clear error; call `aiScheduleService.generateAndSave(vehicle()!)`; on success set `scheduleItems`; on catch set `error` to the caught message; in finally set `isGenerating(false)`.

`retry()` → calls `generateSchedule()`.

#### 2. ScheduleView template

**File**: `src/app/vehicles/schedule-view/schedule-view.html`

**Intent**: Vehicle header always visible; skeleton → items → error in the schedule body.

**Contract**:
- Vehicle header (`@if (!isLoading())`): `<h2>{{v.year}} {{v.make}} {{v.model}}</h2>` + `<p>{{v.engine_capacity}}L · {{v.fuel_type}}</p>`
- `@if (isLoading())` → `<mat-progress-spinner>` (loading the vehicle record)
- `@else` block:
  - `@if (isGenerating())` → `@for (_ of [1,2,3,4,5]; track $index)` → `<mat-card class="skeleton-card"><div class="skeleton-bar"></div><div class="skeleton-bar short"></div></mat-card>`
  - `@else if (error())` → `<mat-card class="error-card"><p>{{error()}}</p><button mat-raised-button (click)="retry()">Try again</button></mat-card>`
  - `@else if (scheduleItems().length === 0)` → `<mat-card><p>All schedule items were filtered because they lacked source attribution. Try regenerating.</p><button mat-raised-button (click)="retry()">Regenerate</button></mat-card>`
  - `@else` → `@for (item of scheduleItems(); track item.item)` → `<mat-card>` with: `<mat-card-title>{{item.item}}</mat-card-title>`; urgency `<mat-chip>` (colour via CSS class: `chip-overdue`, `chip-due-soon`, `chip-upcoming`); next due line (prefer `next_due_km` km, else `next_due_date`, else omit); `<small>Source: {{item.source}}</small>`
- Back link: `<a routerLink="/dashboard">← My cars</a>`

Imports: `MatCardModule`, `MatChipsModule`, `MatButtonModule`, `MatProgressSpinnerModule`, `RouterModule`.

#### 3. Schedule skeleton + urgency styles

**File**: `src/app/vehicles/schedule-view/schedule-view.scss`

**Intent**: Shimmer animation for skeleton placeholders; colour-coded urgency chip classes.

**Contract**: `.skeleton-bar` — `background: linear-gradient(90deg, #e0e0e0 25%, #f5f5f5 50%, #e0e0e0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; height: 14px; border-radius: 4px; margin-bottom: 8px;` with `.short { width: 60%; }`. `@keyframes shimmer { to { background-position: -200% 0; } }`. Urgency chip colours: `.chip-overdue { background-color: #f44336; color: #fff; }`, `.chip-due-soon { background-color: #ff9800; color: #fff; }`, `.chip-upcoming { background-color: #4caf50; color: #fff; }`.

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` passes
- `npm test` passes (no regressions)

#### Manual Verification

- Navigate to a vehicle with no `ai_schedule` (fresh add): skeleton cards appear while generating
- Schedule renders with ≥ 5 items, each with a non-empty source citation
- Each item shows: name, urgency chip (colour-coded), next-due info, source citation
- Items without a source do not appear in the list
- If all items are filtered, the "all filtered" warning card appears with a "Regenerate" button
- Simulating an AI error (DevTools Network → block `/api/ai`): error card appears with "Try again"
- Clicking "Try again" after restoring network generates and renders the schedule
- Navigate away (`/dashboard`) and back (`click car card`): schedule loads instantly from DB with no skeleton
- Vehicle header shows correct year, make, model, fuel type, engine capacity

**Implementation Note**: Pause here for final manual confirmation that the full S-01 loop (add car → generate schedule → view schedule → return and load cached) works end-to-end before closing this change.

---

## Testing Strategy

### Unit Tests

`src/app/core/ai-schedule/ai-schedule.service.spec.ts`:
- Valid OpenRouter response → returns correctly typed and filtered `ScheduleItem[]`
- Items where `source` is empty string or missing property are excluded
- `choices[0].message.content` is not valid JSON → method throws
- `fetch` returns non-2xx status → method throws with status in the message
- `buildPrompt` output contains the vehicle's make, model, year, engine_capacity, and fuel_type

### Integration Tests

None at this stage — full E2E testing is deferred; manual verification covers the integration path.

### Manual Testing Steps

1. Sign up as a new user (fresh account — no vehicles)
2. Confirm `/dashboard` shows the empty state with the "Add your first car" CTA
3. Click "Add your first car" → fill form (Toyota / Corolla / 2019 / 1.6 / Petrol / 45000) → click "Save car"
4. Confirm navigation to `/dashboard/vehicles/<uuid>`
5. Confirm skeleton cards appear (generation in progress)
6. Confirm schedule appears with ≥ 5 items, each with a non-empty source
7. Confirm urgency chips are colour-coded (red / amber / green)
8. Navigate to `/dashboard` → confirm car card appears with year/make/model
9. Click car card → confirm schedule loads instantly (no skeleton — cached from DB)
10. Sign out → sign back in → open the car → schedule still loads instantly
11. DevTools Network → block `/api/ai` → delete `ai_schedule` via Supabase Studio → refresh schedule page → confirm error card → unblock → "Try again" → confirm schedule generates

## Performance Considerations

Gemini Flash 2.0 target latency is 2–5 seconds for this prompt size. No latency NFR applies. The JSON array of 10–15 schedule items is approximately 2–4 KB — well under Cloudflare's 6 MB body limit (roadmap S-01 unknown risk). No streaming is needed. The JSONB column means `getVehicle()` always fetches the full schedule; at 2–4 KB per vehicle this is negligible.

## Migration Notes

No data migration required. The `ai_schedule` column defaults to NULL for all existing rows. `VehicleService.getVehicles()` and `getVehicle()` both use `select('*')`, which will include `ai_schedule` as `null` for existing vehicles automatically.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-002, FR-005, US-01)
- Worker proxy: `functions/worker.ts`
- Error contract lesson: `context/foundation/lessons.md`
- Existing service pattern: `src/app/core/vehicles/vehicle.service.ts`
- Migration convention: `supabase/migrations/20260604000002_fix_updated_at_search_path.sql`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB Migration + TypeScript Types

#### Automated

- [x] 1.1 Migration applies cleanly (npx supabase db reset) — b453c7f
- [x] 1.2 Type-check passes (npx tsc --noEmit) — b453c7f
- [x] 1.3 Existing tests still pass (npm test) — b453c7f

#### Manual

- [x] 1.4 ai_schedule column visible in Supabase Studio as nullable JSONB with default NULL — b453c7f
- [x] 1.5 No TypeScript errors on vehicle.model.ts or vehicle.service.ts — b453c7f

### Phase 2: AiScheduleService

#### Automated

- [x] 2.1 All AiScheduleService specs green (npm test) — 3c1fd51
- [x] 2.2 Type-check passes (npx tsc --noEmit) — 3c1fd51

### Phase 3: Dashboard Shell + Routing + VehicleListComponent

#### Automated

- [x] 3.1 Type-check passes (npx tsc --noEmit) — 3540404
- [x] 3.2 npm test passes with no regressions — 3540404

#### Manual

- [x] 3.3 /dashboard shows vehicle list component (empty state on fresh account) — 3540404
- [x] 3.4 "Add your first car" button navigates to /dashboard/vehicles/new — 3540404
- [x] 3.5 Browser back from /dashboard/vehicles/new returns to /dashboard — 3540404
- [x] 3.6 Sign-out works from the header on any child route — 3540404

### Phase 4: Vehicle Add Form

#### Automated

- [x] 4.1 Type-check passes (npx tsc --noEmit) — 66d22cf

#### Manual

- [x] 4.2 Form renders all six fields with correct labels — 66d22cf
- [x] 4.3 Empty required fields show inline validation errors on submit — 66d22cf
- [x] 4.4 current_mileage accepts blank and positive integer; rejects negative values — 66d22cf
- [x] 4.5 fuel_type select shows exactly five options — 66d22cf
- [x] 4.6 Valid submit creates vehicle in DB and navigates to /dashboard/vehicles/<uuid> — 66d22cf
- [x] 4.7 Cancel link returns to /dashboard — 66d22cf
- [x] 4.8 New car appears in vehicle list on /dashboard — 66d22cf

### Phase 5: Schedule View Component

#### Automated

- [x] 5.1 Type-check passes (npx tsc --noEmit)
- [x] 5.2 npm test passes with no regressions

#### Manual

- [x] 5.3 Fresh add: skeleton cards appear during AI generation
- [x] 5.4 Schedule renders with ≥ 5 items each with non-empty source
- [x] 5.5 Each item shows name, colour-coded urgency chip, next-due info, source citation
- [x] 5.6 Items without source do not appear
- [x] 5.7 All-filtered warning card appears with Regenerate button when appropriate
- [x] 5.8 Network error shows error card; "Try again" succeeds after network restored
- [x] 5.9 Navigating away and back loads schedule instantly from DB (no AI call)
- [x] 5.10 Vehicle header shows correct year/make/model/fuel type/engine capacity
