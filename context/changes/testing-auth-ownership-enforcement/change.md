---
change_id: testing-auth-ownership-enforcement
title: Auth and ownership enforcement tests — route guard, RLS, and app-layer ownership
status: implemented
created: 2026-06-13
updated: 2026-06-13
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Auth & ownership enforcement".
Risks covered: #3 (unauth visitor reaches protected route), #4 (RLS doesn't enforce per-user row ownership at DB), #5 (schedule regeneration triggered for unowned vehicle).
Test types planned: Angular router integration + Supabase integration (local).
Risk response intent:
- Risk #3: prove that direct navigation to every protected route redirects an unauthenticated visitor to sign-in and does not flash the protected page during the isLoading state; challenge the assumption that a guard function existing in the code means it is applied to all routes in app.routes.ts and correctly handles pre-init loading state.
- Risk #4: prove that a Supabase query issued with User A's session cannot return rows owned by User B for vehicles and service_records (SELECT, INSERT, UPDATE, DELETE); challenge the assumption that mock tests asserting .eq('user_id', ...) prove actual RLS enforcement at the database level.
- Risk #5: prove that a request to regenerate the schedule for a vehicle not owned by the current user is rejected at the application layer before the AI proxy is called; challenge the assumption that RLS rejection at the DB level is sufficient protection (it still allows an unnecessary AI proxy call).
