---
date: 2026-06-13T00:00:00+02:00
researcher: Marcin Jarosz
git_commit: 12a602af982c5b505b8950d50fff7ee6aca40644
branch: master
repository: drive-mate
topic: "AI schedule flow hardening — Phase 1 research (Risks #1 and #2)"
tags: [research, codebase, ai-schedule, source-attribution, schedule-view, vitest, testing]
status: complete
last_updated: 2026-06-13
last_updated_by: Marcin Jarosz
---

# Research: AI Schedule Flow Hardening (Phase 1)

**Date**: 2026-06-13  
**Researcher**: Marcin Jarosz  
**Git Commit**: 12a602af982c5b505b8950d50fff7ee6aca40644  
**Branch**: master  
**Repository**: drive-mate

---

## Research Question

Ground the test-plan Phase 1 rollout (`testing-ai-schedule-hardening`) in live code:

- Where exactly does the AI schedule generation flow live, and what error handling exists today?
- What is the source-attribution filter predicate, and does it cover all attack shapes?
- What component state and template paths exist for error states and item rendering?
- Which cases from the test-plan Risk Response table are already covered by specs, and which are not?
- Does `generateAndSave` check vehicle ownership before calling the AI proxy?

---

## Summary

The core generation loop lives in `src/app/core/ai-schedule/ai-schedule.service.ts`. It calls a
Cloudflare Worker at `/api/ai`, which is a transparent proxy to OpenRouter — no server-side
validation. The service does a two-level JSON parse (outer OpenRouter envelope, then the
`message.content` JSON string) and applies a source + urgency filter before persisting to Supabase.

**Risk #1 gap**: The service already throws correctly on HTTP errors, bad JSON, and a missing `items`
array. What is NOT tested: `choices` being null/empty (partial envelope), `items` being `null` or a
non-array object, and — critically — the component rendering its error card and "Try again" button
when the service throws. All existing specs are service-only; zero component tests cover the
generation flow.

**Risk #2 gap**: The source filter covers `typeof i.source === 'string' && i.source.trim().length > 0`,
which handles empty string, missing property, `null`, and whitespace-only. But only empty string and
missing property have spec coverage. `null` and whitespace-only are not tested. Also: no component
test verifies the template never renders a sourceless item.

**Ownership (Risk #5, Phase 2)**: `generateAndSave` does not check ownership before the proxy call.
The DB write is guarded by RLS, but the proxy call happens first — a malicious user could trigger
an LLM call for another user's vehicle. This is out of Phase 1 scope but confirmed as a real gap.

---

## Detailed Findings

### 1. AiScheduleService — Full Implementation Map

**File**: `src/app/core/ai-schedule/ai-schedule.service.ts`  
**GitHub**:
https://github.com/marcinjaro95/drive-mate/blob/12a602af982c5b505b8950d50fff7ee6aca40644/src/app/core/ai-schedule/ai-schedule.service.ts

#### Entry point

```
generateAndSave(vehicle: Vehicle, signal?: AbortSignal, serviceRecords: ServiceRecord[] = []): Promise<ScheduleItem[]>
```

#### Proxy call (lines 11–22)

```typescript
const httpRes = await fetch('/api/ai', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  signal,
  body: JSON.stringify({
    model: 'gpt-oss-120b:free',       // OpenRouter free-tier OSS model
    messages: [{ role: 'user', content: this.buildPrompt(vehicle, serviceRecords) }],
    response_format: { type: 'json_object' },
  }),
});
```

Calls relative `/api/ai` → Cloudflare Worker → OpenRouter Chat Completions. `AbortSignal` is
wired for cancellation.

#### Two-level JSON parse (lines 23–28)

```typescript
if (!httpRes.ok) throw new Error(`AI proxy error: ${httpRes.status}`);
const envelope = await httpRes.json();
if (!Array.isArray(envelope?.choices) || !envelope.choices[0]) {
  throw new Error(`AI proxy returned unexpected response shape: ${JSON.stringify(envelope).slice(0, 200)}`);
}
const parsed: { items: ScheduleItem[] } = JSON.parse(envelope.choices[0].message.content);
if (!Array.isArray(parsed?.items)) throw new Error('AI response missing items array');
```

Step 1: HTTP status check.  
Step 2: Outer envelope must have a non-empty `choices` array.  
Step 3: `message.content` is a **JSON string** — second parse extracts the schedule.  
Step 4: `parsed.items` must be an array.

**Important**: the `envelope?.choices` guard uses `Array.isArray`, so `null`, `undefined`, and
non-array values are all caught. The `!envelope.choices[0]` guard catches an empty array.

#### Source + urgency filter (lines 29–34)

```typescript
const VALID_URGENCY = new Set(['overdue', 'due_soon', 'upcoming']);
const filtered = parsed.items
  .filter(
    (i) => typeof i.source === 'string' && i.source.trim().length > 0 && VALID_URGENCY.has(i.urgency),
  )
  .map((i) => ({ ...i, id: crypto.randomUUID() }));
```

The predicate handles all six source shapes:

| Source shape | `typeof i.source === 'string'` | `.trim().length > 0` | Result |
|---|---|---|---|
| `"Toyota manual"` | true | true | **kept** |
| `""` | true | false | dropped |
| `"   "` (whitespace) | true | false | dropped |
| missing property (undefined) | false | — | dropped |
| `null` | false | — | dropped |
| `42` (number) | false | — | dropped |

The predicate is **inline** (not extracted). UUID injection (`crypto.randomUUID()`) happens here,
not in the LLM output — per the `schedule-item-identity` change.

Items failing the filter are **silently dropped** — no error thrown, no warning. If all items are
filtered, the array is empty and the component shows the "filtered" empty-state message.

#### Error throw catalogue (complete)

| Trigger | Line | Error type | Message |
|---|---|---|---|
| HTTP non-2xx | 22 | `Error` | `AI proxy error: ${status}` |
| `choices` null/non-array/empty | 25 | `Error` | `AI proxy returned unexpected response shape: ...` |
| `message.content` not valid JSON | 27 | `SyntaxError` (native) | varies |
| `parsed.items` not an array | 28 | `Error` | `AI response missing items array` |
| Network failure | 11 | `TypeError` (native) | varies |
| AbortSignal cancel | 11 | `AbortError` (native) | varies |

All non-abort errors propagate to the caller (component). `AbortError` is absorbed at the component
level (schedule-view.ts:127).

#### Persistence (line 35)

```typescript
await this.vehicleService.updateVehicle(vehicle.id, { ai_schedule: filtered });
```

Stores the filtered array as JSONB in `vehicles.ai_schedule`. Ownership is enforced here via
`.eq('user_id', user.id)` inside `updateVehicle` — but **after** the LLM call already happened.

#### Ownership gap (confirmed — Risk #5, Phase 2)

`generateAndSave` calls the proxy unconditionally. The only ownership check is the DB write at
line 35. A caller passing a foreign vehicle ID triggers an LLM inference call and only fails when
trying to persist. The `getVehicle` call in the component also lacks an explicit `user_id` filter
(RLS policy handles it at the DB level, but there is no application-layer guard before the proxy).

---

### 2. ScheduleViewComponent — State and Template Map

**Files**:
- `src/app/vehicles/schedule-view/schedule-view.ts`
- `src/app/vehicles/schedule-view/schedule-view.html`
- `src/app/vehicles/schedule-view/schedule-view.scss`

**GitHub (ts)**:
https://github.com/marcinjaro95/drive-mate/blob/12a602af982c5b505b8950d50fff7ee6aca40644/src/app/vehicles/schedule-view/schedule-view.ts

#### Signal inventory (lines 48–58 of schedule-view.ts)

| Signal | Type | Purpose |
|---|---|---|
| `vehicle` | `signal<Vehicle \| null>` | Loaded vehicle |
| `scheduleItems` | `signal<ScheduleItem[]>` | Filtered items from service |
| `isLoading` | `signal<boolean>` | Vehicle fetch in progress |
| `isGenerating` | `signal<boolean>` | AI generation in progress |
| `error` | `signal<string \| null>` | Error from generation (or vehicle load) |
| `expandedItem` | `signal<ScheduleItem \| null>` | Which item's mark-done form is open |
| `isSaving` | `signal<boolean>` | Mark-done save in progress |
| `saveError` | `signal<string \| null>` | Error from service record save |
| `mileageSyncWarning` | `signal<boolean>` | Mileage update failed but record saved |
| `savedItems` | `signal<Set<string>>` | Item IDs marked done (UUID-keyed) |

#### Service call pattern (schedule-view.ts `ngOnInit`)

- Called when `vehicle.ai_schedule` is null/empty on load (lines 99–101: cache hit → skip generation)
- `AbortController` wires a cancellation signal (line 107–108)
- `try { ... } catch { ... } finally { isGenerating.set(false) }` (lines 109–130)
- AbortError absorbed silently (line 127); all other errors: `error.set(message)` (line 128)

#### Template control-flow (schedule-view.html lines 6–126)

| Block | Condition | Renders |
|---|---|---|
| Loading spinner | `isLoading()` | `<mat-progress-spinner>` |
| Generation skeleton | `isGenerating()` | 5 shimmer placeholder cards |
| **Error state** | `error()` truthy | Error message + "Try again" button |
| Empty state | `scheduleItems().length === 0` (no error) | "All items filtered..." + "Regenerate" |
| Item list | otherwise | `<mat-card>` per item |

**Error state markup (lines 35–41)**:
```html
<div class="error-state">
  <p>{{ error() }}</p>
  <button mat-raised-button color="primary" (click)="retry()">Try again</button>
</div>
```
Calls `retry()` which re-invokes `generateSchedule()`.

#### Source attribution rendering (line 65)

```html
<small>Source: {{ item.source }}</small>
```

**No conditional guard.** The template trusts the service filter — items with null/empty source
never reach `scheduleItems`. This unconditional render is by design, confirmed by the
`car-add-ai-schedule` architecture decision.

**Potential bypass path**: `vehicle.ai_schedule` cache (loaded at init) is written to
`scheduleItems` directly (lines 99–101) without re-running the source filter. If a cached
`ai_schedule` JSONB entry has a null/empty source (e.g., written before the filter was introduced,
or by a bug), the template would render `Source: ` with no value.

---

### 3. Cloudflare Worker Proxy

**File**: `functions/worker.ts` (lines 191–227)

**GitHub**:
https://github.com/marcinjaro95/drive-mate/blob/12a602af982c5b505b8950d50fff7ee6aca40644/functions/worker.ts

- Endpoint: `POST /api/ai`
- Forwards body as-is to `https://openrouter.ai/api/v1/chat/completions`
- Adds `Authorization`, `HTTP-Referer`, `X-Title` headers
- **No request validation, no response transformation, no schema check**
- Returns upstream response (status + body) transparently
- Only server-side guard: `OPENROUTER_API_KEY` env var must exist

The Angular service receives the raw OpenRouter Chat Completions envelope — meaning all envelope
validation happens in the service, not the worker.

---

### 4. LLM Response Schema

**Model file**: `src/app/core/models/schedule-item.model.ts`

```typescript
export type Urgency = 'overdue' | 'due_soon' | 'upcoming';

export interface ScheduleItem {
  id: string;           // UUID — injected by service (crypto.randomUUID()), NOT from LLM
  item: string;
  interval_km: number | null;
  next_due_km: number | null;
  next_due_date: string | null;
  urgency: Urgency;
  source: string;       // mandatory post-filter
}
```

The LLM is instructed (in the prompt) to return `{ items: ScheduleItem[] }` but **without the `id`
field** (injected by service). The prompt includes a worked example and explicitly states:
`"source" must be a non-empty string citing the manufacturer schedule or standard industry
practice — never leave it empty`.

---

### 5. Existing Test Coverage Audit

#### ai-schedule.service.spec.ts (17 tests)

| Test | Status |
|---|---|
| Returns filtered `ScheduleItem[]` with UUIDs on valid response | ✅ |
| Excludes items where `source` is `""` | ✅ |
| Excludes items where `source` property is missing | ✅ |
| Throws `SyntaxError` when `message.content` is not valid JSON | ✅ |
| Throws `'AI proxy error: 500'` on HTTP 500 | ✅ |
| Persists filtered items via `updateVehicle` | ✅ |
| Prompt contains make, model, year, engine_capacity, fuel_type | ✅ |

**Not covered:**

| Case | Why it matters |
|---|---|
| `choices` is `null` / `[]` / non-array | Line 24 guard added in impl-review (F2) but no spec asserts it |
| `parsed.items` is `null` or `{}` (object, not array) | Line 28 guard added in impl-review (F2) but no spec |
| `source: null` | Implementation covers it (`typeof null !== 'string'`), but no spec |
| `source: '   '` (whitespace-only) | Implementation covers it (`.trim().length > 0`), but no spec |
| Urgency invalid value (e.g., `'unknown'`) | `VALID_URGENCY` Set rejects it but no spec |

#### schedule-view.spec.ts (3 tests — delete flow only)

All three existing tests cover the **delete dialog** — not schedule generation. Zero component
tests cover:

- Error card rendering when `generateAndSave` throws
- "Try again" button presence and click handler
- Any item from `scheduleItems` having its source field visible in the DOM
- Skeleton rendering during `isGenerating`
- Empty-state message when all items are filtered

---

## Code References

- `src/app/core/ai-schedule/ai-schedule.service.ts:11–34` — full generation + filter logic
- `src/app/core/ai-schedule/ai-schedule.service.ts:24–26` — choices-array guard (untested)
- `src/app/core/ai-schedule/ai-schedule.service.ts:28` — items-array guard (untested)
- `src/app/core/ai-schedule/ai-schedule.service.ts:30–33` — source + urgency filter predicate
- `src/app/core/ai-schedule/ai-schedule.service.spec.ts:77–120` — existing spec coverage
- `src/app/core/models/schedule-item.model.ts:1–12` — ScheduleItem interface
- `src/app/vehicles/schedule-view/schedule-view.ts:48–58` — signal declarations
- `src/app/vehicles/schedule-view/schedule-view.ts:99–130` — generation call + error catch
- `src/app/vehicles/schedule-view/schedule-view.html:35–41` — error state template
- `src/app/vehicles/schedule-view/schedule-view.html:42–48` — filtered empty state
- `src/app/vehicles/schedule-view/schedule-view.html:65` — source attribution display (unconditional)
- `functions/worker.ts:191–227` — `/api/ai` endpoint (transparent proxy)

---

## Architecture Insights

1. **Silent filtering, not guarded rendering.** The source guardrail is enforced by dropping items
   before they reach the component. The template has no `@if (item.source)` guard — it trusts the
   service. This is correct by design but means a bypass (e.g., stale cache) would silently render
   a sourceless item as `"Source: "`.

2. **The impl-review for `car-add-ai-schedule` added the `choices` and `items` array guards.**
   Both exist in production code (lines 24–28) but were never back-filled with specs. The spec
   file has 17 tests but does not cover these two cases.

3. **The model is OpenRouter, not Anthropic directly.** The prompt includes
   `response_format: { type: 'json_object' }` to force JSON mode, but the LLM is
   `gpt-oss-120b:free` (a free-tier OSS model via OpenRouter). Free-tier models can return
   malformed content or truncated responses more often than paid models.

4. **UUID injection in service, not DB.** `crypto.randomUUID()` runs at generation time (line 34).
   The JSONB column stores the full item with UUID. The `schedule-item-identity` migration
   backfilled UUIDs into existing records. The `savedItems` signal is UUID-keyed, making
   done-state cross-session persistent.

5. **Cache bypass gap.** `vehicle.ai_schedule` (loaded from DB at page init) bypasses the
   source filter. If an old JSONB item has null/empty source (pre-filter migration), it would
   render in the template. This is low-likelihood but worth one assertion in the component spec.

---

## Historical Context (from prior changes)

- `context/changes/car-add-ai-schedule/plan.md` — Established the two-level parse pattern,
  source filter predicate, JSONB storage, and OpenRouter model choice. Impl-review (F2, F3)
  added the `choices` array guard and urgency validation — both without adding specs.
- `context/changes/car-add-ai-schedule/reviews/impl-review.md` — F2: "missing items array guard"
  fixed at line 28; F3: "urgency validation" added; neither had a spec written.
- `context/changes/schedule-item-identity/plan.md` — Added `crypto.randomUUID()` at generation
  time (line 34); `savedItems` signal is now UUID-keyed. Relevant for component test setup.
- `context/changes/service-tracking/plan.md` — Mark-done flow and regeneration with service
  history. The "regen dialog after mark-done" flow calls `generateSchedule()` again — same code
  path, same error handling.

---

## Open Questions

1. **Cache bypass assertion**: Should the plan include a test asserting the cached path
   (`vehicle.ai_schedule` loaded from DB) never delivers a sourceless item to the template? Or is
   that out of Phase 1 scope (since the DB data is controlled by the same filter)?

2. **AbortError spec**: Should Phase 1 include a test that AbortError is silently absorbed and
   does NOT set `error()` in the component? The test-plan risk response does not mention it but
   it's a real edge case in the generation flow.

3. **Whitespace-only source in component test**: The filter spec should add `source: '   '` (unit
   test on the service) — but should the component test also verify the DOM contains no element
   with whitespace-only source text? Or is that overkill given the service already covers it?

4. **Empty `choices` shape from free-tier model**: OpenRouter's free-tier models occasionally
   return `choices: []` or truncated streaming. Should the spec include a case for
   `{ choices: [] }` (empty array, not null) separate from `{ choices: null }`? Both are caught
   by `!envelope.choices[0]` but the error message will differ slightly.
