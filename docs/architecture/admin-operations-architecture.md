# CTX-ARCH-004 — CreteXchange Admin Operations Architecture

**Document ID:** CTX-ARCH-004  
**Version:** 1.0  
**Status:** Approved  
**Owner:** V8 Laboratories  
**Product:** CreteXchange  
**Effective Date:** July 2026  
**Purpose:** Define the complete admin operational architecture for platform oversight, user management, financial supervision, billing reconciliation, owner/driver support, compliance, reporting, configuration, auditability, and future enterprise administration.

**Strategic Context:** [Platform Strategy](../vision/platform-strategy.md), [Data Strategy](../product/data-strategy.md), [Business Model](../business/business-model.md), and [Customer Value Framework](../business/customer-value-framework.md) provide long-term enterprise, intelligence, data, and customer-value context. This document remains authoritative for admin implementation; these references do not redesign architecture or make future capabilities current functionality.

## 1. Purpose

The admin portal is the platform control center for oversight and governance.

Administrators manage:

- users
- owners
- drivers
- locations
- washout and activity oversight
- financial oversight
- billing reconciliation
- driver payout oversight
- wallet and ledger oversight
- Stripe/payment monitoring
- rewards administration
- material catalog administration
- compliance and safety oversight
- fraud, disputes, and exceptions
- notifications and communications
- feature flags and platform configuration
- reporting and analytics
- auditability and administrative traceability

## 2. Admin Operations Philosophy

- Admin is the control tower for the platform.
- Admin actions should protect operational integrity, financial integrity, and compliance.
- Financial behavior follows CTX-ARCH-001.
- Owner operations follow CTX-ARCH-002.
- Driver operations follow CTX-ARCH-003.
- Admin should be able to observe, supervise, and reconcile without creating duplicate business logic.

## 3. Guiding Principles

- Centralized platform oversight.
- Clear separation between operational data and financial data.
- Minimal privileged actions with auditable consequences.
- Configuration must remain explainable and reversible.
- Repair and reconciliation should be safe and idempotent.
- Enterprise administration should extend existing architecture rather than bypass it.

## 4. Admin Operational State Machine

Admin Login  
→ View Platform Status  
→ Review Users / Owners / Drivers  
→ Inspect Locations / Activities  
→ Review Financial Signals  
→ Investigate Exceptions  
→ Apply Overrides or Repairs  
→ Monitor Outcomes  
→ Record Audit Trail  
→ Historical Oversight

### Transition meanings

- **Admin Login**
  - Administrator authenticates into the control center.
- **View Platform Status**
  - Admin reviews platform health, operational state, and KPIs.
- **Review Users / Owners / Drivers**
  - Admin inspects accounts and role assignments.
- **Inspect Locations / Activities**
  - Admin reviews operational records and site behavior.
- **Review Financial Signals**
  - Admin evaluates billing, receivables, payouts, and collections.
- **Investigate Exceptions**
  - Admin reviews anomalies, disputes, failed flows, or compliance issues.
- **Apply Overrides or Repairs**
  - Admin may take controlled corrective actions.
- **Monitor Outcomes**
  - Admin verifies the effect of actions and repairs.
- **Record Audit Trail**
  - The system logs administrative actions and their outcomes.
- **Historical Oversight**
  - Past actions remain visible for reporting and governance.

## 5. Admin Roles and Permissions

Admin privileges should support:

- standard admin
- super admin
- support / operations roles
- finance / billing oversight roles
- compliance / audit roles

Role boundaries should remain explicit and auditable.

## 6. User Management

Admin user management should support:

- account review
- role assignment
- account status changes
- password / access recovery
- contact verification
- support escalation
- account suspension where appropriate

## 7. Owner Management

Admin owner management should support:

- owner account review
- billing configuration
- location oversight
- approval status
- payment method setup
- operational support
- compliance flags
- escalation handling

## 8. Driver Management

Admin driver management should support:

- profile review
- onboarding status
- document / profile completion
- payout readiness
- support issues
- safety / compliance concerns
- reward participation review

## 9. Location Management

Admin location management should support:

- location review
- activation and suspension
- material acceptance review
- pricing oversight
- capacity review
- hours and restrictions review
- compliance review

## 10. Washout and Activity Oversight

Admin should be able to review:

- activity status
- approval state
- rejected activities
- disputed submissions
- duplicate or phantom activity concerns
- photo validation
- location mismatches
- operational anomalies

## 11. Financial Oversight

Financial oversight must follow CTX-ARCH-001.

Admin should monitor:

- platform revenue
- driver incentives
- owner receivables
- paid history
- outstanding balances
- payout liabilities
- billing run status
- reconciliation deltas

## 12. Billing and Receivables Management

Admin billing and receivables management should support:

- billing preview
- billing history
- current receivables
- paid receivables
- batch runs
- collections monitoring
- reconciliation review
- repair operations

Billing math must remain canonical and align with CTX-ARCH-001.

## 13. Driver Payout Oversight

Admin should oversee:

- payout readiness
- payout posting
- pending transfer queues
- payout failures
- payout history
- transfer reconciliation

## 14. Wallet and Ledger Oversight

Admin should supervise:

- wallet balances
- ledger transactions
- pending ledger activity
- balance anomalies
- posting failures
- wallet reconciliation

Wallet balance is ledger-based and distinct from earnings or receivables.

## 15. Stripe and Payment Monitoring

Admin Stripe and payment oversight should include:

- payment intent status
- transfer status
- payout readiness
- failed payments
- pending onboarding
- account requirements
- charge reconciliation

Stripe is an external rail, not the system of record for KPI computation.

## 16. Rewards Administration

Admin rewards administration should support:

- reward issuance
- reward participation review
- lottery and entry oversight
- reward exceptions
- fairness and audit review

## 17. Material Catalog Administration

Admin should be able to manage:

- material definitions
- acceptance defaults
- visibility rules
- category updates
- future material expansion

## 18. Compliance and Safety Oversight

Admin compliance oversight should include:

- safety review
- permit review
- site restrictions
- hazardous material flags
- environmental compliance
- exception handling

## 19. Fraud, Disputes, and Exceptions

Admin should oversee:

- fraudulent activity signals
- disputed submissions
- duplicate activity concerns
- failed billing anomalies
- payout anomalies
- manual review queues

## 20. Notifications and Communications

Admin communications may include:

- owner support
- driver support
- compliance messages
- billing notices
- payout notices
- platform alerts
- operational escalation messages

## 21. Feature Flags and Platform Configuration

Admin platform configuration should support:

- feature flags
- rollout controls
- pricing configuration
- operational toggles
- workflow switches
- emergency disable controls

Configuration should never bypass the underlying architecture.

## 22. Admin Dashboard KPI Catalog

### Platform Fees
- Purpose: show platform revenue due or earned.
- Source: canonical financial summary.
- Calculation: sum of platform fee cents.
- Update Trigger: billing summary refresh.
- Included: platform fee totals.
- Excluded: driver incentives.

### Driver Incentives
- Purpose: show total driver incentive obligations.
- Source: canonical financial summary.
- Calculation: sum of driver tip cents.
- Update Trigger: billing summary refresh.
- Included: driver tip totals.
- Excluded: platform fees.

### Total Owner Charge / Receivables
- Purpose: show total owner obligation.
- Source: canonical financial summary.
- Calculation: platform fees + driver incentives.
- Update Trigger: billing summary refresh.
- Included: current receivables.
- Excluded: paid history unless explicitly labeled.

### Paid Receivables
- Purpose: show collected or settled amounts.
- Source: payment history / billing run history.
- Calculation: settled revenue totals.
- Update Trigger: collection or batch completion.
- Included: settled records.
- Excluded: outstanding receivables.

### Outstanding Receivables
- Purpose: show unpaid current obligations.
- Source: billing summary.
- Calculation: receivables minus paid totals.
- Update Trigger: payment or receivable changes.
- Included: open owner charges.
- Excluded: paid history.

### Driver Payout Liability
- Purpose: show amounts still owed or pending to drivers.
- Source: payment and wallet ledger.
- Calculation: unpaid driver incentive totals.
- Update Trigger: payout posting or settlement.
- Included: pending driver payouts.
- Excluded: completed payouts.

### Billing Preview
- Purpose: show the impact of a proposed billing run.
- Source: canonical preview summary.
- Calculation: same as receivables logic.
- Update Trigger: preview input changes.
- Included: billable current receivables.
- Excluded: historical paid records.

### Billing History
- Purpose: show completed billing runs.
- Source: billing run records.
- Calculation: historical run totals.
- Update Trigger: completed billing runs.
- Included: archived runs.
- Excluded: pending preview data.

## 23. Reporting and Analytics

Admin reporting should include:

- platform performance
- owner performance
- driver performance
- financial trends
- compliance trends
- operational trends
- exception trends

Financial reporting must reference CTX-ARCH-001.

## 24. Audit Logging and Administrative Traceability

Administrative actions should be logged with:

- actor identity
- action type
- timestamp
- affected entity
- before and after state where appropriate
- correlation or request identifier
- outcome status

Traceability is mandatory for privileged actions and reconciliation workflows.

## 25. Security and Separation of Duties

Admin architecture should support separation of duties where possible:

- operational support
- finance / billing
- compliance / audit
- super admin control

Sensitive actions should be restricted and traceable.

## 26. Reconciliation and Repair Operations

Admin repair operations should be:

- idempotent
- auditable
- dry-run capable
- scope-limited
- reversible where possible

Reconciliation should repair data, not create hidden side effects.

## 27. Architecture Decision Records

### ADR-016 — Admin as Platform Control Tower

**Decision:** Admin acts as the platform control tower for oversight and governance.

### ADR-017 — Financial Oversight Uses CTX-ARCH-001

**Decision:** Financial admin views and reconciliations must follow CTX-ARCH-001.

### ADR-018 — Administrative Actions Require Auditability

**Decision:** Admin actions affecting data, billing, or access must be traceable.

### ADR-019 — Repair Operations Must Be Idempotent

**Decision:** Repair and reconciliation operations must be safe to repeat without duplicate effects.

### ADR-020 — Admin Configuration Must Not Bypass Product Architecture

**Decision:** Admin configuration should extend product architecture rather than replace it.

## 28. Codex Engineering Rules

- Do not bypass canonical financial helpers.
- Do not duplicate billing formulas.
- Do not mix operational counts with financial metrics.
- Do not hide repair side effects.
- Do not create admin-only logic that breaks owner or driver architecture.
- Use shared helpers for status, summary, and reconciliation logic.
- New admin KPI or workflow changes must update this architecture spec.

## 29. Future Expansion

Future admin capabilities may include:

- enterprise dashboards
- team and role hierarchies
- regional administration
- advanced fraud models
- cross-account governance
- automated reconciliation workflows
- policy engines
- AI-assisted support triage
- multi-organization administration

## 30. Change Governance

Any admin operational change must:

- update CTX-ARCH-004
- identify affected APIs
- identify affected dashboards
- identify affected workflows
- include validation and migration guidance where applicable

This document is the governing source for admin operations architecture until superseded by a newer approved architecture document.

## 31. Pilot Administrative Review Requests

Administrative Review Requests are facilitator-only operational work. An Administrator may close a request or transactionally return the activity to the existing Owner pending-review workflow; an Administrator cannot verify or reject the activity. Decisions are auditable, participant-visible where appropriate, and financially isolated from payments, wallets, settlements, and provider execution.
