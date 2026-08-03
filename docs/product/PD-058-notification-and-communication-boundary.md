# PD-058 — Notification and Communication Boundary

- **Document ID:** PD-058
- **Status:** Active — Phase 5 Sprint 1
- **Date:** August 3, 2026

## Decision

CreteXchange will use one recipient-scoped, structured Notification domain for actionable in-application lifecycle communication. The existing `notifications` model is extended through CTX-ARCH-013. The separate `messages` model remains the Admin support-history surface, and Driver `/messages` remains a backward-compatible Notification Center alias.

## Rules

- Canonical workflows create notification intents only after successful transitions.
- Notification delivery is best effort and idempotently recoverable when it must not block an operational workflow.
- System notifications use governed localization templates and safe metadata.
- Recipients see only their own notifications, including Admin recipients.
- Deep links remain subject to normal RBAC and ownership checks.
- Opening the center does not mark all notifications read.
- No email, SMS, push, chat, marketing, financial notification, or payment reminder is authorized in this phase.
- Platform Intelligence remains separate and receives no notification-count metric.

## Rationale

Extending the existing foundation preserves route compatibility and notification history while replacing unbounded, English-only, UI-coupled behavior with an extensible service boundary suitable for future delivery adapters.

## Related documents

- [CTX-ARCH-013](../architecture/CTX-ARCH-013-notification-and-communication-center.md)
- [CTX-STD-001](../standards/cretexchange-platform-standards.md)
- [CTX-STD-003](../standards/CTX-STD-003-product-terminology-standard.md)
- [Development Protocol](../development-protocol.md)
