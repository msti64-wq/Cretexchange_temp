# Administration Repository Discovery and Requirements

- **Status:** Supporting discovery for CTX-ARCH-010; not an implementation specification or authorization
- **Date:** July 22, 2026
- **Related architecture:** [CTX-ARCH-010 — Administration Repository Architecture](./CTX-ARCH-010-administration-repository-architecture.md)
- **Related Operations Library architecture:** [CTX-ARCH-009](./CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- **Evidence boundary:** Repository documentation and source inspection only. No database, provider, Railway, deployment, or production action occurred.

## 1. Purpose and evidence labels

This discovery distinguishes the repository’s governing documentation from the future derived operational records needed to publish it safely. It does not define a database, service, API, route, synchronization job, search index, storage location, credential, or UI.

| Label | Meaning |
| --- | --- |
| **Verified repository fact** | Directly observed in the current repository. |
| **Inference** | A proposed architectural conclusion drawn from repository facts. |
| **Unknown / decision required** | Must be resolved by later standards, ADRs, design, or controlled validation. |

## 2. Existing authority and knowledge controls

**Verified repository fact.** [docs/README.md](../README.md) is the canonical entry point and establishes precedence among Project Context, CTX standards, CTX architecture, Product Decisions, the Development Protocol, and release governance. Git-reviewed repository documents currently hold the governing content and history.

**Verified repository fact.** CTX-ARCH-009 proposes a read-only Admin Operations Library that may use a published content set and derived metadata, search, relationships, and freshness state, while preserving repository path, commit, and checksum. Its independent review identifies unresolved publication-state semantics, source-reference identity, conflict handling, restricted discovery, and operational ownership as approval-blocking gaps.

**Inference.** A distinct Administration Repository concept is useful only as a derived governance-control plane. It must not become a second authoring system, a competing source of truth, or a silent repository mirror.

## 3. Responsibility split

| Concern | Git repository | Administration Repository | Operations Library |
| --- | --- | --- | --- |
| Governing Markdown, attachments, Git history, review/approval changes | **Authoritative** | Must not replace or edit | Reads approved published derivative only |
| Document identity and source version | Authoritative path, commit, and content | Retains derived source references/checksums | Displays provenance |
| Publication manifest and effective published set | Source input | **Derived operational record and control evidence** | Consumes the selected verified set |
| Metadata normalization, classification, typed relationships | Declared metadata remains authoritative where present | Reviewed derived metadata with provenance/status | Displays authorized derived values and warnings |
| Search metadata | No runtime role today | Derived, authorization-aware index metadata | Queries only authorized results |
| Audit, synchronization, publication history | Git history is content-change evidence | Derived operational audit/evidence | Does not become audit authority |
| Lifecycle/authority conflict resolution | Repository hierarchy and approved standard govern | Records reviewed determination/evidence only | Shows outcome and conflict warnings |

## 4. Candidate Administration Repository records

The following are candidates for derived operational records, not authoritative document replacements:

| Record | Purpose | Boundary |
| --- | --- | --- |
| Publication manifest | Immutable identity of a selected published set: repository/ref/commit, ordered paths, checksums, publisher evidence, status, and timestamp. | Does not rewrite Git history or declare a document approved by itself. |
| Document inventory | Observed paths, identifiers, types, source commit/checksum, parser state, and metadata completeness. | Does not infer missing approval or authority. |
| Derived metadata | Normalized title, status, lifecycle, tags, owner/approver, review dates, authority/classification with source/provenance. | Source body and future CTX-STD-002 control conflicts. |
| Authorization/classification metadata | Collection/category/document visibility policy references and evaluation state. | Must not expose protected existence in unauthorized discovery. |
| Relationship graph | Declared, reviewed-derived, and candidate relationships with provenance and review status. | Markdown links alone are not authoritative relationships. |
| Search metadata | Authorized searchable fields, index version, source manifest/checksum, completeness/freshness state. | Not a content authority and never bypasses authorization. |
| Publication and synchronization history | Attempt/outcome, stale/failed/rolled-back state, error reference, actor/release evidence. | Redacted; no document body or credentials. |
| Effective publication set | The single selected manifest that a reader may treat as current for a defined audience. | Must be deterministic, auditable, and revocable. |

## 5. Information that must not be duplicated as authority

- Governing document content as a writable competing copy.
- Git commit, branch, tag, PR, review, or approval history as an independently editable substitute.
- Unreviewed lifecycle, authority, approval, or supersession assertions.
- Secrets, repository credentials, tokens, private keys, or unredacted sensitive documents in logs or search snippets.
- Raw GeoHaul telemetry, operational analytics, personal data, financial data, or environmental calculations.
- A generic user-generated knowledge base, CMS drafts, comments, or in-app edits in the initial scope.

## 6. Publication, rollback, and recovery findings

**Verified repository fact.** No implementation currently defines a runtime document publisher, immutable published-set manifest, document inventory, derived metadata store, document index, or publication rollback mechanism.

**Inference.** The Administration Repository should retain enough immutable derived evidence to rebuild its metadata/search state from the selected Git source set, but it must not be treated as the backup or disaster-recovery replacement for the Git repository. Recovery must be able to select a previously verified manifest and rebuild derivatives; it must not fabricate content or source approval.

## 7. Requirements catalogue

| ID | Requirement | Classification |
| --- | --- | --- |
| AR-001 | Preserve Git repository authority for governed content and history. | MUST |
| AR-002 | Maintain immutable, source-ref/checksum-linked publication manifests and effective-set identity. | MUST |
| AR-003 | Record derived metadata, classification, relationship, and search provenance distinctly from source-declared content. | MUST |
| AR-004 | Enforce authorization before inventory discovery, search, relationship navigation, and future AI retrieval. | MUST |
| AR-005 | Retain publication/synchronization/audit state without logging document bodies, credentials, or unnecessary personal data. | MUST |
| AR-006 | Support stale, failed, partial, revoked, and rollback publication states without claiming currentness. | MUST |
| AR-007 | Permit future collections, favorites, and user convenience data without changing authority ranking. | SHOULD |
| AR-008 | Permit an implementation to rebuild derived data from a verified Git source set and retained manifest evidence. | SHOULD |
| AR-009 | Select an implementation technology, schema, storage location, search engine, or synchronization transport. | DEFERRED |
| AR-010 | Provide direct document editing, public access, AI answers, telemetry storage, or environmental calculations. | OUT OF SCOPE |

## 8. Dependencies and open questions

CTX-ARCH-010 depends on a revised CTX-ARCH-009 and the proposed **CTX-STD-002 — Documentation Metadata, Lifecycle, Authority and Relationship Standard**. It also needs later decisions on published source ref, manifest structure, metadata conflict rules, classifier authority, publication actor, search technology, credential model, retention, backup expectations, disaster recovery, and operational ownership.

## 9. Discovery conclusion

The Administration Repository should be a future derived governance repository, not a renamed Git mirror or a content-management system. Its distinctive responsibility is to make a selected source set operationally publishable, traceable, authorization-aware, auditable, recoverable, and consumable by the Operations Library while preserving Git’s authority.

## References

- [Documentation Library](../README.md)
- [CTX-ARCH-009](./CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- [CTX-ARCH-009 Review](./reviews/CTX-ARCH-009-architecture-review.md)
- [CTX-STD-001](../standards/cretexchange-platform-standards.md)
- [Development Protocol](../development-protocol.md)
