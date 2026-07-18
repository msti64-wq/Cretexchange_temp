# PD-055 — Financial History Clean-Slate Cutoff

**Status:** Approved for guarded, non-executing implementation; production classification remains separately gated.

## Decision

Internal CreteXchange test records with an authoritative business timestamp before **2026-07-17 00:00:00 America/Chicago** are retained as **historical test data**. The canonical financial system starts with a clean operational slate at that boundary.

Historical test data is not an unpaid obligation to a Driver, Facility, Owner, or customer. It must not create a canonical obligation, enter a current missing-obligation queue, contribute to current incentive or receivable totals, enter a canonical batch, or enter wallet, provider, payout, settlement, or reconciliation workflows. It must also be excluded from current reward entries, lottery eligibility, leaderboards, lifetime-program totals, milestone/bonus eligibility, drawing participant/winner selection, fulfillment queues, and actionable reward or payout notifications.

## Classification and timestamp rule

The durable mechanism is an append-only `financial_history_records` mapping. It classifies activities and the complete linked incentive chain—payment, pending payout, payout batch, owner charge, fee, Driver-wallet entry, billing batch, reward entry, winner, fulfillment, and safely attributable notification—without overloading activity, payment, obligation, payout, batch, or reward state. Linked records inherit the source activity classification even when their own creation timestamp is later. An unmarked record is current operational data; a marked record is historical test data.

A lottery drawing is not classified as a whole merely because it contains a historical entry. Mixed periods retain current entries, while the historical entries are excluded before participation, ranking, selection, fulfillment, or notification is calculated.

For a washout activity, `verified_at` is the business timestamp. If it is absent, `created_at` is the fallback. The one-time migration interprets those legacy timestamp-without-time-zone values explicitly as `America/Chicago`; it never relies on the database server default timezone.

## Guardrails

- Current APIs exclude historical records by default. Historical access is an explicitly labeled, authorized, aggregate audit path; no client query parameter can turn historical inclusion on.
- Historical records remain available for controlled troubleshooting and aggregate historical reference.
- A historical activity returns the terminal `historical_test_activity` business outcome rather than a legacy-liability review block.
- A linked legacy payment remains retained but is excluded through the classified activity; it is not deleted, changed to paid, or converted into a canonical obligation.
- A guarded migration may proceed only when the approved testing baseline is exact. A material difference stops and rolls back the operation.
- No historical record is automatically converted to a canonical obligation. Any deletion or later remediation requires a separate Product Decision and authorization.

## Scope and non-scope

This decision authorizes classification, current-canonical query exclusion, tests, and a guarded migration package. It does not authorize production execution, provider calls, wallet mutation, payment execution, settlement, migration deployment, or retrospective financial repair.

## Related

[PD-054](./PD-054-canonical-financial-visibility-and-obligation-workflow.md), [PD-051](./PD-051-driver-activity-and-payment-lifecycle.md), [CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md), and [PB-001](../project/pilot/PB-001-cretexchange-pilot-baseline-v1.0.md).
