# Production Database Migration Preflight Checklist

- **Status:** Approved reusable checklist
- **Governing Standard:** [CTX-DB-001](../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md)

Complete with evidence references. Do not record credentials, connection strings, customer data, or provider identifiers.

## Identity and scope

- [ ] Change/incident identifier, business reason, environment, repository, branch, and operator recorded.
- [ ] Current application SHA and expected post-migration application SHA recorded.
- [ ] Migration filenames, SHA-256 hashes, dependencies, execution order, and required approvals recorded.
- [ ] Current and target schema inventory recorded; no unreviewed migration is included.

## Ledger and catalog

- [ ] Ledger existence, structure, and relevant entries recorded.
- [ ] Reconciliation status is explicit if no ledger exists.
- [ ] Partial-object, renamed-object, index-definition, constraint-definition, default, and nullability checks pass.
- [ ] Table sizes, aggregate row counts, orphan checks, and data-integrity evidence are attached where applicable.

## Availability and execution behavior

- [ ] Statement timeout, lock timeout, transaction behavior, expected duration, and maintenance window recorded.
- [ ] Lock risk, concurrent-index behavior, backfill impact, nullability impact, constraint validation, and foreign-key integrity reviewed.
- [ ] Destructive operation posture, rollback feasibility, forward-repair plan, and backup/PITR posture recorded.
- [ ] Compatibility before and after migration is proven.

## Safety and approval

- [ ] Financial/provider controls are confirmed fail-closed before execution.
- [ ] Health endpoint, focused smoke routes, and observation period are defined.
- [ ] Approval identities, exact authorization boundary, and final go/no-go decision are recorded.

**Stop:** any unknown ledger state, checksum mismatch, partial object, unsafe lock risk, failed integrity check, or ambiguity is a no-go.
