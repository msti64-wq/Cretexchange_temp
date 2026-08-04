# PD-059 — Facility Owner Operational Dashboard Boundary

- **Status:** Active — Phase 5 Sprint 2
- **Date:** August 3, 2026

## Decision

The default Facility Owner dashboard is an action-first operating surface, not another analytics or financial dashboard. It prioritizes pending Driver review, supported exceptions, today's canonical activity, current Facility context, recent submissions, and recipient notifications. Facility Intelligence remains the separate historical analysis surface.

## Rules

- Current operational queues use canonical operational records, not analytics events alone.
- Multi-Facility Owners must choose a Facility; the product never silently chooses an arbitrary first record or shows false zeroes before selection.
- Exactly one Facility may auto-select, and no-Facility accounts receive an actionable setup/readiness state.
- Dashboard previews are bounded and link into the existing governed review, Facility, Intelligence, and Notification workflows.
- Only canonically supported exceptions appear; pending work older than 72 hours is an attention signal, not an accusation or status change.
- Owner data is ownership-scoped and privacy-minimized.
- Financial information and execution are outside this operational dashboard.
- Phase 5 Sprint 3 — Two-Factor Authentication is the next approved sprint; it is not implemented by this decision.

## Related documents

- [CTX-ARCH-014](../architecture/CTX-ARCH-014-owner-operational-dashboard.md)
- [CTX-ARCH-012](../architecture/CTX-ARCH-012-platform-intelligence-layer.md)
- [CTX-ARCH-013](../architecture/CTX-ARCH-013-notification-and-communication-center.md)
- [CTX-UX-006](../ux/CTX-UX-006-facility-workspace-experience.md)
- [PD-050](./PD-050-facility-operational-access-and-billing-readiness.md)
- [PD-052](./PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)

