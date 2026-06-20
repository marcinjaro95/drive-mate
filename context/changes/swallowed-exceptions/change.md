---
change_id: swallowed-exceptions
title: Audit of try/catch blocks that swallow exceptions without propagating to callers
status: implemented
created: 2026-06-16
updated: 2026-06-20
archived_at: null
---

## Notes

Research query: locate try/catch patterns that catch an exception and log it (or silently discard it)
without re-throwing or returning the error to the caller.

Motivation: the existing lessons.md documents two error contracts (throw vs return AuthError | null).
A third pattern — swallowing in a catch block — could hide failures from callers and violate both
contracts.
