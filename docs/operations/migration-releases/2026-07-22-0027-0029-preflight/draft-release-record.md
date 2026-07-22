# Draft Release Record — 0027 and 0029

> **PREFLIGHT ONLY — NOT AUTHORIZATION TO EXECUTE**

| Field | Draft record |
| --- | --- |
| Release record ID | `CTX-DB-PR-2026-07-22-0027-0029` |
| Status | Preflight complete; Phase 3 execution not authorized by this record. |
| Environment | Production, identity must be reconfirmed by the execution operator. |
| Business reason | Restore the missing rewards-period and canonical payment-attempt schema required by already-deployed application paths. |
| Repository / branch | `msti64-wq/Cretexchange_temp` / production deployment branch to be reconfirmed. |
| Observed application SHA | `15616fd11a621cf88e7d49b43039a9804e7ab656` |
| Operator / approver | Unassigned. |
| Start / finish | Not executed. |

## Immutable migration package

| Order | File | SHA-256 | Required current state | Target state | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | `0027_add_rewards_period_controls.sql` | `5f8d2ba7c56c8878c7dfdac4535529f3f8c8fc9626a7d01cab145ff2033c052f` | Entirely absent | Table, five columns, and index present | Not executed |
| 2 | `0029_add_canonical_financial_payment_attempts.sql` | `a9f5501ea544fdb0717e9f36c08cf65b8680c94fd353b9426acd0cf040c3dbf6` | Entirely absent | Table, check, and five indexes present | Not executed |

## Preflight evidence

- Read-only transaction: confirmed `on`; transaction rolled back.
- Migration ledger: no candidate table found. Catalog reconciliation is recorded in the release package.
- Data: aggregate-only counts/sizes were captured; no row-level data was returned.
- Baseline: 0028 frozen-total check and canonical partial payment uniqueness are present; legacy global activity index is absent; configured history cutoff has one non-null setting row.
- Safety: financial execution flags are absent, which code treats as deny; no provider interaction occurred.
- Health: production health endpoint returned healthy with database connected.

## Execution evidence placeholders

- Exact sanitized execution client/command:
- 0027 transaction start/commit or rollback:
- 0027 post-catalog result:
- 0029 transaction start/commit or rollback:
- 0029 post-catalog result:
- Startup / health / smoke results:
- Observation start/end and anomalies:
- Backup/PITR evidence reference:
- Final approver and decision:

## Recovery decision

There is no approved schema rollback in this package. If either migration fails, stop, preserve the error and catalog evidence, and choose a separately reviewed forward repair. Application rollback is permissible only after verifying compatibility with the actual catalog state. Do not drop newly created schema objects or delete data as an improvised rollback.
