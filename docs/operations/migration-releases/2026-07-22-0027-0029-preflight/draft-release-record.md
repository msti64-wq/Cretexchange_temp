# Production Release Record — 0027 and 0029

> **EXECUTION COMPLETE — RELEASE CLOSURE PENDING**

Both approved additive migrations committed in production during the authorized
window. This record does not mark the release closed: authenticated read-only
application smoke coverage and the full 15-minute post-migration observation
remain required before final production sign-off.

| Field | Draft record |
| --- | --- |
| Release record ID | `CTX-DB-PR-2026-07-22-0027-0029` |
| Status | Migrations committed and catalog-verified; final release closure pending. |
| Environment | Production — Railway application database identity verified by a matching non-secret database fingerprint. |
| Business reason | Restore the missing rewards-period and canonical payment-attempt schema required by already-deployed application paths. |
| Repository / branch | `msti64-wq/Cretexchange_temp` / `main` deployment source. |
| Observed application SHA | `15616fd11a621cf88e7d49b43039a9804e7ab656` |
| Authorized operator | Michael Loren Stiger |
| Business / technical approver | Michael Loren Stiger |
| Witness / reviewer | N/A — single-operator startup |
| Approved maintenance window | July 22, 2026, 9:00–10:00 AM America/Chicago |
| Start / finish | Executed within the approved window; no application deployment occurred. |

## Immutable migration package

| Order | File | SHA-256 | Required current state | Target state | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | `0027_add_rewards_period_controls.sql` | `5f8d2ba7c56c8878c7dfdac4535529f3f8c8fc9626a7d01cab145ff2033c052f` | Entirely absent | Table, five columns, and index present | Committed and verified |
| 2 | `0029_add_canonical_financial_payment_attempts.sql` | `a9f5501ea544fdb0717e9f36c08cf65b8680c94fd353b9426acd0cf040c3dbf6` | Entirely absent | Table, check, and five indexes present | Committed and verified |

## Preflight evidence

- Read-only preflight transaction: confirmed `on`; transaction rolled back.
- Migration ledger: no candidate table found. Catalog reconciliation is recorded in the release package.
- Data: aggregate-only counts/sizes were captured; no row-level data was returned.
- Baseline: 0028 frozen-total check and canonical partial payment uniqueness are present; legacy global activity index is absent; configured history cutoff has one non-null setting row.
- Safety: financial execution flags are absent, which code treats as deny; no provider interaction occurred.
- Health: production health endpoint returned healthy with database connected.

## Execution evidence

- Recovery readiness: Neon production point-in-time recovery was verified before DDL. The available history window was six hours, with an earliest restorable point of July 22, 2026, 3:49 AM America/Chicago. No restore, snapshot, or backup mutation was performed.
- Execution controls: each migration ran once in a separate explicit transaction with a five-second lock timeout, 30-second statement timeout, and 30-second idle-in-transaction timeout. Each transaction committed only after its in-transaction catalog checks passed.
- 0027: `rewards_periods` was created with the expected primary key, `(month, year)` uniqueness, status/month/year checks, and user foreign keys. The five expected `driver_lottery_entries` columns and the `(rewards_period_id, eligibility_status)` index are present, valid, and ready. Aggregate counts remained 30 lottery entries, zero rewards periods, and zero non-default eligibility values.
- 0029: `canonical_financial_payment_attempts` was created with 20 expected columns, both expected foreign keys, its valid-state check, and all five required indexes. Each expected index is valid and ready. Aggregate payment-attempt count remains zero.
- Compatibility: the existing frozen-total check and canonical partial payment-activity uniqueness index remain present and valid; the retired legacy global activity index remains absent.
- Health: the production health endpoint returned HTTP 200 with `healthy` status and a connected database after both commits.
- Read-only route probes: unauthenticated requests to the owner reporting, rewards-period, lottery, and Financial Operations endpoints correctly returned HTTP 401 JSON responses. They performed no writes. Authenticated administrative and owner smoke checks remain required for release closure.
- Financial safety: execution-control variables remain absent and therefore fail closed in application policy. No Stripe, provider, wallet, payout, batch execution, settlement, or financial business operation was invoked.
- Observation: a partial observation was completed before the approved window ended. The full 15-minute post-migration observation is outstanding and must be completed in a separately approved window.

## Final decision

**Execution succeeded; release closure is pending.** Do not represent this release
as fully complete until the outstanding authenticated read-only smoke checks and
the full 15-minute observation are recorded. No rollback is indicated by the
catalog or health evidence. If a later defect is found, use a separately
reviewed forward repair; do not drop the newly created objects or delete data.

## Recovery decision

There is no approved schema rollback in this package. If either migration fails, stop, preserve the error and catalog evidence, and choose a separately reviewed forward repair. Application rollback is permissible only after verifying compatibility with the actual catalog state. Do not drop newly created schema objects or delete data as an improvised rollback.
