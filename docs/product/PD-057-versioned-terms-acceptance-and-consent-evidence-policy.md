# PD-057 — Versioned Terms Acceptance and Consent Evidence Policy

**Status:** Active
**Owner:** V8 Laboratories
**Effective Date:** July 2026

## Decision

`terms_acceptances` is the sole authority for current-version acceptance. The legacy Driver and Owner terms booleans are compatibility and historical projections only; they must never be inferred or backfilled as proof of current acceptance.

Drivers and Owners without qualifying ledger evidence must accept the current required documents before readiness that depends on terms acceptance is granted. Ledger unavailability fails closed and is distinct from ordinary nonacceptance.

Each immutable ledger record preserves the exact terms type, language, storage key, version, cryptographic content hash, acceptance timestamp, and governed audit metadata. Existing acceptance evidence is never overwritten by a repeat request.

## Language-specific acceptance

- A complete current English bundle or a complete current Spanish bundle independently satisfies readiness.
- Every required role document in a qualifying bundle must match the exact language, storage key, version, and content hash.
- Mixed-language partial evidence does not satisfy readiness.
- Client/interface locale controls only legal-document display and the language of a newly accepted bundle; it does not revoke or select operational readiness.
- A user may later accept the other complete supported bundle, creating additional immutable evidence without replacing the original.

Required role documents remain Driver Terms, Privacy Policy, and Driver Agreement; and Owner Terms, Privacy Policy, and Owner Agreement. A future current version or hash that requires reacceptance invalidates prior readiness proof. English and Spanish are separately published documents; this policy does not claim they are cryptographically identical. Authoritative legal content and translations require appropriate legal approval before pilot use.

## Canonical content serialization v1

The published hash is `sha256:` plus the lowercase SHA-256 digest of UTF-8 bytes from `JSON.stringify` of the following ordered object: `schemaVersion`, `id`, `language`, `storageKey`, `version`, `effectiveAt`, `title`, `subtitle`, `intro`, `sections`, and `acceptanceText`. Every section is normalized to ordered `heading`, ordered `body`, and ordered `bullets`, with `bullets: []` when none are displayed. Strings and array order are preserved exactly; `contentHash` itself is excluded. No trimming, translation, or other transformation occurs. Correcting the pre-ledger symbolic hash metadata does not change the legal version or authorize acceptance backfill.

Registry verification and insertion of a selected-language current bundle, together with all missing acceptance rows, are one authoritative transaction. A legacy boolean projection occurs only after that transaction and may not invalidate or replace immutable ledger evidence. Health and governed migration execution use structural catalog verification and fail closed for absent, partial, incompatible, or inaccessible ledger schema.

## Scope and guardrails

Authoritative legal content remains separately governed and requires appropriate legal review. This policy does not alter legal text, financial execution, payment, wallet, settlement, or billing behavior.

**Related:** [CTX-ARCH-003](../architecture/driver-operations-architecture.md), [CTX-DB-001](../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md), [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md), and [PD-038](./product-decisions.md#pd-038---strategic-data-governance-principles).
