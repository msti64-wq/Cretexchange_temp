# 0027 and 0029 Production Migration Preflight Package

> **PREFLIGHT ONLY — NOT AUTHORIZATION TO EXECUTE**

This package records the controlled-production preflight for the two missing additive migrations below. It is a release-planning and evidence package only. It does not authorize DDL, deployment, provider access, financial execution, or an application change.

| Migration | Repository artifact | SHA-256 | Production catalog state at preflight |
| --- | --- | --- | --- |
| 0027 | `migrations/0027_add_rewards_period_controls.sql` | `5f8d2ba7c56c8878c7dfdac4535529f3f8c8fc9626a7d01cab145ff2033c052f` | Entirely absent; no partial objects found. |
| 0029 | `migrations/0029_add_canonical_financial_payment_attempts.sql` | `a9f5501ea544fdb0717e9f36c08cf65b8680c94fd353b9426acd0cf040c3dbf6` | Entirely absent; no partial objects found. |

Execute only after separate Phase 3 authorization and after every stop condition in the attached checklist is rechecked immediately before DDL.

## Package contents

- [Migration Release Package](./migration-release-package.md)
- [Production Preflight Checklist](./production-preflight-checklist.md)
- [Draft Release Record](./draft-release-record.md)
- [Phase 3 Execution Runbook](./phase-3-execution-runbook.md)
- [Schema Verification Query Appendix](./schema-verification-query-appendix.md)
- [Smoke-Test Checklist](./smoke-test-checklist.md)
- [Risks and Rollback Appendix](./risks-and-rollback-appendix.md)

## Governing documents

- [CTX-DB-001](../../../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md)
- [CTX-DEP-001](../../../standards/CTX-DEP-001-production-deployment-protocol.md)
- [CTX-OPS-001](../../CTX-OPS-001-production-release-checklist.md)
- [CTX-ARCH-007](../../../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md)
- [PD-051](../../../product/PD-051-driver-activity-and-payment-lifecycle.md)
