---
id: ai-schedule-on-edit
title: 'AI schedule invalidation after vehicle-edit'
status: implementing
created: 2026-06-21
updated: 2026-06-21
---

Research and potential fix for the gap where editing vehicle properties (make, model, year, engine_capacity, fuel_type) does not invalidate the cached ai_schedule, causing schedule-view to display a stale schedule based on pre-edit vehicle specs.
