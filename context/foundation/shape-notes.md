---
project: 'DriveMate'
context_type: greenfield
created: 2026-05-23
updated: 2026-05-23
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: 'pain type'
      decision: "data trapped in PDFs/manuals + decision paralysis (don't know what to prioritise)"
    - topic: 'differentiator insight'
      decision: 'AI that speaks to a non-mechanic — translates raw service data into approachable, human-readable guidance'
    - topic: 'primary persona'
      decision: 'everyday private car owner, one or two cars, non-mechanic'
    - topic: 'auth model'
      decision: 'email + password or OAuth; server-side account; cross-device sync'
    - topic: 'role model'
      decision: 'flat — every user sees only their own cars; no sharing, no admin for MVP'
    - topic: 'MVP scope'
      decision: 'VIN lookup + AI-generated schedule + service tracking; AI chat moved to v2'
    - topic: 'timeline'
      decision: '3 weeks after-hours; within threshold, no acknowledgment block needed'
    - topic: 'product type'
      decision: 'web-app'
    - topic: 'target scale'
      decision: 'medium (dozens to ~100 users at launch)'
    - topic: 'deadline'
      decision: 'no hard deadline; after-hours work only'
  frs_drafted: 8
  quality_check_status: accepted
---

## Vision & Problem Statement

A private car owner knows their car needs servicing — they just don't know _what_, _when_, or _why_. The answer exists: it's buried in a PDF manual, scattered across model-specific forums, or locked in the head of a mechanic they haven't called yet. The gap isn't the information — it's access to it at the moment it's needed.

DriveMate's insight: existing reminder apps hand the owner a raw maintenance table. That's still a mechanic's read. DriveMate goes one step further — it speaks to the person, not the car. A natural-language AI layer translates the manufacturer schedule and the car's service history into a clear, actionable answer: "your next job is X, here's why, here's what to expect."

## User & Persona

**Primary persona: The non-mechanic car owner**

Name: everyday adult who owns one or two passenger cars.
Role: sole decision-maker for their vehicle's maintenance.
Context: not a DIY mechanic; relies on a workshop for actual repairs; manages their own schedule and budget.
Moment they reach for DriveMate: standing at the workshop counter being quoted a service, or getting an annual inspection reminder and wondering "is there anything else I should do at the same time?" — and not knowing where to look for the answer.

## Success Criteria

### Primary

- User adds a car (via VIN or manually) and receives a personalised maintenance schedule in under 2 minutes.

### Secondary

- Service history accumulates into a simple readable record as the user marks services done — giving a hint of the long-term value of keeping records.

### Guardrails

- A user must never be able to see or access another user's car data. A single data-isolation bug kills trust permanently.
- The app must never display a maintenance item without a traceable source (manufacturer schedule or service record). AI hallucinating intervals is worse than showing nothing.

## User Stories

### US-01: User adds their car and receives a maintenance schedule

- **Given** a logged-in user with no cars yet added
- **When** they enter a VIN (or fill in make, model, year, engine capacity, fuel type)
- **Then** they see a personalised maintenance schedule for that car within 2 minutes

#### Acceptance Criteria

- Schedule lists at least the top 5 upcoming service items with estimated mileage or date
- VIN path auto-fills make, model, year, engine capacity, and fuel type if the lookup succeeds
- Manual path requires all 5 fields before proceeding
- Empty-state message shown if VIN lookup returns no data (not a crash or blank page)

## Functional Requirements

### Vehicle management

- FR-001: User can add a car by entering its VIN. Priority: must-have

  > Socrates: Counter-argument considered: "VIN lookup depends on an external API that may be unreliable or costly for MVP." Resolution: kept. VIN is the core differentiator — without it the schedule is only as accurate as what the user remembers about their car.

- FR-002: User can add a car manually (make, model, year, engine capacity, fuel type). Priority: must-have

  > Socrates: Counter-argument considered: "5 fields adds friction; make/model/year alone might be enough." Resolution: kept. Capacity and fuel type are load-bearing for schedule accuracy — a generic 2.0 petrol schedule is wrong for a 1.6 diesel.

- FR-003: User can delete a car record and all associated service history. Priority: must-have

  > Socrates: Counter-argument considered: "Delete is one-way — accidental delete loses all history; soft-delete is safer." Resolution: kept as must-have (GDPR + user autonomy require it). Implementation note: a confirmation step is non-negotiable; soft-delete vs hard-delete is an open question for downstream design.

- FR-004: App fetches basic vehicle data from a VIN lookup. Priority: must-have
  > Socrates: Counter-argument considered: "VIN data quality varies by market; EU/Polish VINs may return incomplete data from free APIs." Resolution: kept. VIN lookup is the core differentiator. API reliability for Polish-market vehicles should be validated before committing to a specific provider — see Open Questions.

### Maintenance schedule

- FR-005: User can view an AI-generated maintenance schedule for their car. Priority: must-have
  > Socrates: Counter-argument considered: "AI may hallucinate intervals, leading to real maintenance harm; a static manufacturer table has higher credibility." Resolution: kept. The guardrail "no maintenance item shown without a traceable source" is the mitigation — hallucination risk is real but manageable with source attribution, not by dropping AI.

### Service tracking

- FR-006: User can mark a scheduled service item as done, recording the date and mileage. Priority: must-have

  > Socrates: Counter-argument considered: "Requiring both date AND mileage adds friction — users often don't know exact mileage at service time." Resolution: kept. Both fields are load-bearing for schedule recalculation (next-due date). One could be made optional — deferred to implementation.

- FR-007: User can view their service records as a date-sorted list. Priority: nice-to-have

  > Socrates: Counter-argument accepted: "A visual timeline is v2; a simple date-sorted list is sufficient for MVP and faster to build." Resolution: downgraded to nice-to-have and FR reworded from 'chronological timeline' to 'date-sorted list'.

- FR-008: User can edit a previously saved service record. Priority: nice-to-have
  > Socrates: Counter-argument considered: "Edit creates mutable history, complicating future audit trails." Resolution: kept as nice-to-have. Delete-and-re-add is an acceptable workaround if time runs short.

## Non-Functional Requirements

- A user perceives the maintenance schedule as fully loaded after completing car addition (no time limit).
- The app remains fully functional on the two most recent major releases of Chrome, Firefox, Safari, and Edge.
- One user's car records and service history are never readable or enumerable by any other user account.
- All user-facing screens are usable on a mid-range mobile browser at 375 px viewport width without horizontal scrolling.

## Business Logic

Given a car's specs (make, model, year, engine capacity, fuel type) and its recorded service history, DriveMate determines which maintenance jobs are overdue, due soon, or upcoming — and surfaces them in urgency order.

The rule consumes three categories of user-facing input: the car's identity fields (captured at car-add time), a log of service events the user has marked as done (each stamped with a date and mileage), and the user's current reported mileage or the current date as the "now" reference point. Its output is a prioritised maintenance list where each item carries an urgency label (overdue / due soon / upcoming) and an estimated next-due date or mileage milestone. The user encounters this output immediately after adding a car (cold schedule, no history yet) and on every subsequent session once service events have been recorded (schedule recalculates based on history).

## Access Control

Authentication: email + password or OAuth. Users create an account; their car records and service history are stored server-side and accessible from any device.

Role model: flat. Every authenticated user sees only the cars they added. No sharing, no admin tier, no viewer/owner split for MVP.

Unauthenticated state: all routes gated behind auth. An unauthenticated visitor is redirected to sign-in/sign-up.

## Non-Goals

- No AI chat interface in v1. Natural-language Q&A ("what oil for my car?") is deferred to v2. MVP proves the schedule + tracking core first.
- No native mobile app. A responsive web app suffices for MVP; iOS/Android builds are out of scope.
- No OBD integration. No live diagnostics via Bluetooth or USB readers. All data entry is manual.
- No cost calculator or invoice OCR. Parsing repair receipts or invoice photos is out of scope.
- No multi-user sharing or fleet management. No sharing a car record with a mechanic or family member. Single-user, flat model only.
- No admin panel or multi-role accounts. No back-office user management UI for v1.
- No offline-first guarantee. The app requires an active internet connection; no local-first or sync strategy.
- No compliance certification beyond basic GDPR. No SOC 2, ISO 27001, or accessibility certification for v1.

## Open Questions

1. **Which VIN lookup API covers Polish-market (EU) vehicles reliably?** — Owner: user. Block: yes (FR-001 and FR-004 depend on it; validate before committing to an API integration). Free-tier data completeness for EU VINs varies significantly.
2. **Soft-delete vs hard-delete for FR-003 (delete car)?** — Owner: user. Block: no (a confirmation dialog covers v1; the data-retention strategy can be decided at implementation time). Soft-delete is safer for accidental deletions; hard-delete is simpler.
3. **Is one of date or mileage optional when marking a service done (FR-006)?** — Owner: user. Block: no (implementation detail; can be decided during UI design). Making mileage optional reduces friction but weakens schedule recalculation accuracy.

## Quality cross-check

All five greenfield elements present at hand-off:

| Element                            | Status                               |
| ---------------------------------- | ------------------------------------ |
| Access Control                     | present                              |
| Business Logic (one-sentence rule) | present                              |
| Project artifacts                  | present                              |
| Timeline-cost acknowledged         | present (3 weeks — within threshold) |
| Non-Goals                          | present                              |

quality_check_status: accepted

## Forward: tech-stack

- At ~10 000 users, AI schedule calls per model/year combination would repeat heavily — a per-model-variant cache layer becomes load-bearing at that scale. Worth noting for stack selection.
- VIN lookup reliability for Polish-market (EU) vehicles: free API options vary significantly in data completeness. Specific API validation is a prerequisite before committing; see Open Questions.
