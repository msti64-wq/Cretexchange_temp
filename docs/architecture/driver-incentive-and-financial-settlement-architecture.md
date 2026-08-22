# CTX-ARCH-006 — Driver Incentive and Financial Settlement Architecture

**Document ID:** CTX-ARCH-006

**Version:** 1.0

**Status:** Approved — wallet-authoritative settlement selected by active PD-045; runtime remediation pending

**Owner:** V8 Industries LLC

**Product:** CreteXchange

**Effective Date:** July 2026

**Purpose:** Define the canonical driver-incentive snapshot, financial obligation, settlement, reporting, recovery, and idempotency architecture for verified washout and approved material-recovery transactions.

## 1. Purpose, Authority, and Current-State Boundary

This document specializes [CTX-ARCH-001](./financial-architecture-and-kpi-specification.md) for the lifecycle that begins with a driver transaction and ends with owner collection, driver settlement, reporting, and reconciliation. CTX-ARCH-001 remains authoritative for the broader financial architecture. Within the driver-incentive and settlement domain, this document defines the more specific contract.

The following references remain in force:

- [Platform Vision](../vision/platform-vision.md) defines why CreteXchange exists.
- [Platform Strategy](../vision/platform-strategy.md) defines long-term strategic direction.
- [Project Context](../project/project-context.md) defines current implementation and sprint context.
- [CTX-STD-001](../standards/cretexchange-platform-standards.md) defines mandatory platform standards.
- [CTX-ARCH-001](./financial-architecture-and-kpi-specification.md) defines the general financial architecture and KPI model.
- [CTX-ARCH-002](./owner-operations-architecture.md) defines owner configuration and approval operations.
- [CTX-ARCH-003](./driver-operations-architecture.md) defines driver workflows and driver-facing KPI behavior.
- [CTX-ARCH-005](./material-management-architecture.md) defines material financial direction and configurable settlement models.
- [Product Decisions](../product/product-decisions.md) record durable product choices and unresolved proposals.
- [Data Strategy](../product/data-strategy.md) governs data quality, lineage, historical interpretation, and protection.
- The current [canonical Driver Stripe service](../../server/driverStripeService.ts) owns local/Stripe account resolution and readiness; this architecture governs how verified readiness may be used by financial settlement without redesigning that service.

This document defines required architecture. It does not claim the current implementation already complies. The financial audit that preceded this document found active conflicts in check-in, approval, owner billing, Stripe, wallet, reporting, and dashboard paths. Runtime remediation remains future work requiring separately approved implementation phases and validation.

Concrete washout is the current production foundation. References to material-recovery transactions define an extensibility contract that applies only to workflows separately approved and implemented under CTX-ARCH-005; they do not claim a broader settlement workflow is currently available.

## 2. Canonical Financial Contract

The current verified-drop financial contract is:

```text
Configured Driver Incentive = washout_locations.rate
Frozen Driver Incentive     = washout_activities.amount
Realized Driver Incentive   = payments.amount
Platform Fee                = payments.processing_fee
Owner Charge                = Frozen Driver Incentive + Applicable Platform Fee
```

The terms **driver incentive** and legacy **driver tip** currently refer to the same economic value. There is no separate additional owner tip. A future additional tip requires a Product Decision, architecture, schema/API contract, accounting treatment, and approved sprint before implementation.

`payments.washout_service_fee` is compatibility-only. It must not be counted as a second driver incentive when `payments.amount` exists.

## 3. Incentive Snapshot Decision

### 3.1 Exact snapshot event

The driver incentive becomes immutable at the **Server-Accepted Check-In Submission**.

This is the instant when the server has:

1. authenticated the driver;
2. validated that the selected location and transaction are eligible;
3. validated the required submission and evidence;
4. read the accepted location configuration;
5. constructed the canonical activity record; and
6. begun the transactional insert that creates the activity and its required evidence.

The snapshot does not occur merely when the driver opens the page, selects a location, arrives geographically, or begins a draft. A draft or arrival signal can become stale or fail validation. Completed server acceptance is the first event that creates a durable, auditable agreement while remaining before owner review.

### 3.2 `washout_activities.amount`

`washout_activities.amount` means:

> The immutable agreed driver incentive snapshot, expressed in dollars, captured from the accepted location configuration at Server-Accepted Check-In Submission.

Required consequences:

- The client must not control the stored amount.
- The authenticated driver ID is authoritative.
- The server initializes the activity status to `pending`.
- The server generates the canonical acceptance timestamp stored in the current activity timestamp field.
- Later location-rate changes do not alter an accepted activity.
- Approval, payment creation, owner billing, driver settlement, reporting, and KPI calculations use the frozen snapshot.
- Current location configuration is never a fallback for a historical accepted transaction during financial processing.
- Historical records created before this contract are not automatically trusted as canonical snapshots.

## 4. Canonical Money Concepts

All persisted decimal money fields named below are US-dollar values unless explicitly identified as integer cents. Runtime Stripe amounts and canonical calculation boundaries use integer cents.

| Concept | Source of truth | Unit | Configures / receives | Immutability | Zero / null | Lifecycle status |
| --- | --- | --- | --- | --- | --- | --- |
| `washout_locations.rate` | Location configuration | Dollar decimal | Owner configures; proposed incentive for driver | Mutable for future check-ins | Zero allowed; null/invalid is not financially valid | Current |
| Configured driver incentive | Accepted location rate | Dollar decimal | Owner configures; driver is beneficiary after approval | Mutable until submission acceptance | Zero allowed; null/invalid blocks acceptance or approval | Current |
| `washout_activities.amount` | Accepted activity row | Dollar decimal | Server snapshots; driver is potential beneficiary | Immutable at accepted submission | Zero allowed; null/invalid blocks financial approval | Current canonical snapshot for new records |
| Realized driver incentive | Approved payment obligation | Dollar decimal | System creates; driver receives | Immutable at approval except auditable reversal/correction | Zero allowed; null invalid | Current |
| `payments.amount` | Payment row | Dollar decimal | System copies frozen activity amount; driver receives | Immutable when obligation is created | Zero allowed; null invalid | Current financial source of truth |
| `payments.processing_fee` | Payment row | Dollar decimal | Platform policy/owner override; platform receives | Frozen when obligation is created | Explicit zero allowed; missing configuration follows CTX-ARCH-001 policy before approval | Current |
| `payments.washout_service_fee` | Payment row compatibility field | Dollar decimal | System compatibility writer | Must not independently change economics | Must not override `payments.amount` | Compatibility-only; deprecation candidate |
| Platform fee | Approved platform-fee policy copied to payment | Integer cents in calculations; dollar decimal in payment row | Platform configures; platform receives | Frozen at approval | Explicit zero allowed; missing/corrupt configuration blocks where an explicit fee is required | Current |
| Owner charge | Frozen incentive plus platform fee | Integer cents | System calculates; owner owes | Frozen by payment obligation/billing group | Incentive may be zero; charge may still contain platform fee | Current derived value |
| Driver payout | `payments.amount` converted once to cents | Integer cents | System derives; driver receives | Fixed by payment obligation | Zero creates no transfer or wallet credit | Current derived value |
| Wallet pending balance | Wallet ledger | Dollar decimal balance backed by transactions | System ledger; driver beneficiary | Changes only through atomic ledger events | Zero normal; null invalid | Canonical target; runtime remediation pending |
| Wallet available balance | Wallet ledger | Dollar decimal balance backed by posted transactions | System ledger; driver may withdraw | Changes only through atomic ledger events | Zero normal; null invalid | Canonical target; transition policy pending |
| Stripe charge amount | Owner charge | Integer cents | System requests; owner funds | Stable for one idempotency key | Must be positive for a Stripe charge | Runtime external representation |
| Stripe application fee | Platform fee | Integer cents | System requests; platform receives | Stable for one idempotency key | Zero allowed if policy permits | Runtime external representation |
| Stripe payout amount | Canonical wallet withdrawal | Integer cents | System requests; driver Connect account receives | Stable for one wallet-withdrawal idempotency key | Zero means no payout | External representation of wallet withdrawal |
| Reward entry | Reward ledger keyed by activity | Integer count | System creates; driver receives participation entry | One per eligible activity under current rule | Not amount-dependent | Current, non-financial |

### 4.1 Money conversion and rounding

- Persisted dollar decimals are converted to integer cents exactly once at a canonical boundary.
- Conversion uses the shared explicit-dollar normalization rule: multiply by 100 and round to the nearest integer cent.
- Strings and numeric values have the same explicit dollar meaning; `1` means 100 cents and `175` means 17,500 cents.
- Sub-cent positive configuration is invalid for settlement and must not silently become a payable value.
- Calculations add integer cents. They do not repeatedly convert dollar and cent representations.
- Reports format integer cents as two-decimal dollar strings only at presentation/export boundaries.

## 5. Owner Charge Formula

The authoritative formula is:

```text
Owner Charge
=
Frozen Driver Incentive
+
Applicable Platform Fee
```

The driver incentive appears exactly once. The platform fee appears exactly once. Neither `payments.washout_service_fee` nor a derived `tipAmountCents` value is added as a second incentive.

### 5.1 Standard example

```text
Driver incentive: $1.75
Platform fee:     $5.00
Owner charge:     $6.75
```

### 5.2 Zero-incentive example

```text
Driver incentive: $0.00
Platform fee:     $5.00
Owner charge:     $5.00
```

### 5.3 Later rate change

```text
Check-in snapshot:      $1.75
Later configured rate:  $2.00
Owner charge incentive: $1.75
```

A billing adapter must consume `payments.amount` or, before payment creation, the frozen activity snapshot. It must never use the current location rate for the historical transaction.

## 6. Canonical Financial Lifecycle

```text
Location Configuration
→ Server-Accepted Check-In Submission
→ Immutable Activity Snapshot
→ Owner Review
→ Approval or Rejection
→ Payment Obligation
→ Owner Billing
→ Wallet Pending Credit
→ Owner Funding / Availability Transition
→ Wallet Available
→ Stripe Wallet Payout
→ Reporting and Analytics
```

| Stage | Trigger / state | Financial record | Authority | Idempotency and retry | Failure behavior / consumers |
| --- | --- | --- | --- | --- | --- |
| Location configuration | Owner saves eligible rate/rules | None | Current location configuration | Configuration revision/audit identity | Invalid configuration cannot authorize a financial snapshot; driver discovery consumes current eligibility |
| Accepted submission | Server validates and transactionally accepts complete submission | Activity plus evidence | Activity ID and frozen snapshot | Stable submission token is required to prevent duplicate acceptance; current schema support must be audited | Atomic rollback on insert failure; owner review and operational history consume activity |
| Owner review | Owner examines pending activity/evidence | None | Pending activity | Read-only review retries are harmless | No receivable while pending |
| Approval | Valid pending activity transitions to `verified` | Exactly one payment obligation and one wallet entitlement for a non-zero incentive under the approved timing rule; reward entry if eligible | Activity snapshot, approved platform-fee policy, and wallet ledger | Payment key `activity:<activity-id>:approval`; unique activity/payment and wallet-source relationships required | Failure must not create partial obligation or wallet state; manual review if a legacy external side effect has already occurred |
| Rejection | Pending activity transitions to `rejected` | No payment, charge, wallet credit, or reward entry | Activity status | Transition is one-way absent audited administrative correction | Remains visible as rejected operational history |
| Owner billing | Approved payment obligations enter a billing group | Billing batch and owner charge | Payment rows | Stable key from owner, batch, ordered payment IDs, and amount | Timeout is reconciled before retry; reports show outstanding obligation until collection confirmed |
| Wallet availability | Approved funding event permits withdrawal | One transition from pending to available | Wallet ledger reconciled to payment and owner collection | Unique wallet source and transition identity | Failed or disputed funding follows the separately approved availability/reversal policy |
| Stripe wallet payout | Driver-initiated or scheduled withdrawal is eligible | One wallet debit/withdrawal record tied to one external payout lifecycle | Canonical wallet withdrawal record | Key derived from immutable wallet withdrawal/source ID | Failure remains recoverable without a second debit or payout; activity status does not change |
| Reporting | Data refresh/export | None | Payment first, activity snapshot second | Deterministic read | Legacy/missing data is qualified, never silently inferred from current rate |

## 7. Approval Semantics

Owner Approval is the event that creates the financial obligation.

On approval:

- exactly one payment obligation may exist for the activity;
- `payments.amount` equals the frozen `washout_activities.amount`;
- `payments.processing_fee` equals the applicable platform fee frozen at approval;
- payment creation does not reread `washout_locations.rate`;
- the owner charge becomes the sum of those two payment fields;
- a non-zero incentive creates one wallet entitlement and its immutable ledger transaction atomically under the separately approved pending/available timing rule;
- no direct Stripe destination transfer is created for that incentive;
- one eligible reward entry may be created using the activity ID as its idempotent source; and
- approval does not mean the driver has been paid.

On rejection:

- no owner charge is created;
- no payment obligation is created;
- no Stripe charge or transfer occurs;
- no pending or available wallet credit occurs;
- no reward entry occurs; and
- the activity contributes nothing to approved-incentive, pending-earnings, paid, or lifetime-paid totals.

Approval, payment, settlement, and wallet posting are distinct state transitions even when an immediate workflow performs several transitions in one request.

## 8. Canonical Settlement Authority

The following invariant is approved:

> A single driver incentive must create only one withdrawable economic entitlement.

[Canonical Driver Settlement Rail](../product/product-decisions.md#pd-045---canonical-driver-settlement-rail) (PD-045) is Active and selects the CreteXchange Driver Wallet as the canonical settlement ledger for driver incentives.

- `payments.amount` records the approved driver obligation.
- The Driver Wallet ledger records the driver's economic entitlement.
- Stripe Connect executes payout of available wallet funds.
- Stripe does not create a second independent entitlement at approval or owner billing.
- Owner billing funds the payment obligation but does not redefine the frozen incentive.
- The platform fee remains separate and never enters the driver wallet.

The required lifecycle is:

```text
Verified Driver Activity
→ Owner Approval
→ Driver Payment Obligation
→ Owner Charge
→ Driver Wallet Credit
→ Driver-Initiated or Scheduled Stripe Payout
```

### Rail exclusivity invariant

```text
For one approved driver incentive:
wallet withdrawable entitlement count <= 1
external payout settlement count <= 1
and the two records must represent the same entitlement lifecycle.
```

No approval workflow may create both an already-settled direct Stripe entitlement and a separate withdrawable wallet credit. The audited mixed Stripe-plus-wallet behavior is a current implementation conflict to remediate, not the approved target architecture. Historical records require qualification before repair and must not be re-settled solely because PD-045 became Active.

## 9. Wallet Semantics

A non-zero wallet balance represents an economic amount payable to or withdrawable by the driver; it is not merely operational display state.

### Wallet Pending

An approved entitlement that is not yet eligible for withdrawal. It must be backed by a unique pending wallet transaction. Approval should create Wallet Pending; the exact funding event that moves it to Wallet Available remains a required follow-up Product Decision rather than an implemented or active timing rule.

### Wallet Available

An entitlement backed by posted wallet ledger transactions and eligible for payout under the approved funding and withdrawal rules. It is not calculated from activity rows or unposted payment obligations.

### Wallet Transaction

The immutable ledger event explaining every balance change. Every balance change must have a corresponding transaction, and transaction creation and balance mutation must occur in one database transaction.

### Withdrawal

A wallet debit tied to exactly one external payout attempt and reconciliation lifecycle. It reduces available wallet value once and must never withdraw an incentive already settled through a legacy direct Stripe transfer.

Required wallet controls:

- lock the affected wallet row;
- check the unique source before mutation;
- create the ledger transaction and balance update atomically;
- use payment/activity source identity consistently;
- make repeat and concurrent calls return the existing outcome;
- never adjust balance before a potentially duplicate ledger insert; and
- keep scheduled approval and batch completion on one compatible pending-balance model.

The existing atomic wallet-credit helper is the implementation pattern to evaluate and extend; this document does not authorize code changes.

## 10. Stripe Architecture

Stripe is the external owner-collection and wallet payout rail. It is not the canonical driver-entitlement ledger or the source of driver earnings totals.

### Owner PaymentIntent or charge

- Purpose: collect the canonical owner charge.
- Amount: frozen driver incentive plus applicable platform fee, in integer cents.
- Application fee: platform fee in integer cents when the selected Stripe model uses an application fee.
- Driver transfer amount: none during approval or owner billing; driver funds move externally only through a canonical wallet withdrawal.
- Metadata: stable application IDs and component amounts for reconciliation, not alternate accounting authority.

### Required controls

- Every chargeable external operation has a stable idempotency key derived from immutable application identity, not current time.
- Every driver payout uses a stable idempotency key derived from the canonical wallet withdrawal/source ID.
- Every external payout is tied to one recoverable wallet withdrawal record and status lifecycle.
- Stripe account readiness is resolved through the canonical Driver Stripe service; status endpoints do not create or reconcile accounts during ordinary reads.
- A timeout or unknown response is reconciled by idempotency key, metadata, and stored Stripe identifiers before another create call.
- External success followed by local failure is recoverable without another Stripe charge, wallet debit, or payout.
- Webhook events are authenticated, deduplicated by Stripe event ID, and safe to process repeatedly.
- Stripe success is reconciled to exactly one canonical payment and billing group.
- Raw Stripe account, charge, or transfer objects never become the reporting source of truth.
- Sensitive Stripe IDs and details are not exposed beyond approved operational and audit needs.

## 11. Status Architecture

### 11.1 Activity status

Canonical stored values remain:

| Status | Meaning | Financial effect |
| --- | --- | --- |
| `pending` | Accepted activity awaits owner decision | No receivable, payment, earnings, wallet credit, or reward entry |
| `verified` | Owner accepted the activity | Payment obligation may be created; does not prove collection or driver settlement |
| `rejected` | Owner/system rejected the activity | No charge, payment, driver entitlement, or reward entry |

`verified` must never be displayed as `paid` without independent payment/settlement evidence.

Legacy activity terms may normalize at API serialization or frontend presentation:

- `submitted`, `pending_photo_approval`, and `awaiting_owner_approval` → pending presentation;
- `approved` and activity-level `completed` → verified presentation where historical data truly uses them;
- `declined`, `cancelled`, and `canceled` → rejected presentation; and
- `paid` and `settled` must not be written or inferred as activity states.

A migration is not authorized by this document. Production data must be inventoried first.

### 11.2 Payment status

The current payment column is string-based. Canonical application states should normalize existing terms into:

| Canonical state | Existing/compatibility examples | Meaning |
| --- | --- | --- |
| `pending` | `pending`, `awaiting_driver_stripe`, `pending_driver_onboarding` | Obligation exists but collection/settlement has not completed; blocked reason remains explicit |
| `processing` | `processing`, `queued` | External or batch processing has begun and outcome is not final |
| `completed` | `completed`, legacy `paid`, `posted`, `succeeded` | Required payment/collection milestone completed; driver settlement still requires rail evidence if separate |
| `failed` | `failed` | Attempt failed and may require retry or review |
| `cancelled` | `cancelled`, `canceled` | Obligation or attempt was validly canceled before final settlement |
| `refunded` | `refunded` | Collected owner value was returned in whole or part |
| `disputed` | `disputed` | Collection is under dispute and reconciliation rules apply |

Normalization may occur in shared payment serialization/presentation helpers. It must not rewrite history without migration and reconciliation approval.

### 11.3 Settlement status

Settlement is derived from the canonical payment, wallet ledger, and external payout evidence:

- `not_started`
- `blocked`
- `processing`
- `settled`
- `failed`
- `reversed`

This transaction-settlement status is distinct from Driver Stripe account-readiness states. It must not be inferred from activity status alone. If a future schema field is required, it needs separate schema and migration approval.

### 11.4 Wallet status

Wallet transaction status describes only the wallet ledger event, such as pending or posted. It is not an activity status, owner-collection status, or proof of a Stripe transfer.

## 12. Driver Earnings and Dashboard Definitions

| KPI / label | Required meaning | Canonical source | Excludes |
| --- | --- | --- | --- |
| Pending Review | Accepted activities awaiting owner decision | `washout_activities` with pending status | Receivables, earnings, wallet value |
| Approved Incentives | Driver obligations created by approved activities | `payments.amount` for approved obligations | Pending/rejected activities; platform fees |
| Pending Earnings | Approved driver obligations not yet settled | Unsettled canonical payment obligations | Pending activities; paid payments; wallet available |
| Paid | Driver incentive with selected-rail settlement evidence | Payment plus Stripe/wallet settlement evidence | Verified-only activity; owner collection without driver settlement |
| Lifetime Paid | Sum of settled driver incentives | Canonical settled payment records | Pending obligations; platform fees; derived tip duplication |
| Wallet Pending | Pending wallet ledger balance | Pending wallet transactions / wallet balance | Activity and payment estimates |
| Wallet Available | Posted withdrawable wallet balance | Posted wallet ledger | Legacy direct Stripe-paid amounts and unposted obligations |
| Total Earned | Avoid unqualified use | If retained, define explicitly as Approved Incentives and label unpaid portion | Any implication that all value was paid |

Pending activities are not earnings. Verified activity does not prove payment. Paid totals must derive from settlement-backed payments. Wallet totals derive only from wallet ledger records. UI components display these canonical values and do not add payment amount to a derived representation of the same incentive.

## 13. Reporting Contract

The financial source order is:

1. Use the canonical payment record when one exists.
2. Use the frozen activity snapshot for operational or pre-obligation reporting before payment creation.
3. Never use the current location rate for a historical accepted transaction.
4. Never add both `payments.amount` and an alias or derived tip representation as separate value.

Every financial report or export must distinguish:

- activity state;
- driver incentive;
- platform fee;
- total owner charge;
- owner collection/payment state;
- driver settlement state; and
- wallet state where relevant.

Reports with an activity but no payment describe operational or pre-obligation value, not paid value. Missing or legacy data must be labeled as incomplete, legacy, unverified, or requiring review. A report must not substitute a current rate merely to fill a historical gap.

## 14. Historical Records and Migration Policy

Existing activity amounts created before server-authoritative snapshots are grandfathered as preserved historical facts, not automatically trusted financial truth.

Required policy:

- Preserve original records and audit history.
- Do not bulk-recompute historical incentives from current location rates.
- Do not change a record after money moved without transaction-level reconciliation, authorization, and an auditable correction/reversal record.
- Unbilled legacy records with uncertain amount provenance are quarantined from automatic billing until reviewed.
- Where a canonical payment already exists, the payment remains the financial reporting source, subject to reconciliation against external settlement.
- Operational reports may display the historical activity amount with a legacy/unverified qualification.
- Future provenance fields, constraints, migration, or backfill require a separate audit, Product Decision where needed, migration plan, dry run, and rollback/reconciliation plan.

Historical financial rows must not be made to look canonical merely by copying current configuration.

## 15. Zero and Null Incentive Policy

### 15.1 Zero incentive

An explicit `$0.00` configured incentive is valid.

On approval:

- create one zero-dollar payment obligation row with `payments.amount = 0.00` and the applicable `payments.processing_fee`;
- charge the owner only the platform fee;
- do not create a Stripe driver transfer;
- do not create pending or available wallet value;
- create the reward entry if the activity is otherwise eligible; and
- retain the zero-dollar payment row as the idempotency, reporting, and owner-charge representation.

This policy avoids fabricating driver value while preserving one payment/owner-charge record per approved activity.

### 15.2 Null or corrupt incentive

Because the current schema expects a non-null location rate and activity amount, null, non-finite, negative, or otherwise corrupt financial input is an exception.

- Block Server-Accepted Check-In when the configured incentive cannot be validated.
- If corruption is discovered later, block financial approval or billing and create an operational/audit error.
- Do not silently infer zero, a default incentive, or the current location rate for settlement.
- Display-only code may show `Unavailable` or a clearly labeled zero fallback where required for resilience, but display fallback is not financial authority.
- Manual remediation requires evidence of the agreed value and an auditable review.

## 16. Location and Transaction Eligibility

Before Server-Accepted Check-In, the server must verify:

- the requester is an authenticated driver;
- the location exists;
- the location is active;
- the location is visible;
- owner membership/approval permits driver use;
- the location is available to the authenticated driver under the canonical driver-location rules;
- the selected service and material are accepted and active;
- capacity, hours, restrictions, or approval requirements are satisfied where enforced;
- GPS/evidence requirements are satisfied where applicable; and
- the configured incentive is valid for snapshotting.

Active and visible alone are not sufficient when the canonical location-discovery path applies owner or material eligibility rules.

## 17. Idempotency and Uniqueness

Required relationships:

| Relationship | Required guarantee |
| --- | --- |
| Accepted submission → activity | One accepted activity per stable submission identity |
| Approved activity → payment obligation | At most one active canonical obligation per activity |
| Billing group → owner charge | One external charge per stable billing idempotency key |
| Payment → driver settlement | At most one non-reversed settlement entitlement |
| Payment/activity → wallet credit | One credit per canonical source and direction |
| Eligible activity → reward entry | One reward entry under current rule |
| Stripe idempotency key → external operation | One semantic operation and amount |
| Stripe event ID → webhook processing | One successful processing outcome |

Current schema guarantees include wallet source uniqueness and reward-entry uniqueness by activity. The audited schema does not provide a unique payment relationship on activity ID and does not provide a stable check-in submission identity. Future implementation must combine application guards and database transactions immediately; future schema constraints or idempotency records should be proposed after data inventory confirms they can be added safely.

No schema change or migration is authorized by this document.

## 18. Failure and Recovery

| Scenario | Authority and retry | Reconciliation / review | Required audit evidence |
| --- | --- | --- | --- |
| Stripe succeeds, local payout persistence fails | Query/recover by stable wallet-withdrawal idempotency key and Stripe metadata; never issue a new semantic payout | Attach external result to the canonical withdrawal in a repair transaction; manual review if identity/amount differs | Withdrawal/source ID, request key, Stripe IDs, amount, failure point, repair actor |
| Local payment exists, Stripe call times out | Payment obligation remains; inspect Stripe by key before retry | Resume or mark failed/blocked based on verified external state | Payment ID, key, timeout, discovery result |
| Approval is retried | Return existing approved activity/payment/reward outcome | Do not recreate side effects | Activity ID, existing obligation and reward IDs |
| Webhook arrives twice | Deduplicate by Stripe event ID | Second delivery is a no-op after successful first processing | Event ID, prior result, delivery timestamps |
| Wallet transaction exists but balance update fails | Atomic transaction rolls back both | If impossible legacy partial state exists, quarantine and repair from ledger evidence | Wallet/source IDs, before/after balances, transaction outcome |
| Balance updates but transaction creation fails | Architecture forbids this ordering; atomic rollback required | Legacy partial state requires manual reconciliation | Balance history, source, error, repair entry |
| Location rate changes after check-in | Ignore new rate for accepted activity | Use frozen snapshot throughout | Activity snapshot, configuration revision/time |
| Rejection occurs after partial processing | Normal flow forbids settlement before approval; freeze and reconcile any partial side effect before final rejection | Manual financial review and reversal may be required | Activity/payment/Stripe/wallet/reward state and actor |
| Scheduled processing completes without pending wallet balance | Do not synthesize or decrement an unsupported balance | Recover the canonical pending entitlement only from approved payment evidence; quarantine legacy direct-settled cases | Payment, batch, wallet ledger, historical settlement evidence |
| Reporting sees activity without payment | Report operational snapshot and unresolved payment state | Never infer current location rate or paid status | Activity provenance and missing-payment flag |

Reconciliation operations must support dry run, be idempotent, preserve history, and produce structured audit logs.

## 19. Mandatory Architecture Test Matrix

| Scenario | Required proof | Test level |
| --- | --- | --- |
| Canonical check-in | Client `$999.00` becomes stored `$1.75`; authenticated driver, `pending`, and server timestamp win | Mocked route plus isolated database transaction |
| Rate change | `$1.75` snapshot remains `$1.75` after location becomes `$2.00` across approval, payment, charge, settlement, and reports | Route/service integration plus isolated database |
| Owner charge | `$1.75 + $5.00 = $6.75`, each component once | Pure accounting unit plus billing integration |
| Zero incentive | `$5.00` owner charge, zero payment row, no driver transfer/wallet value, reward still eligible | Route/service integration plus database |
| Null/corrupt incentive | Acceptance or approval blocks; no financial/external record | Unit and route integration |
| Decimal/rounding | `$0.01`, `$1.75`, `$175.00`, numeric/string inputs, and sub-cent rejection | Pure helper tests |
| Rejection | No charge, payment, wallet credit, transfer, reward, or earned total | Route/service integration plus database |
| Repeat/concurrent approval | Exactly one obligation, charge, settlement, wallet credit if applicable, and reward | Concurrent isolated database test plus Stripe mocks |
| Stripe/local failure | External success recovers under the same key without another charge | Stripe mock/fixture with injected local failure |
| Wallet atomicity | Exactly one ledger entitlement and no balance/transaction partial state | Isolated database transaction/concurrency test |
| Rail exclusivity | No direct Stripe-paid incentive also becomes withdrawable wallet value; payout and wallet debit share one lifecycle | Settlement integration test required before remediation release |
| Reporting consistency | Activity, payment, billing, dashboard, wallet, and reports show the same components and honest statuses | Service/report integration and frontend contract tests |
| Location eligibility | Inactive, hidden, and owner-ineligible locations fail before activity creation | Mocked route plus database fixture |
| Historical record | Legacy uncertain amount is qualified/quarantined and never recomputed from current rate | Reporting/reconciliation tests |

Mocks are appropriate for deterministic helper logic, route input authority, Stripe responses, webhooks, and failure injection. A real isolated PostgreSQL transaction is mandatory for uniqueness, locking, rollback, concurrent approval, payment creation, wallet atomicity, and reconciliation behavior. Live Stripe operations are not required for automated correctness tests.

## 20. Product Decision Mapping

This architecture is supported by:

- **PD-044 — Driver Incentive Snapshot Timing:** Active; snapshot at Server-Accepted Check-In Submission.
- **PD-045 — Canonical Driver Settlement Rail:** Active; Driver Wallet is the canonical entitlement ledger and Stripe Connect is the external payout rail.
- **PD-046 — Zero-Incentive Payment Representation:** Active; one zero-dollar payment row, platform-fee-only charge, no driver entitlement.
- **PD-047 — Driver Earnings and KPI Definitions:** Active; activity, obligation, paid, and wallet metrics remain separate.
- **PD-048 — Historical Financial Record Treatment:** Active; preserve, qualify, quarantine when uncertain, and never silently recompute.
- **PD-049 — Financial Idempotency and Recovery Requirements:** Active; one semantic outcome under retry/concurrency and recoverable external/local failures.

PD-045 resolves the settlement authority. Pending-to-available timing, funding-failure treatment, payout scheduling, and historical direct-settlement qualification remain follow-up policy decisions documented in Section 23.

## 21. Architecture Compliance Rules

Future implementation must:

- reuse canonical money and billing helpers;
- avoid alternate calculations in routes or React components;
- use one immutable incentive snapshot;
- create one payment obligation per approved activity;
- create exactly one wallet entitlement per non-zero approved driver incentive;
- use Stripe Connect only to disburse a canonical wallet withdrawal;
- make database and external side effects idempotent;
- preserve operational, payment, settlement, wallet, and reward status separation;
- maintain historical provenance and auditability; and
- add the mandatory tests before financial behavior is declared complete.

Implementation that conflicts with these rules must stop and return to architecture/product review.

## 22. Phased Remediation

### Phase 1 — Focused contract tests

- Establish strict incentive validation and frozen-snapshot tests.
- Prove the owner-charge formula, rail-exclusivity invariant, wallet-ledger semantics, and payout idempotency.
- Use an isolated database harness for transactional, uniqueness, and concurrency guarantees.

### Phase 2 — Check-in and approval obligation

- Make server-accepted submission authoritative for driver, amount, status, timestamp, and eligibility.
- Enforce complete location and transaction eligibility before acceptance.
- Make approval consume only the frozen snapshot.
- Create exactly one canonical payment obligation and at most one reward entry.
- Create no direct Stripe driver settlement during approval.

### Phase 3 — Wallet settlement ledger

- Create the pending wallet credit atomically with its ledger transaction.
- Implement the separately approved funding transition from pending to available.
- Enforce source uniqueness, idempotency, and safe concurrent behavior.
- Define rejection, funding failure, dispute, and reversal behavior before release.

### Phase 4 — Stripe wallet payout

- Create one canonical withdrawal record and stable idempotency key.
- Debit Wallet Available once and bind the debit to one Stripe payout lifecycle.
- Make failure and retry recoverable without a second debit or payout.
- Authenticate, deduplicate, and reconcile webhook or polling outcomes.

### Phase 5 — Billing, reporting, and KPI alignment

- Align the owner billing adapter to the unchanged owner-charge formula.
- Align payment history, wallet history, dashboard KPIs, reports, and CSV exports.
- Remove double counting and labels that imply verified activity is paid.

### Phase 6 — Historical qualification

- Identify transactions already settled directly through Stripe.
- Prevent duplicate wallet backfill for direct-settled incentives.
- Qualify uncertain legacy activity amounts and quarantine unsupported obligations.
- Do not automatically recreate or repay historical obligations.
- Use dry-run, idempotent reconciliation before any separately approved repair.

These phases are remediation guidance, not sprint authorization. They do not change Sprint 2.1 scope.

## 23. Follow-Up Decisions and Change Governance

PD-045 selects the wallet-authoritative rail. It does not invent the remaining operational policy. The following decisions require explicit approval:

| Question | Recommended option | Alternatives | Implementation consequence | Blocks |
| --- | --- | --- | --- | --- |
| When does Wallet Pending become Wallet Available? | Successful, durably reconciled owner funding/collection | Authorization, capture, billing-batch completion, or a platform-funded policy | Defines the availability transition, ledger event, and collection evidence | Phase 3 availability implementation |
| What happens when owner funding fails or is disputed? | Keep or return the entitlement to Pending/blocked until a governed resolution; never expose unfunded Available value by accident | Platform assumes funding risk; reserve/hold; reversal after dispute | Defines liability, reversal, driver communication, and reconciliation | Phase 3 release |
| When may drivers withdraw? | Driver-initiated withdrawal from Available with a separately approved scheduling policy | Automatic schedule; hybrid threshold/schedule | Defines withdrawal eligibility, limits, fees, and user experience | Phase 4 release |
| How are legacy direct-Stripe settlements treated? | Preserve as settled, exclude from wallet backfill, and reconcile by evidence | Manual exception credit or reversal under case-specific approval | Prevents duplicate compensation and governs historical qualification | Phase 6 repair, not Phases 1–2 |

A proposed follow-up Product Decision should define wallet pending-to-available timing, funding-failure/dispute treatment, and payout scheduling before the corresponding remediation phase. Historical direct-settlement treatment may be recorded separately if audit evidence reveals materially different transaction classes.

Any implementation affecting check-in amounts, approval, payment creation, owner billing, Stripe charges/transfers, wallet balances, payouts, reports, or financial KPIs must:

- cite CTX-ARCH-001 and CTX-ARCH-006;
- apply the wallet-authoritative rail selected by PD-045;
- include the applicable test-matrix coverage;
- identify migration/reconciliation implications;
- preserve unrelated Sprint 2.1 work; and
- receive explicit implementation approval.
