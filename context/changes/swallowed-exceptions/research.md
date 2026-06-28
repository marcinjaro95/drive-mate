---
date: 2026-06-16T00:00:00+02:00
researcher: Marcin Jarosz
git_commit: 64b6e00c3fd147e478194f407e56080d68edc5cc
branch: master
repository: drive-mate
topic: 'try/catch blocks that catch an exception and log it but do not propagate to the caller'
tags: [research, codebase, error-handling, schedule-view, auth-service]
status: complete
last_updated: 2026-06-16
last_updated_by: Marcin Jarosz
---

# Research: Swallowed-Exception try/catch Pattern

**Date**: 2026-06-16  
**Researcher**: Marcin Jarosz  
**Git Commit**: `64b6e00c3fd147e478194f407e56080d68edc5cc`  
**Branch**: master  
**Repository**: drive-mate

## Research Question

Search the codebase for the try/catch pattern that catches an exception and logs it, but does not propagate it to the API response (i.e., the error is silently swallowed).

## Summary

Six TypeScript files contain catch blocks. **Zero** blocks match the strict definition of "logs then silently drops" — every catch either re-throws, sets an error signal visible to the user, or returns an error value.

However, **two borderline cases** exist in `schedule-view.ts`: empty `catch {}` blocks (no logging at all) that intentionally swallow failures from `getServiceRecords()` as a graceful-degradation design choice. These are the closest instances of swallowed exceptions in the codebase — they are documented by inline comments but invisible to any monitoring/logging system.

Additionally, `main.ts` contains the standard Angular bootstrap `.catch(err => console.error(err))` which logs but does not propagate — acceptable because there is no higher caller.

## Detailed Findings

### 1. Silent swallow — intentional graceful degradation (schedule-view.ts)

**File**: [`src/app/vehicles/schedule-view/schedule-view.ts`](https://github.com/marcinjaro95/drive-mate/blob/64b6e00c3fd147e478194f407e56080d68edc5cc/src/app/vehicles/schedule-view/schedule-view.ts)

**Instance A — lines 86–90** (inside `ngOnInit` / `loadView`):

```typescript
try {
  loadedRecords = await this.serviceRecordService.getServiceRecords(vehicleForInit.id);
} catch {
  // non-blocking — done state will be empty; user can still mark items done
}
```

The catch has **no variable** and **no logging**. A failure in `getServiceRecords` is completely silent — no console output, no user notification. The schedule continues to render; `loadedRecords` stays `[]`.

**Instance B — lines 112–116** (inside `generateSchedule`):

```typescript
try {
  serviceRecords = await this.serviceRecordService.getServiceRecords(this.vehicle()!.id);
} catch {
  // non-blocking
}
```

Identical pattern. An error in the second `getServiceRecords` call (triggered when no preloaded records are passed) is swallowed silently.

**Risk**: if `getServiceRecords` fails due to a Supabase RLS misconfiguration or network error, the AI schedule will be generated without any historical service records as context — potentially producing a misleading schedule — with no user-visible indicator of the degraded state.

### 2. Log-then-stop at app bootstrap (main.ts)

**File**: [`src/main.ts:5`](https://github.com/marcinjaro95/drive-mate/blob/64b6e00c3fd147e478194f407e56080d68edc5cc/src/main.ts#L5)

```typescript
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
```

Logs to console but does not propagate. This is the standard Angular pattern — there is no meaningful caller to propagate to at the application root. **Not a concern.**

### 3. All other catch blocks — propagated correctly

| File                                              | Lines                                            | Propagation method                                      |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `src/app/vehicles/vehicle-list/vehicle-list.ts`   | 31–35                                            | `this.error.set(...)` (signal, shown in UI)             |
| `src/app/vehicles/vehicle-add/vehicle-add.ts`     | 70–71                                            | `this.decodeError.set(...)`                             |
| `src/app/vehicles/vehicle-add/vehicle-add.ts`     | 94–96                                            | `this.error.set(...)` + resets state                    |
| `src/app/vehicles/schedule-view/schedule-view.ts` | 124–127                                          | `this.error.set(...)`                                   |
| `src/app/vehicles/schedule-view/schedule-view.ts` | 178–190                                          | `this.saveError.set(...)` + early return                |
| `src/app/vehicles/schedule-view/schedule-view.ts` | 198–201                                          | `this.mileageSyncWarning.set(...)`                      |
| `src/app/shared/confirm-dialog/confirm-dialog.ts` | 31–32                                            | `this.error.set(...)`                                   |
| `src/app/core/auth/auth.service.ts`               | 22–24                                            | Sets `_currentUser` to null; loading reset in `finally` |
| `functions/worker.ts`                             | 55–56, 68–69, 104–106, 113–115, 151–157, 199–205 | Returns `null` or error Response to caller              |

## Code References

- [`src/app/vehicles/schedule-view/schedule-view.ts:86-90`](https://github.com/marcinjaro95/drive-mate/blob/64b6e00c3fd147e478194f407e56080d68edc5cc/src/app/vehicles/schedule-view/schedule-view.ts#L86-L90) — Instance A: silent swallow of `getServiceRecords` during view init
- [`src/app/vehicles/schedule-view/schedule-view.ts:112-116`](https://github.com/marcinjaro95/drive-mate/blob/64b6e00c3fd147e478194f407e56080d68edc5cc/src/app/vehicles/schedule-view/schedule-view.ts#L112-L116) — Instance B: silent swallow of `getServiceRecords` during schedule generation
- [`src/main.ts:5`](https://github.com/marcinjaro95/drive-mate/blob/64b6e00c3fd147e478194f407e56080d68edc5cc/src/main.ts#L5) — Bootstrap-level `.catch` (acceptable)

## Architecture Insights

1. **Dominant error pattern**: components catch thrown errors from data services and set an Angular signal (`this.error.set(...)` or `this.decodeError.set(...)`), which the template renders. This is consistent with the "data services throw; components handle" contract documented in `context/foundation/lessons.md`.

2. **The two silent swallows are a deliberate UX trade-off**: the schedule-view opts to degrade gracefully (show the AI schedule without history context) rather than surface an error. The risk is that a persistent `getServiceRecords` failure becomes invisible to both the user and any monitoring system.

3. **No "log then drop" pattern found**: the original query anticipated `catch (err) { console.error(err); }` without a re-throw. That specific form does not exist anywhere in the codebase. The two swallow instances are even more silent — no logging at all.

## Historical Context

- `context/foundation/lessons.md` — Documents the two-contract rule (throw vs return AuthError | null). The silent swallows in schedule-view are a third informal contract (silent graceful degradation), which lessons.md warns against adding.

## Open Questions

1. **Should the silent swallows in `schedule-view.ts` at least log a warning?** A `console.warn` or a dedicated error-tracking call would make the degradation visible in production without changing the UX behaviour.
2. **Is there any observable indication to the user** that the schedule was generated without service record context? If not, this could lead to a misleading AI schedule without any signal to the user.
