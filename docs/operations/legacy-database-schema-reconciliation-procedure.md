# Legacy Database Schema Reconciliation Procedure

- **Status:** Approved procedure; no reconciliation is authorized by this document
- **Governing Standard:** [CTX-DB-001](../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md)

## Purpose

Adopt a durable migration ledger for an existing database that has historical schema effects but no reliable execution record. This is a controlled reconciliation, not a filename-based backfill.

## Method

1. Obtain approval for read-only catalog and aggregate integrity audit only.
2. Capture repository filenames and immutable SHA-256 checksums.
3. For every candidate migration, verify object by object: tables, columns, types, defaults, nullability, indexes and predicates, constraints and definitions, foreign keys, and required backfill evidence.
4. Classify each migration as **fully applied**, **partially applied**, **not applied**, **incompatible drift**, or **cannot determine**.
5. Identify selective or out-of-order historical application explicitly. Do not infer execution from numbering alone.
6. Treat modified historical files and uncertain results as escalation conditions.
7. Produce an immutable reconciliation report and obtain approvals before any future ledger write.

## Ledger adoption controls

Historical migrations may be recorded without rerunning SQL only when every expected schema effect is proven and the approved reconciliation plan identifies the evidence, historical checksum, approver, and classification. A ledger row MUST NOT be written during an audit-only phase. Reconciliation rollback means reversing only the approved ledger-adoption record if it is safe; it does not alter production schema.

## Future transition

The migration runner and ledger design remain a pending architecture decision. The transition must preserve historical uncertainty rather than fabricate automated history.
