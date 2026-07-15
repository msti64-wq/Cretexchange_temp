# CTX-ARCH-003 — CreteXchange Driver Operations Architecture

**Document ID:** CTX-ARCH-003  
**Version:** 1.0  
**Status:** Approved  
**Owner:** V8 Laboratories  
**Product:** CreteXchange  
**Effective Date:** July 2026  
**Purpose:** Define the complete driver operational architecture, workflows, KPIs, dashboard behavior, location discovery model, check-in lifecycle, rewards model, wallet relationship, and future extensibility for all driver-facing functionality.

**Strategic Context:** [Platform Strategy](../vision/platform-strategy.md), [Data Strategy](../product/data-strategy.md), [Business Model](../business/business-model.md), and [Customer Value Framework](../business/customer-value-framework.md) provide long-term platform, data, and customer-value context. This document remains authoritative for driver implementation; these references do not redesign architecture or make future capabilities current functionality.

**Financial Contract:** [CTX-ARCH-006](./driver-incentive-and-financial-settlement-architecture.md) governs the accepted driver-incentive snapshot, approval obligation, driver settlement, wallet/Stripe exclusivity, financial statuses, and driver earnings terminology. This reference does not claim the audited runtime conflicts are already remediated.

## 1. Purpose

The driver portal is the field operations workspace for concrete, washout, and future material recovery drivers.

Drivers use the platform to:

- choose job type
- select hauled material
- find eligible locations
- understand site rules
- check in
- upload required photos
- complete washouts/recovery activity
- track activity
- track earnings
- view wallet/payment status
- participate in rewards

## 2. Driver Operations Philosophy

- Driver workflow must be fast and mobile-first.
- Owner configuration controls what drivers see.
- Drivers should not need to understand backend billing complexity.
- Financial display must follow CTX-ARCH-001.
- Driver experience consumes Owner Operations rules from CTX-ARCH-002.
- Safety and clarity are more important than feature density.

## 3. Guiding Principles

- Mobile-first field workflows
- Minimal taps
- Clear eligibility
- Material-aware matching
- Operational transparency
- Safety-first instructions
- Offline/poor-signal tolerance as future goal
- Earnings, receivables, wallet balance, and paid history must remain separate
- Rewards are additive, not a replacement for driver incentives

## 4. Driver Operational State Machine

Driver Login  
→ Select Job Type  
→ Select Material / Haul Type  
→ View Eligible Locations  
→ Select Location  
→ Review Site Rules  
→ Navigate  
→ Check In  
→ Upload Photos  
→ Submit Activity  
→ Pending Owner Review  
→ Approved / Rejected  
→ Earnings Recognized  
→ Wallet / Payment / Rewards Updated  
→ Activity History

### Transition meanings

- **Driver Login**
  - Driver authenticates and lands in the field workspace.
- **Select Job Type**
  - Driver selects the active working context.
- **Select Material / Haul Type**
  - Driver chooses the material class or recovery type being hauled.
- **View Eligible Locations**
  - Driver sees locations that match the selected job and material context.
- **Select Location**
  - Driver chooses a destination or site for the activity.
- **Review Site Rules**
  - Driver reads instructions, restrictions, and requirements before arrival.
- **Navigate**
  - Driver uses the map or directions to reach the site.
- **Check In**
  - Driver records arrival and begins the activity lifecycle.
- **Upload Photos**
  - Required photos are captured and submitted.
- **Submit Activity**
  - Activity is posted for owner review.
- **Pending Owner Review**
  - Activity is awaiting owner action and is not yet a final financial obligation.
- **Approved / Rejected**
  - Owner or system accepts or rejects the activity.
- **Earnings Recognized**
  - Billable or earned amounts become visible in driver-facing financial summaries.
- **Wallet / Payment / Rewards Updated**
  - Ledger, payout, and rewards systems reflect the activity outcome.
- **Activity History**
  - The record remains in history for review, reporting, and auditability.

## 5. Driver Job Types

- Ready-Mix / Washout
- Material Recovery
- Rubble / Demolition
- Dirt / Fill
- Asphalt / Aggregate
- Both / Ask Each Shift

### Sticky job type behavior

- Driver selection should persist until changed.
- Ready-mix drivers should not be forced to reselect every login.
- Future matching should use job type.

## 6. Material Selection

Future material selection should support:

- washout
- returned concrete
- broken concrete
- asphalt
- brick
- block / CMU
- dirt
- sand
- gravel
- rock
- rebar
- mixed demolition
- other

Material selection will eventually filter eligible locations.

## 7. Location Discovery and Matching

Owner configuration affects driver location discovery through:

- accepted materials
- capacity
- location status
- hours
- restrictions
- instructions
- driver incentives
- fees
- distance
- GPS proximity
- operating status

Future matching should hide or de-prioritize locations that do not accept the selected material.

## 8. Site Detail Experience

Before check-in, drivers should see:

- accepted service/material
- driver incentive
- owner charge visibility if appropriate
- hours
- capacity status
- instructions
- restrictions
- required photos
- PPE
- contact info
- map/directions
- special warnings

## 9. Check-In Lifecycle

Driver check-in should capture:

- GPS capture
- location validation
- timestamp
- truck/driver context
- photo requirements
- activity creation
- pending owner review
- rejection handling
- duplicate check-in prevention
- check-out / completion if applicable

## 10. Photo Capture Requirements

Photo requirements may include:

- truck number
- rear drum
- washout area
- cleanup completed
- material load
- GPS timestamp
- custom owner requirements
- future offline upload queue

## 11. Activity History

### Canonical stored activity statuses

- pending
- verified
- rejected

Legacy or presentation-only terms such as `submitted`, `approved`, `completed`, `declined`, and `cancelled/canceled` may be normalized at an API or presentation boundary under CTX-ARCH-006. `paid` and `settled` are not activity statuses.

### Driver-facing meaning

- **Pending review**
  - Activity is waiting on owner or system action.
- **Approved activity**
  - Activity is billable or accepted.
- **Rejected activity**
  - Activity is non-billable and should remain visible in history.
- **Paid activity**
  - Presentation concept for an activity linked to independent settled-payment evidence; it must not be inferred from activity status.
- **Reward activity**
  - Activity generated or contributed to rewards.

## 12. Driver Dashboard KPI Catalog

### Site Visits Today
- Purpose: show today’s operational activity count.
- Source: today’s activity records.
- Calculation: count of today’s visits.
- Included statuses: all relevant today visits.
- Excluded statuses: non-visit records.
- Update trigger: new activity or refreshed dashboard data.
- Relationship to CTX-ARCH-001: operational only, not financial.

### Today Approved Incentives
- Purpose: show driver obligations approved today, whether settled or pending.
- Source: canonical approved payment obligations.
- Calculation: sum `payments.amount` once for obligations in today’s reporting window.
- Included statuses: approved payment obligations.
- Excluded statuses: pending/rejected activities, platform fees, and duplicate tip aliases.
- Update trigger: approval or payment-obligation changes.
- Relationship to CTX-ARCH-001 and CTX-ARCH-006: approved obligation is distinct from paid settlement.

### Recent Billable Washouts
- Purpose: show recent billable activity count.
- Source: recent activities filtered to billable statuses.
- Calculation: count of verified / approved / completed activities.
- Included statuses: verified, approved, completed.
- Excluded statuses: pending, rejected, declined, cancelled.
- Update trigger: recent activity refresh.
- Relationship to CTX-ARCH-001: billable activity is separate from paid history.

### 7-day Paid Washouts
- Purpose: show settlement-backed washout count.
- Source: canonical payments plus selected-rail settlement evidence.
- Calculation: count of settled driver payment obligations.
- Included statuses: settled payment records.
- Excluded statuses: unsettled payments and activities without payment rows.
- Update trigger: driver settlement.
- Relationship to CTX-ARCH-001: paid history, not current receivables.

### Total Paid Net
- Purpose: show recorded payment history net value.
- Source: canonical payments plus selected-rail settlement evidence.
- Calculation: sum settled `payments.amount` once.
- Included statuses: settled driver incentives.
- Excluded statuses: unpaid obligations, platform fees, and derived aliases of `payments.amount`.
- Update trigger: payment or payout posting.
- Relationship to CTX-ARCH-001: historical payments only.

### Wallet Balance
- Purpose: show ledger-based available balance.
- Source: wallet ledger.
- Calculation: wallet transaction balance.
- Included: posted ledger credits and debits.
- Excluded: unposted payment obligations and direct Stripe-paid amounts when wallet is not the selected rail.
- Update trigger: wallet transaction posting.
- Relationship to CTX-ARCH-001: wallet is separate from activity earnings.

### Rewards Entries
- Purpose: show reward participation.
- Source: rewards or lottery entry records.
- Calculation: count or balance of entries.
- Included: reward entries.
- Excluded: financial payouts unless explicitly tied to rewards.
- Update trigger: reward entry creation.
- Relationship to CTX-ARCH-001: additive to financial model, not a substitute.

### Rejected Activity Value
- Purpose: show the operational value recorded on rejected activities without treating it as an earning or deduction.
- Source: rejected activity history.
- Calculation: sum frozen activity snapshots for contextual display only.
- Included: rejected / declined / cancelled activities.
- Excluded: billable activities.
- Update trigger: activity status changes.
- Relationship to CTX-ARCH-001 and CTX-ARCH-006: rejected value is not a receivable, payment, earning, or wallet adjustment.

## 13. Driver Wallet Relationship

- Wallet balance is ledger-based.
- Wallet is not activity earnings.
- Wallet updates only when `wallet_transactions` and `driver_wallets` update.
- Paid history is separate from earned activity.
- Stripe / Connect payout status is separate from activity approval.
- The Driver Wallet is the canonical driver settlement ledger under active PD-045.
- Stripe Connect disburses canonical wallet withdrawals and does not create an independent approval-time entitlement.
- A legacy direct Stripe-settled incentive must not also become withdrawable wallet value; runtime remediation remains separately scoped.

## 14. Driver Rewards

- Rewards are additive.
- Rewards do not replace driver incentives.
- Lottery entries can coexist with cash incentives.
- Rewards may be based on approved / billable activity.
- Future rewards ledger should be auditable.

## 15. Notifications

Driver notifications should include:

- activity submitted
- activity approved
- activity rejected
- payout available
- payout completed
- reward entry earned
- location closed
- material no longer accepted
- owner message
- required action

## 16. Safety and Compliance

Driver safety and compliance content should include:

- site safety instructions
- PPE
- prohibited areas
- hazardous material warnings
- environmental restrictions
- emergency contacts
- owner-specific compliance notes

## 17. Mobile and Offline Considerations

Future support should include:

- offline photo queue
- GPS retry
- queued check-ins
- background sync
- low-signal mode
- local draft activity
- upload retry status

## 18. Admin Integration

Admin visibility may include:

- driver activity
- disputed submissions
- rejected photos
- payout readiness
- rewards participation
- safety / compliance exceptions
- fraud / anomaly detection

## 19. Reporting

Driver reports may include:

- activity history
- earnings history
- paid history
- rejected adjustments
- reward history
- location usage
- material history

Financial reporting must reference CTX-ARCH-001.

## 20. Architecture Decision Records

### ADR-011 — Mobile-First Driver Operations

**Decision:** Driver workflows must prioritize speed, clarity, and minimal taps.

### ADR-012 — Driver Matching Consumes Owner Configuration

**Decision:** Driver location discovery must be driven by owner-defined material, capacity, hours, and restrictions.

### ADR-013 — Driver Earnings and Wallet Separation

**Decision:** Activity earnings, paid history, and wallet balances are separate concepts and must not be conflated.

### ADR-014 — Rewards Are Additive

**Decision:** Rewards and lottery entries are additive and do not replace driver incentives unless explicitly configured by product decision.

### ADR-015 — Sticky Driver Job Type

**Decision:** Driver job type / haul mode should persist until the driver changes it.

## 21. Codex Engineering Rules

- Do not mix wallet balances with activity earnings.
- Do not label payment-row counts as activity counts.
- Do not hide rejected activity from history.
- Do not show unavailable locations as eligible.
- Do not hardcode material matching logic in React components.
- Use shared status helpers where available.
- Dashboard KPIs must comply with CTX-ARCH-001 and CTX-ARCH-003.
- New driver workflow changes must update this architecture spec.

## 22. Future Expansion

Future driver features should support:

- intelligent routing
- favorites
- preferred locations
- wait time estimates
- queue visibility
- driver ratings
- owner-driver messaging
- material-aware recommendations
- fleet/company dispatch
- multi-driver company accounts
- mobile offline mode
- AI route suggestions
- fraud detection
- digital scale tickets
- electronic manifests

## 23. Change Governance

Any driver operational change must:

- update CTX-ARCH-003
- identify affected owner configuration dependencies
- identify affected financial KPIs
- identify affected dashboards / APIs
- include validation and migration guidance where applicable

This document is the governing source for driver operations architecture until superseded by a newer approved architecture document.
