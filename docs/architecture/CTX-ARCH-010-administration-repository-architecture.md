# CTX-ARCH-010 — Administration Repository Architecture

- **Status:** **DRAFT — NOT YET APPROVED FOR IMPLEMENTATION**
- **Version:** 0.1
- **Date:** July 22, 2026
- **Owner:** Architecture and Operations Governance
- **Related discovery:** [Administration Repository Discovery and Requirements](./administration-repository-discovery-and-requirements.md)
- **Related architecture:** [CTX-ARCH-009 — Operations Library and Knowledge Management Architecture](./CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- **Dependency:** Proposed future CTX-STD-002 — Documentation Metadata, Lifecycle, Authority and Relationship Standard
- **Supersedes:** None
- **Superseded by:** None

## 1. Executive summary

The Administration Repository is the proposed derived operational control plane for publishing repository-governed knowledge into the future Operations Library. It is not the authoritative documentation repository, a replacement for Git, a CMS, a generic application database, or an implementation authorization.

Git remains authoritative for governed content, review history, and approved changes. The Administration Repository may later retain verified publication manifests, document inventory, derived metadata, authorization/classification metadata, relationship and search metadata, publication state, audit evidence, and effective publication-set identity. Every derived record must preserve source repository, immutable source reference, path, checksum, provenance, freshness, and lifecycle/conflict state.

This draft defines responsibility boundaries and constraints only. It does not select a runtime technology, database schema, storage system, API, route, job, credential, synchronization transport, search engine, or UI.

## 2. Context and problem statement

CTX-ARCH-009 proposes a read-only Operations Library while retaining the repository as authoritative. That library needs an operationally trustworthy way to know which source set is published, what metadata is derived versus declared, whether content is stale, what a user may discover, and how to recover from a failed publication. Git alone governs content but is not a runtime publication-control plane; a runtime copy alone must not govern content.

The Administration Repository addresses this middle boundary. It preserves a reliable, auditable representation of a selected published set without creating a competing authoring system or duplicating the repository’s authority.

## 3. Goals

- Preserve Git as the authority for governing documents and history.
- Define a derived operational boundary for publication manifests, inventory, metadata, classification, relationships, search state, and audit evidence.
- Support deterministic current/effective published-set identity, stale-state disclosure, rollback selection, and rebuilding of derived records.
- Support least-privilege authorization before discovery, rendering, search, relationships, export, or future AI retrieval.
- Separate authoritative content, derived operational metadata, user convenience data, audit evidence, and future external data.
- Provide a scalable governance foundation for Operations Library, restricted collections, evidence packages, and future AI grounding.

## 4. Non-goals and exclusions

- Replacing the Git repository, source review, pull-request workflow, or repository history.
- Writing, editing, approving, or merging governed documents through the Administration Repository.
- Selecting a database, storage bucket, search service, synchronization method, repository provider API, or deployment topology.
- Creating application routes, APIs, schemas, migrations, UI, search indexes, AI, or document ingestion.
- Storing raw GeoHaul telemetry, operational metrics, financial data, personal information, environmental calculations, or unsupported grant/investor claims.
- Treating an Administration Repository backup as replacement backup/recovery for the Git repository.

## 5. Architectural principles

1. **Content authority remains in Git.** Derived state cannot amend source content, approval, or history.
2. **Publication is a verifiable selection.** A published set is defined by immutable source-ref and checksum evidence, not by “latest file” behavior.
3. **Metadata is provenance-bearing.** Every derived field identifies whether it is declared, reviewed-derived, candidate, incomplete, or conflicted.
4. **Authorization precedes discovery.** An unauthorized user must not learn restricted existence through titles, counts, snippets, relations, caches, or future retrieval.
5. **A stale set is not current.** Failure, partial state, checksum mismatch, revocation, and stale state remain visible and fail safe.
6. **Recovery rebuilds derivatives.** Restore selected manifests and rebuild from verified repository content; never fabricate source state.
7. **Operational control is not authoring.** Publishing, classification, and metadata correction are governed operational actions with evidence, not document editing.

## 6. Responsibility boundaries

| Domain | Git repository | Administration Repository | Operations Library |
| --- | --- | --- | --- |
| Content and history | Authoritative Markdown, attachments, commits, review/approval changes | Source reference only; no writable governing copy | Reads only authorized published derivative |
| Authority/lifecycle | Governing hierarchy and source-declared values | Records reviewed normalization/conflict evidence | Displays source/declaration/provenance and warnings |
| Publication | Source candidate | Selects and records verified manifest/effective set | Consumes selected set; cannot publish |
| Metadata/relationships/search | Declared inputs and links | Derived, provenance-bearing, authorization-aware records | Queries and displays authorized data |
| Audit/recovery | Git change history | Publication/synchronization/access evidence and rebuild instructions | No authority to modify evidence |
| User preferences | None | Future optional convenience records | Displays without affecting authority |

## 7. Conceptual record model

The following are conceptual records; no schema is authorized.

| Concept | Required identity / purpose | Authority boundary |
| --- | --- | --- |
| Source document reference | Repository identity, protected source reference, commit, path, checksum, document identifier if declared | Points to authority; does not copy or rewrite it. |
| Publication manifest | Immutable manifest identifier, source ref, document list/order, checksums, policy/version, actor/release evidence, timestamp, outcome | Defines a published derivative set, not source approval. |
| Effective publication set | Audience/scope, selected manifest, effective-from/to, freshness, revocation/rollback relation | Exactly one current set per defined scope unless policy says unavailable. |
| Inventory record | Source identity, parser/inventory state, metadata completeness, source timestamps | Never infers approval from existence. |
| Derived metadata | Type, status, lifecycle, tags, owner, approver, authority, classification, confidence/provenance | Source and CTX-STD-002 govern conflicts. |
| Relationship record | Type, endpoints, declared/reviewed-derived/candidate provenance, review state | Links alone are not authoritative. |
| Search record | Authorized index fields, manifest/index version, freshness/completeness | Not an authority and never bypasses access policy. |
| Audit record | Publication/sync/access/security event, actor, time, outcome, error reference | Redacted, minimum-necessary, no document-body logging. |
| User preference | Bookmark, pin, recently viewed, collection preference | Horizon 2 only; cannot influence authority. |

## 8. Publication identity, lifecycle, and effective-set behavior

Publication identity must be immutable and include at least repository, source ref, commit, content checksums, manifest identity, publication policy version, publisher evidence, and outcome. The exact branch, tag, signed manifest, or protected release reference remains a later decision.

The Administration Repository must distinguish source presence from publication state. A document may exist in Git but not be published; be approved but not yet effective; be published but superseded; or be historical and intentionally retained. It must not decide these meanings independently. A revised CTX-ARCH-009 and future CTX-STD-002 must define the state matrix, transition authority, metadata/body conflict handling, and equal-authority conflict escalation before implementation.

For a defined audience and scope, an effective set must be either a single verified manifest or explicitly unavailable/stale. Partial synchronization cannot silently become current. Rollback selects a prior verified manifest and records the reason; it does not rewrite Git history or reclassify source content.

## 9. Metadata, classification, relationships, and collections

Derived metadata is permitted only with provenance, confidence/review state, source manifest, and freshness. Declared source metadata remains authoritative unless the future standard defines a documented exception. A conflict must be surfaced for review, not silently resolved by parser or operator preference.

Classification and authorization metadata may support category, collection, document, and future audience controls. It must be evaluated before inventory browsing, autocomplete, search facets/counts, snippets, relationship navigation, history, export, cache access, and future AI retrieval. Denied content should not disclose existence.

Collections are curated, non-duplicative derived groupings—such as Production Migration, Disaster Recovery, Release Evidence, Investor Due Diligence, Grant Evidence, Sustainability Methodology, GeoHaul Integration, or Security Operations. They are a future Horizon 2 capability. A collection must retain membership provenance, owner, lifecycle, scope, manifest snapshot, and access policy; it must not change document authority or copy content.

## 10. Search and Operations Library boundaries

The Administration Repository may later maintain authorization-aware search metadata and relationship graph records. The Operations Library is the reader and navigation surface; it must never be its own publishing authority. Search ranking must not override the documentation hierarchy, omit governing material without disclosure, or expose restricted metadata. Semantic search and AI are explicitly excluded until separately architected and authorized.

## 11. Audit, synchronization, backup, and disaster recovery

Future publication and synchronization events require durable, redacted evidence: source reference, manifest identity, actor/release authority, timing, outcome, checksums, freshness, selected effective set, rollback/revocation, and error reference. Access to restricted content, exports, and denied attempts require security-significant audit treatment. Ordinary browsing telemetry must be minimized and separated from audit evidence.

Derived records should be rebuildable from a verified Git source set plus retained manifests and approved policy/configuration evidence. Backup and disaster recovery must protect the Administration Repository’s operational evidence and restore ability, but never claim to replace Git repository backup, Git history, or source review. A future recovery procedure must cover repository unavailable, manifest corruption, partial synchronization, index loss, stale set, unauthorized classification change, emergency unpublish, and restore/rebuild verification.

## 12. Security and authorization constraints

- Use server-side authorization and least privilege for every derived record and reader operation.
- Keep repository credentials and provider tokens server-side; never store them in document metadata, client bundles, logs, snippets, or manifests.
- Treat Markdown, attachments, links, metadata, and relationship labels as untrusted inputs until sanitized and authorized by the respective future design.
- Restrict caches by authorization scope and effective manifest; prevent cross-user leakage.
- Preserve no-existence-disclosure for denied documents and collections.
- Do not log document contents, secrets, or unnecessary personal information in publication, synchronization, or audit events.

## 13. Operational ownership

Before implementation, governance must define a content authority owner, publication operator, metadata/classification steward, security approver, audit reviewer, incident owner, and release authority. In the current single-operator stage, any overlap must be explicit, time-bound where practical, and evidenced. Emergency unpublish/revocation needs a controlled authority, evidence, recovery path, and post-event review; it cannot silently alter source content.

## 14. Implementation constraints and future roadmap

| Horizon | Intended outcome | Constraint |
| --- | --- | --- |
| 0 — Governance normalization | Approve CTX-STD-002, publication state matrix, source-ref contract, conflict and classification policy. | No runtime repository yet. |
| 1 — Publication foundation | Authorized manifest/inventory/derived-metadata design and controlled implementation. | No direct editing, public access, AI, or arbitrary attachments. |
| 2 — Operations Library integration | Authorized Admin read surface, safe rendering, controlled search, collections, user preferences. | Reader cannot publish or bypass authorization. |
| 3 — Governance maturity | Restricted collections, exports, historical views, audit packages, richer relationships. | Must preserve source authority and access controls. |
| 4 — Intelligent evidence | Separately approved AI grounding, external evidence collections, sustainability methodology references. | No autonomous action, raw telemetry storage, or unsupported claims. |

The Horizon 1 foundation is locally implemented under a separate controlled implementation authorization. This draft remains unapproved: it does not authorize production adoption, public access, document editing, AI, search, or publication automation. Any material implementation finding requires a synchronized revision and separate review/approval decision.

## 15. Dependencies, unresolved decisions, and gates

Dependencies: revised CTX-ARCH-009; its review conditions; CTX-STD-002; future publishing/authorization/search ADRs; security review; operational ownership; and a controlled test strategy.

Unresolved decisions: authoritative published source ref; manifest format/signature; runtime technology and storage; synchronization transport/frequency; metadata conflict authority; classification vocabulary; search engine; credential model; retention; backup/PITR posture; recovery objectives; monitoring; and collection policy.

Implementation remains prohibited until architecture review/approval, the relevant standard and ADRs, security/access review, metadata/lifecycle contract, operational ownership, implementation scope, and tests are separately authorized. Production adoption remains prohibited until authorized implementation, security/authorization/sanitization/divergence/recovery/accessibility/performance testing, operational runbooks, release authorization, observation, and closure are complete.

## 16. References

- [Administration Repository Discovery and Requirements](./administration-repository-discovery-and-requirements.md)
- [CTX-ARCH-009](./CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- [CTX-ARCH-009 Review](./reviews/CTX-ARCH-009-architecture-review.md)
- [Documentation Library](../README.md)
- [CTX-STD-001](../standards/cretexchange-platform-standards.md)
- [Development Protocol](../development-protocol.md)
- [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md)
- [CTX-OPS-001](../operations/CTX-OPS-001-production-release-checklist.md)
