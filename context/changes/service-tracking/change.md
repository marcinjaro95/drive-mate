---
change_id: service-tracking
title: Service tracking
status: implementing
created: 2026-06-07
updated: 2026-06-08
archived_at: null
---

## Notes

### Session-persistent "saved" state (2026-06-07)

After a successful `createServiceRecord` call, add the returned record's `id` to a
`savedItems = signal<Set<string>>()` held in the component (or a shared service scoped
to the session).

For the remainder of the session the card that triggered the save must display
**"Saved ✓"** instead of **"Mark as done"**, giving the user clear visual confirmation
without a round-trip re-fetch.

Implementation notes:

- `savedItems` is a `Signal<Set<string>>` — mutate immutably (`new Set([...prev, id])`).
- Check membership in the template with a computed: `isSaved = computed(() => this.savedItems().has(item.id))`.
- State is intentionally ephemeral (signal in component/service, not persisted to Supabase).
