# Documentation Governance Discovery and Requirements

- **Status:** Supporting discovery for CTX-STD-002; not an approval, implementation authorization, or production-adoption authorization
- **Date:** July 22, 2026
- **Related standard:** [CTX-STD-002 — Documentation Governance, Metadata, Lifecycle, Authority, and Relationship Standard](./CTX-STD-002-documentation-governance-metadata-lifecycle-authority-and-relationships.md)
- **Related architectures:** [CTX-ARCH-009](../architecture/CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md) and [CTX-ARCH-010](../architecture/CTX-ARCH-010-administration-repository-architecture.md)
- **Evidence boundary:** Repository documentation and history inspection only. No application, database, provider, Railway, deployment, or production action occurred.

## 1. Purpose and evidence labels

This record captures the repository facts and governance needs that support a cross-product documentation standard. It does not select a metadata parser, publication mechanism, repository provider, runtime store, search engine, or application implementation.

| Label | Meaning |
| --- | --- |
| **Verified repository fact** | Directly observed in the current repository documentation. |
| **Inference** | A proposed standard-level conclusion drawn from documented facts. |
| **Unknown / decision required** | Must be settled by a future ADR, architecture, approval, or controlled implementation design. |

## 2. Documents and families inspected

The discovery inspected the authoritative entry point and hierarchy in [docs/README.md](../README.md), [Project Context](../project/project-context.md), [CTX-STD-001](./cretexchange-platform-standards.md), [CTX-DB-001](./CTX-DB-001-database-migration-and-schema-governance-standard.md), [CTX-DEP-001](./CTX-DEP-001-production-deployment-protocol.md), [CTX-OPS-001](../operations/CTX-OPS-001-production-release-checklist.md), the [Development Protocol](../development-protocol.md), Product Decisions, the Architecture Library, ADR-031, the CTX-ARCH-008 approval/verification records, CTX-ARCH-009 and its discovery/review, CTX-ARCH-010 and its discovery, release and migration records, runbooks, research, business, UX, and archived governance documents.

**Verified repository fact.** The repository contains specifications, review artifacts, approval records, ADRs, release evidence, procedures, product decisions, research, business, UX, archive, and operational documents. They have different purposes and cannot safely share one undifferentiated status label.

## 3. Existing authority hierarchy

**Verified repository fact.** `docs/README.md` is the canonical entry point. Its stated decision hierarchy begins with Documentation Library, Project Context, CTX standards, applicable CTX-ARCH documents, Product Decisions, the Development Protocol, and production-release governance. It says earlier documents take precedence when guidance conflicts.

**Verified repository fact.** CTX-STD-001 establishes platform-wide engineering standards. CTX-DB-001, CTX-DEP-001, and CTX-OPS-001 govern their stated specialized controls without authorizing a change by themselves. CTX-ARCH-009 and CTX-ARCH-010 are explicitly draft and do not authorize implementation.

**Inference.** A reusable standard must preserve that hierarchy while making governing scope, state, supersession, and conflict evidence explicit enough for future derived publication and discovery systems.

## 4. Metadata and lifecycle findings

| Finding | Evidence | Governance implication |
| --- | --- | --- |
| Metadata varies by family. | Standards use document ID, version, status, owner, product, and effective date; architecture drafts use status, date, owner, related documents, and supersession fields; release documents use operational evidence. | Existing formats cannot be silently parsed into one asserted lifecycle model. |
| Status terms are not uniform. | Documents use approved, draft, conditionally approved, not authorized, active, pending, closed, historical, and archived. | Development, approval, publication, effectivity, retention, implementation authorization, and production adoption require independent dimensions. |
| Repository presence is already distinguished from approval in several documents. | CTX-ARCH-009/010 state that drafts in the repository do not authorize implementation. | The standard must prevent Git presence or commit history from implying approval, publication, effectivity, or authorization. |
| Existing links are primarily navigational. | Markdown relative links and reference lists are widely used. | Typed governance relationships need a controlled vocabulary and provenance; hyperlinks alone are insufficient. |
| Approval and release records are event evidence. | CTX-ARCH-008 approval and migration-release records document an event rather than a reusable governing specification. | Event records need document-family extensions rather than the same lifecycle as a standard. |

## 5. Principal gaps and inconsistencies

The independent CTX-ARCH-009 review identified five approval-blocking governance gaps: no deterministic lifecycle/publication matrix; no immutable published-source contract; no metadata/body or equal-authority conflict protocol; no authorization-before-discovery rule for restricted content; and no operational ownership model. It also identified metadata representation, relationship provenance, attachment policy, search acceptance, accessibility fallback, and audit-detail decisions as later implementation gates.

**Verified repository fact.** No current runtime Operations Library, Administration Repository, publication manifest, search index, document renderer, repository synchronization service, or generic document audit model exists in the inspected repository.

**Inference.** CTX-STD-002 can define policy outcomes and evidence requirements without selecting implementation technology or representing the unimplemented derived systems as current.

## 6. Security, privacy, and authorization findings

Existing standards and architecture records require least privilege, server-side authorization, secret non-disclosure, safe logs, and fail-closed behavior. CTX-ARCH-009 and CTX-ARCH-010 specifically identify restricted search snippets, facets, autocomplete, relationship edges, caches, exports, and future AI retrieval as potential disclosure paths.

**Inference.** Classification must be minimal, derived metadata must inherit source protection, and authorization must occur before any discovery signal—not merely before document rendering. Classification labels are governance metadata and cannot themselves grant access.

## 7. Requirements allocated to CTX-STD-002

| ID | Requirement | Disposition |
| --- | --- | --- |
| DG-001 | Define durable terminology and independent lifecycle dimensions. | MUST |
| DG-002 | Define precedence, metadata authority, conflict escalation, and supersession rules. | MUST |
| DG-003 | Require immutable repository/commit/checksum evidence for governed publication. | MUST |
| DG-004 | Define minimum authored, derived, family-specific, and prohibited metadata. | MUST |
| DG-005 | Require authorization before inventory, search, relationships, collections, exports, caches, and future AI retrieval. | MUST |
| DG-006 | Define roles, evidence, emergency withdrawal, audit, security outcomes, and legacy normalization. | MUST |
| DG-007 | Select a manifest serialization, storage, search, renderer, publication transport, or AI provider. | DEFERRED |

## 8. Decisions deferred beyond this standard

The following need future ADRs or architecture work: repository publishing model; manifest format/signature; metadata serialization/storage; restricted-content authorization design; search architecture; rendering and attachment sanitization design; Administration Repository persistence; immutable collection snapshots/evidence packages; and AI retrieval/grounding. CTX-ARCH-009 and CTX-ARCH-010 require separate revision and approval before implementation authorization.

## 9. Legacy-adoption concern

Many authoritative and historical documents predate a normalized metadata model. A bulk rewrite could alter historical meaning or fabricate approval/classification evidence. The standard should therefore require compliance for newly approved governed documents after adoption, normalize materially revised and high-authority documents first, and permit derived minimum metadata for unmodified historical records while surfacing missing critical facts.

## 10. Discovery conclusion

CTX-STD-002 is warranted as a cross-cutting governance standard. It should supply the lifecycle, authority, metadata, classification, relationship, publication, and conformance rules that CTX-ARCH-009 and CTX-ARCH-010 intentionally lack. This discovery neither approves those architectures nor authorizes any Administration Repository, Operations Library, publication, search, AI, database, API, or runtime implementation.

## References

- [Documentation Library](../README.md)
- [CTX-STD-001](./cretexchange-platform-standards.md)
- [Development Protocol](../development-protocol.md)
- [CTX-ARCH-009](../architecture/CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- [CTX-ARCH-009 Review](../architecture/reviews/CTX-ARCH-009-architecture-review.md)
- [CTX-ARCH-010](../architecture/CTX-ARCH-010-administration-repository-architecture.md)
