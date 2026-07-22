# Database Migration Release Package Template

- **Status:** Reusable planning template
- **Governing Standard:** [CTX-DB-001](../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md)

## Change summary

- Business reason and affected routes:
- Repository, branch, commit, migration files, and SHA-256 hashes:
- Dependency order, current schema, and target schema:

## Technical assessment

- SQL effect summary; data, backfill, and destructive impact:
- Lock, timeout, transaction, and concurrent-index behavior:
- Application compatibility before and after migration:
- Financial/provider safety posture:

## Controlled release plan

- Production preflight and expected catalog evidence:
- One-at-a-time execution order and verification plan:
- Health, smoke tests, observation period, and release record:
- Rollback/forward-repair plan, risks, approvals, and final authorization status:

**DOCUMENTATION EXAMPLE ONLY — NOT AUTHORIZATION TO EXECUTE:** release packages may cite the missing 0027 and 0029 incident only to illustrate a controlled repair. They may not authorize execution, re-run 0028, or enable financial execution.
