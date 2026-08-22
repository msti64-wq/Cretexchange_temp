# ADR-032 — Pilot Billing and Driver Tip Settlement Architecture

**Document ID:** ADR-032
**Version:** 0.1
**Status:** Draft — CEO Initial-Launch Direction Recorded; Architecture, Compliance, and Implementation Approval Required
**Owner:** Architecture / Product / V8 Industries LLC
**Product:** CreteXchange
**Decision Date:** July 24, 2026
**Classification:** Internal

## 1. Purpose

This ADR revises the proposed Pilot Billing Architecture to reflect the CEO’s initial-launch financial direction: Facility Owners are the paying customers; a Driver may receive an optional Facility-funded tip for a finally verified washout; and the tip is delivered through the Driver’s Stripe connected account. It preserves operational and financial separation, immutable qualifying events, explicit authorization, idempotency, auditability, webhook reconciliation, failed-payment handling, and legacy-route retirement.

This ADR is a design and policy record. It does not authorize code, schema changes, migrations, APIs, Stripe configuration, live charges, transfers, payouts, wallet funding, Treasury, production deployment, or a change to the current Pilot Release baseline.

## 2. Authority and Scope Boundary

This ADR is subordinate to the documentation hierarchy and must be read with [Project Context](../project/project-context.md), [CTX-STD-001](../standards/cretexchange-platform-standards.md), [CTX-ARCH-001](./financial-architecture-and-kpi-specification.md), [CTX-ARCH-006](./driver-incentive-and-financial-settlement-architecture.md), [PD-051](../product/PD-051-driver-activity-and-payment-lifecycle.md), [PD-052](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md), [PD-049](../product/product-decisions.md#pd-049---financial-idempotency-and-recovery-requirements), and [PB-001](../project/pilot/PB-001-cretexchange-pilot-baseline-v1.0.md).

The current Pilot Release baseline excludes payment-enabled testing and financial execution. This ADR records a changed initial-launch direction; it does not silently amend PB-001. A later, expressly approved baseline or Product Decision must reconcile that release gate before financial implementation or release.

## 3. Superseding Initial-Launch Direction

The following initial-launch direction is recorded:

- Facility Owners are the only paying customers.
- Drivers must complete required Stripe Connect financial onboarding as part of Driver onboarding before they are eligible to receive a tip settlement.
- A Facility Owner may select no tip, a preset tip of **$2**, **$5**, **$10**, or **$20**, or a bounded custom tip under later approved validation rules.
- Only a finally verified washout may become financially eligible.
- The Facility charge must contain separately identified platform-fee and Driver-tip components. Platform revenue and the Driver tip must never be commingled in application accounting.
- The initial launch must collect the authorized Facility amount and deliver any successful Driver tip through the Driver’s Stripe connected account using the separately selected approved Stripe settlement mechanism.
- Administrative Review is operational-only. It cannot create, alter, collect, transfer, reverse, refund, or settle money.
- Stripe Issuing and a CreteXchange-branded Stripe debit card remain future functionality. Wallets and Treasury must not be introduced solely to support initial tip settlement unless a later approved Stripe architecture proves they are required.

## 4. Canonical Lifecycle

```text
Driver Stripe Connect onboarding
→ Facility billing enrollment
→ Facility payment-method setup
→ Driver washout submission
→ Facility verification
→ finally verified operational event
→ immutable platform-fee billable event + optional immutable tip authorization
→ Facility payment collection
→ separate platform-revenue accounting + Driver-tip accounting
→ approved Stripe Connect transfer or equivalent settlement mechanism
→ connected-account availability
→ Stripe payout to Driver bank account
→ reconciliation and audit
```

The lifecycle has separate authoritative states. A successful Facility charge is not a successful Connect transfer. A successful Connect transfer is not confirmation that a payout reached the Driver’s bank account. A bank payout outcome remains a separate connected-account / Stripe payout state.

### 4.1 Operational eligibility

1. A Driver completes operational onboarding and required Stripe Connect onboarding. Connect onboarding readiness is financial readiness only; it must not redefine operational activity status.
2. A Facility completes operational onboarding, billing enrollment, and payment-method setup under the future approved billing architecture.
3. The Driver submits a washout. Submission and pending review carry no financial entitlement.
4. The Facility completes the operational verification process. An activity that is rejected, duplicate, reversed, fraudulent, invalid, or under unresolved Administrative Review is not financially eligible.
5. Only the finally verified operational event may create the immutable platform-fee billable event and, when the Facility has explicitly selected one, the immutable tip authorization.

Administrative Review may return an activity to Owner review or close an operational request under its governing policy. It must not directly create or alter a financial event.

### 4.2 Financial authorization and execution

1. The Facility’s payment method is set up before a collection attempt. The exact customer, mandate, off-session consent, and collection timing require later Stripe/legal approval.
2. The finally verified washout produces one stable platform-fee billable-event identity. An optional tip authorization has its own stable identity and is linked to the qualifying washout and authorization choice.
3. The payment workflow creates or retrieves a Payment Intent using a stable idempotency key. It records the platform-fee and tip components separately.
4. After the Facility charge succeeds and reconciliation confirms the applicable component, the settlement workflow creates or retrieves one idempotent Connect transfer or other later approved Stripe settlement instruction for the Driver-tip component only.
5. Connected-account balance availability and Stripe payout to the Driver’s bank account are observed and recorded as distinct provider outcomes. They are not inferred from the Facility charge or transfer.

### 4.3 Failure, retry, and correction

- A failed or incomplete Facility payment leaves operational verification unchanged and does not create a Driver payout claim by itself.
- A failed transfer or unavailable connected account does not authorize a duplicate Facility charge. It enters a financial exception/reconciliation path using the same financial-event identity.
- A payout failure is distinct from transfer failure and must be reconciled against the connected account and provider evidence before retry or participant communication.
- Retries reuse the original relevant idempotency identity. Unknown provider outcomes must be reconciled before retry.
- Refunds, reversals, disputes, corrections, and negative connected-account balances require explicit, auditable policy and an implementation design that reconciles every affected component. They must not mutate operational verification history or be triggered by Administrative Review alone.

## 5. Financial Integrity Requirements

The implementation must provide all of the following before activation:

- Separate platform-fee and tip ledger components; no commingling in application accounting.
- Stable financial-event identities for the qualifying washout, platform-fee event, optional tip authorization, Facility payment, Driver settlement, and provider events.
- At most one active tip entitlement per qualifying washout and explicit tip authorization.
- Idempotent Payment Intent creation and idempotent Connect transfer or approved equivalent settlement creation.
- Verified Stripe webhook signatures, persisted provider-event identities, and safe handling of repeated or out-of-order provider events.
- Reconciliation among Facility charge, platform-fee amount, Driver-tip amount, transfer/settlement state, connected-account availability, and payout state.
- Append-only audit records for manual adjustments, corrections, reversals, refunds, disputes, and exception handling.
- Explicit rules for refunds, reversals, disputes, and negative connected-account balances before activation.
- Retirement or hard fail-closed fencing of legacy routes that can create a charge, transfer, wallet credit, payout, or duplicate economic outcome outside this lifecycle.

## 6. Driver Earnings Center Requirement

The initial launch requires a Driver Earnings Center that reports tip records separately from operational activity and platform revenue. It must provide, using authoritative financial records:

- today’s tips;
- current-week, current-month, year-to-date, and lifetime tips;
- pending, paid, failed, and reversed amounts;
- recent tip activity; and
- payout or settlement history.

Subject to privacy and data minimization, each tip record should show the date, Facility name, Facility location or city/state, washout reference, tip amount, transaction status, transfer or settlement reference, and payout date when available.

Drivers must be able to download at least CSV and one human-readable report format. Those exports must be labeled as personal recordkeeping or tax-preparation reports, **not official tax forms**.

The Earnings Center must not label a verified activity, a successful Facility charge, a transfer, or a bank payout as the same state. It must never present platform revenue, another Driver’s information, bank details, or unrestricted provider metadata.

## 7. Tax and Legal Boundary

This ADR does not determine which party, if any, must issue a Form 1099. That responsibility must be confirmed with professional legal and tax advice based on the final Stripe charge architecture, payer/payee relationships, Stripe configuration, relevant jurisdictions, and actual operating agreements.

Professional confirmation is also required for payment authorization and terms, off-session collection consent, tip/disclosure treatment, refunds, disputes, negative connected-account balances, consumer/worker classification, record-retention duties, privacy notices, and any applicable money-transmission, payment-facilitation, or promotional requirements.

## 8. Pricing Reconciliation Required

The current documentation contains the following pricing positions:

| Source | Recorded position | Consequence |
| --- | --- | --- |
| Project Context, Business Model, Revenue Architecture, PD-041 | $5 platform fee per verified drop is the current foundation. | This is the prevailing documented platform-fee assumption, but not a final initial-launch pricing approval under this ADR. |
| CTX-ARCH-001 and CTX-ARCH-006 | Platform fee is distinct from the Driver incentive; existing models treat `washout_activities.amount` / `payments.amount` as the Driver incentive and calculate owner charge from incentive plus fee. | The CEO’s optional-tip direction requires a decision whether the existing incentive is retained, renamed, replaced, or made distinct from the new optional tip. |
| `docs/billing.md` | Existing live-billing description uses `washout_activities.amount` as the Driver-tip source and says owners are not currently charged recurring subscriptions. | This is an implementation description that conflicts with the target architecture’s unsettled incentive-versus-tip meaning and cannot be treated as launch approval. |
| Revenue Architecture and Business Model | Facility subscriptions/memberships are future or near-term-to-future; no current subscription package is asserted. | No membership or subscription charge is authorized for initial launch without a separate approved product, billing, entitlement, and legal decision. |

The ADR therefore does not set a final platform-fee amount, subscription price, membership charge, custom-tip bounds, tax treatment, or collection cadence. The CEO must resolve those items explicitly before implementation.

## 9. Deferred Capabilities

The following remain separate future work and must not expand initial billing implementation:

- [Driver Achievement Center, Driver Rewards Center, and shared Driver Leaderboard](../product/PD-056-driver-achievement-rewards-and-leaderboard-future-direction.md), including additional monthly drawing entries, seasonal challenges, regional/monthly/annual/all-time rankings, and Founding Driver recognition;
- any leaderboard presentation of tips, earnings, banking data, Stripe data, or private financial status, which is prohibited;
- Stripe Issuing and a CreteXchange-branded Driver debit card;
- Treasury or a wallet introduced only as an implementation shortcut for tips;
- subscriptions, memberships, and advanced Facility billing; and
- any financial action triggered by Administrative Review.

## 10. Required CEO Decisions Before Implementation

1. Confirm the final platform-fee schedule, applicable Facility/customer, collection cadence, and any waiver policy.
2. Confirm whether a Driver incentive exists separately from an optional tip, or whether the optional tip replaces the current incentive model for the initial launch.
3. Confirm the final Stripe charge architecture and the approved Driver settlement mechanism after Stripe capability, legal, tax, and reconciliation review.
4. Confirm facility payment-method consent, off-session collection policy, failure/retry policy, and participant communications.
5. Confirm custom-tip minimum/maximum, currency, rounding, refund/reversal/dispute policy, and treatment of negative connected-account balances.
6. Confirm the Driver Earnings Center reporting period, export format, data retention, and support obligations.
7. Approve an updated pilot baseline, Product Decision, financial architecture reconciliation, implementation scope, migration plan, test plan, and release evidence before enabling any financial execution.

## 11. Consequences

The initial-launch billing direction is feasible only after a narrowly scoped, separately approved financial implementation reconciles the existing incentive/wallet architecture with the optional-tip requirement and proves end-to-end provider, persistence, webhook, audit, reversal, and reconciliation behavior in isolated and staging environments.

Until then, existing financial execution controls remain fail closed. Operational verification and Administrative Review remain available only within their existing non-financial boundaries.

## 12. Related Documents

- [Financial Architecture & KPI Specification](./financial-architecture-and-kpi-specification.md)
- [Driver Incentive and Financial Settlement Architecture](./driver-incentive-and-financial-settlement-architecture.md)
- [PD-051 — Driver Activity and Payment Lifecycle](../product/PD-051-driver-activity-and-payment-lifecycle.md)
- [PD-052 — Marketplace Trust, Administrative Activity Review, and Dispute Resolution](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)
- [PD-056 — Driver Achievement, Rewards, and Shared Leaderboard Future Direction](../product/PD-056-driver-achievement-rewards-and-leaderboard-future-direction.md)
- [Pilot Baseline PB-001](../project/pilot/PB-001-cretexchange-pilot-baseline-v1.0.md)
