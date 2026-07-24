# CreteXchange Operations Runbooks

This index establishes the reusable structure for future CreteXchange operational runbooks. It supplements, and does not replace, the [Documentation Library](../README.md), applicable standards, architecture, Product Decisions, [CTX-OPS-001](./CTX-OPS-001-production-release-checklist.md), or [CTX-OPS-002](./CTX-OPS-002-administration-operations-guide.md).

## Current Runbooks

- [CTX-RB-003 — Incident Response Runbook](./CTX-RB-003-incident-response-runbook.md) — Draft response, evidence, and escalation boundaries; it does not authorize recovery or production change.
- [CTX-RB-004 — Database Recovery Runbook](./CTX-RB-004-database-recovery-runbook.md) — Draft evidence and decision boundaries for separately authorized recovery.
- [CTX-RB-005 — Financial Reconciliation Runbook](./CTX-RB-005-financial-reconciliation-runbook.md) — Draft non-executing financial-consistency review and escalation procedure.
- [CTX-RB-006 — Driver Verification Runbook](./CTX-RB-006-driver-verification-runbook.md) — Draft evidence-based verification and escalation procedure; it does not authorize account restriction or financial execution.
- [CTX-RB-007 — Administrative Photo Review Runbook](./CTX-RB-007-administrative-photo-review-runbook.md) — Draft authorized activity-evidence review procedure with factual outcomes and escalation boundaries.
- [CTX-RB-008 — Marketplace Trust & Fraud Escalation Runbook](./CTX-RB-008-marketplace-trust-and-fraud-escalation-runbook.md) — Draft neutral escalation and evidence-preservation procedure; it does not establish fraud-investigation or provider-action authority.
- [CTX-RB-009 — Daily Operations Checklist](./CTX-RB-009-daily-operations-checklist.md) — Draft daily review guide for authorized administrators and Platform Operations personnel.
- [Assisted-Pilot Operations Runbook](../project/pilot/assisted-pilot-operations-runbook.md) — Current pilot support scenarios and operational boundaries.

## Required Runbook Structure

Every CTX-RB runbook MUST provide the following information. Equivalent information MAY be consolidated under clear section names; a non-applicable item must state why and a required safety boundary must not be silently omitted.

1. Document metadata, purpose, scope, intended audience, and trigger/use conditions.
2. Roles, prerequisites, required access/tools, and safety, security, privacy, and financial controls.
3. Procedure or operational workflow, expected outcomes, and validation.
4. Exception handling, escalation, evidence/recordkeeping, and rollback or recovery where applicable.
5. Known limitations, related governing documents and policies, governance, and change history.

The consolidated structure used by CTX-RB-003 through CTX-RB-008 satisfies this framework when it contains the equivalent mandatory information. CTX-RB-009 may retain its more detailed checklist structure.

## Authoring Rules

- State whether a capability is current, manually assisted or partial, or planned. Do not describe roadmap work as operational.
- Use least-privileged access and do not include secrets, credentials, connection strings, payment details, bank details, or unnecessary personal information.
- Preserve operational and financial separation. An operational outcome, financial approval, payment, payout, and settlement are distinct states.
- Base instructions on authorized evidence. Where an approved process does not exist, write **Procedure not yet formally defined** and require escalation rather than assumption.
- Do not create policy, approval rights, retention periods, service levels, roles, or business rules in a runbook.
- Include observable validation and durable, sanitized evidence requirements.
- Link to the governing standards, architecture, Product Decisions, policies, operations guides, and task-specific runbooks.

## Identifier and Location Convention

New runbooks use the `CTX-RB-NNN` identifier in numerical order and are stored in `docs/operations/` so the Administration Repository governed-document discovery can safely include them. Identifier availability must be verified across the repository before drafting; this index is not a numbering ledger or approval mechanism.
