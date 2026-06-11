---
change_id: schedule-item-identity
title: Schedule Item Identity + Traceability
status: implemented
created: 2026-06-11
updated: 2026-06-11
impl_reviewed: null
archived_at: null
---

## Notes

Follows car-add-ai-schedule (S-01). Adds stable UUID identity to ScheduleItem persisted inside
ai_schedule JSONB; adds schedule_item_id to service_records for durable FK traceability; seeds
savedItems from DB on load so done state persists across sessions.

Frame brief: context/changes/car-add-ai-schedule/frame.md
