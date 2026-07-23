# CTX-STD-002 — Documentation Governance, Metadata, Lifecycle, Authority, and Relationship Standard

- **Document ID:** CTX-STD-002
- **Version:** 0.1
- **Status:** **DRAFT — NOT YET APPROVED**
- **Owner:** Documentation and Operations Governance
- **Scope:** CreteXchange, future related V8 Laboratories products, and governed repository documentation
- **Related discovery:** [Documentation Governance Discovery and Requirements](./documentation-governance-discovery-and-requirements.md)
- **Related architectures:** [CTX-ARCH-009](../architecture/CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md), its [independent review](../architecture/reviews/CTX-ARCH-009-architecture-review.md), and [CTX-ARCH-010](../architecture/CTX-ARCH-010-administration-repository-architecture.md)
- **Supersedes:** None
- **Superseded by:** None

## 1. Purpose

This draft standard establishes reusable governance requirements for repository-managed documentation. It defines how governed documents express identity, authority, lifecycle, publication, classification, relationships, history, and conformance without replacing the Git repository as the authoritative source of governed content and history.

It supplies a shared policy foundation for future Operations Library, Administration Repository, search, AI-grounding, evidence, audit, grant, investor, sustainability, GeoHaul, and related-product work. It is a governance standard, not an implementation authorization.

## 2. Status, scope, and exclusions

This document is **DRAFT — NOT YET APPROVED**. It does not adopt a runtime capability, approve CTX-ARCH-009 or CTX-ARCH-010, authorize implementation or production adoption, or change an existing document’s status.

This standard applies, where applicable, to governance documents, platform standards, architecture documents and reviews, approval records, ADRs, implementation-authorization records, production-adoption records, Product Decisions, security/privacy records, procedures, runbooks, release/deployment/incident records, verification/validation records, research, business, UX, evidence/due-diligence, and historical/archived documentation.

This standard does **not** define routes, APIs, database schemas, a Markdown library, a search engine, a publication implementation, repository provider, runtime infrastructure, source-code style, raw business/telemetry data, environmental calculations, public documentation, or AI authorization. It does not replace architecture-specific decisions or become a CMS specification.

## 3. Normative language

The terms **MUST** and **MUST NOT** describe an absolute requirement or prohibition. **SHOULD** and **SHOULD NOT** describe a strong default; a departure requires recorded rationale and accountable owner. **MAY** describes a permitted option. A vague qualifier is not a control unless this standard assigns measurable evidence and an accountable role.

## 4. Governing authority and applicability

The [Documentation Hierarchy](../README.md#documentation-hierarchy), [Project Context](../project/project-context.md), [CTX-STD-001](./cretexchange-platform-standards.md), applicable CTX-ARCH documents, Product Decisions, the [Development Protocol](../development-protocol.md), and applicable release governance remain the current repository authority hierarchy. This standard complements those sources; it does not silently reorder them.

Where this standard is approved, it SHALL govern cross-cutting documentation lifecycle, metadata, publication, classification, and relationship rules. A domain standard, architecture, approval record, or release record governs only within its declared scope and only to the extent it does not conflict with a higher applicable authority.

## 5. Terminology

| Term | Definition |
| --- | --- |
| **Authoritative** | Content that governs a stated scope because the hierarchy, document type, approval/effective evidence, and precedence rules establish it. Authority is not inferred from visibility, recency, or search rank. |
| **Authoritative content** | The governed repository content and approved history that establishes a policy, decision, specification, or record. A derivative may prove provenance but does not replace this authority. |
| **Approved** | A document or decision whose required approver has accepted the identified approval version. Approval alone does not mean published, effective, implementation authorized, or production authorized. |
| **Published** | Included in an identified, immutable publication set for a defined audience after publication controls succeed. Repository presence alone is not publication. |
| **Deployed** | Made available by a runtime deployment. Deployment does not establish publication, approval, effectivity, implementation authorization, or production authorization. |
| **Effective** | Governs its declared scope from its effective time until superseded, withdrawn, expired, or otherwise ended by documented authority. |
| **Current** | The presently applicable effective version for a defined scope. Current is a conclusion of authority/effectivity, not a synonym for newest or published. |
| **Superseded** | Replaced for stated scope by an identified successor under a valid supersession relationship. It may remain published for historical reference. |
| **Historical** | Retained as evidence of prior state or activity and not presented as the current governing instruction. Historical does not necessarily mean archived or superseded. |
| **Archived** | Retained outside normal current discovery according to retention rules. It remains governed and may be accessible to authorized users. |
| **Withdrawn** | Removed from normal availability or effectivity by an authorized safety, legal, security, or correctness action while history and withdrawal evidence are retained. |
| **Rejected** | A proposal, review outcome, or decision explicitly not accepted. It does not govern implementation. |
| **Draft** | A working document not yet approved. It can be visible to authorized reviewers only. |
| **Under review** | Submitted for defined review but not yet finally approved or rejected. |
| **Conditionally approved** | Approved direction subject to explicit unresolved conditions; it is not implementation authorization unless the condition record says so. |
| **Implementation authorized** | A separately evidenced authorization to implement a defined approved scope. It is not production authorization. |
| **Production authorized** | A separately evidenced authorization to adopt a defined implementation in production under release governance. |
| **Governing document** | A document that sets binding policy, architecture, standard, decision, or release control for a declared scope. |
| **Supporting document** | Context, analysis, discovery, runbook, evidence, or guidance that informs but does not independently govern a conflicting decision. |
| **Evidence document** | A record of observed validation, approval, release, incident, or other event. It does not retroactively change governing content. |
| **Publication set** | The immutable selected derivative inventory made available to one defined audience/scope. |
| **Publication manifest** | The immutable evidence record that identifies a publication set, source reference, inventory, checksums, policy, outcome, and rollback relation. |
| **Source reference** | Repository identity plus a source branch/release reference, path, and relevant content identity. |
| **Immutable source reference** | A source reference anchored to an immutable commit and checksums; a mutable branch name alone is insufficient. |
| **Effective version** | The particular version that is currently effective for a defined scope. |
| **Approval version** | The immutable source version explicitly approved. |
| **Classification** | A governance label describing sensitivity and handling requirements. It does not grant access. |
| **Relationship** | A controlled, typed link with source/target identity, direction, provenance, and authority treatment. |
| **Collection** | A curated non-duplicative grouping of existing governed documents. It does not change document authority or access. |
| **Personal view** | A user-specific convenience grouping such as favorites, pins, recent items, or my documents. It is not governance evidence. |
| **Derived metadata** | Metadata extracted, computed, normalized, or operationally recorded from authoritative source evidence. It is not authoritative content unless an approved rule gives a limited field that status. |

Committing content to Git MUST NOT automatically mean that it is approved, published, effective, implementation authorized, or production authorized.

## 6. Lifecycle model

Lifecycle is represented through independent dimensions. An implementation MUST NOT collapse these dimensions into one generic status field.

| Dimension | Valid values | Required evidence |
| --- | --- | --- |
| Development | `draft`, `under_review`, `finalized`, `rejected` | Author/version and review or rejection record where applicable. |
| Approval | `not_required`, `pending`, `conditionally_approved`, `approved`, `rejected`, `revoked` | Approval version, approver/role, timestamp, and approval reference when required. |
| Publication | `repository_only`, `eligible`, `included`, `published`, `stale`, `withdrawn`, `unpublished` | Immutable source reference; manifest, publisher, audience, timestamp, and outcome for included/published states. |
| Effectivity | `not_effective`, `scheduled`, `effective`, `expired`, `superseded`, `withdrawn` | Effective scope/date, governing evidence, and successor/withdrawal reference where applicable. |
| Retention | `active_record`, `historical`, `archived`, `tombstoned`, `deleted_under_retention_rule` | Retention classification and history/tombstone evidence where applicable. |
| Implementation authorization | `not_applicable`, `not_authorized`, `authorized`, `completed`, `revoked` | Defined scope, approver, authorization reference, and timestamp. |
| Production adoption | `not_applicable`, `not_authorized`, `authorized`, `adopted`, `withdrawn` | Approved release/production-adoption record and verification evidence. |

### 6.1 State combinations

| Combination | Permitted? | Rule |
| --- | --- | --- |
| Approved and repository-only | Yes | Approval may precede publication. |
| Published but not effective | Yes | Publication can support review, scheduled effectivity, or authorized history without making content current. |
| Effective then superseded | Yes | The prior effective version remains historical evidence and must identify its successor. |
| Superseded and published | Yes | Historical publication is permitted with a visible non-current warning. |
| Draft visible to authorized reviewers | Yes | It MUST be visibly draft and access-controlled. |
| Approved then withdrawn | Yes | Withdrawal requires controlled evidence; it does not erase repository history. |
| Historical and current for the same scope/time | No | A historical item cannot be default-current for the same scope; time-scoped history may be current only for a past-as-of inquiry. |
| Published without approval | Conditional | Permitted only for document families explicitly allowed to publish unapproved material (for example, an evidence record); it MUST disclose its approval state and cannot be presented as governing. |
| Approval without implementation authorization | Yes | Approval of a standard, architecture, or decision does not itself authorize implementation. |
| Implementation authorization without production adoption | Yes | Implementation can be authorized while production adoption remains blocked. |
| Effective governing specification with approval `pending` | No | A governing specification MUST have required approval evidence before becoming effective. |
| Published item with checksum/source mismatch | No | Normal publication MUST stop or become withdrawn/stale until resolved. |

### 6.2 Transition authority and evidence

| Transition | Minimum authority | Required evidence | Reversal / failure treatment |
| --- | --- | --- | --- |
| Draft → under review | Document owner | Identified review version, scope, reviewer request, timestamp | Return to draft with review disposition retained where material. |
| Under review → approved / conditionally approved / rejected | Approver | Approval version, role, disposition, conditions, timestamp | A new review is required for a changed approval version. |
| Approved → effective | Document owner plus required approver | Effective scope/date and approval reference | Supersede, expire, or withdraw through an evidenced transition. |
| Repository-only / eligible → included / published | Publisher | Immutable source reference, manifest, inventory/checksums, audience, approval/effectivity evidence, timestamp | Publish prior verified manifest or withdraw; never rewrite source history. |
| Effective → superseded | Owner and approver where required | Successor identity, scope, effective relationship, timestamp | Reinstate only by a new evidenced effective transition. |
| Any visible state → withdrawn | Authorized incident responder or records/security authority | Reason, affected publication sets, initiator, timestamp, warning/replacement, follow-up owner | Emergency unpublish may occur first; review and restoration/permanent decision MUST follow. |
| Classification / owner / relationship change | Classification owner, document owner, or reviewer as applicable | Prior/new value, source/provenance, actor, reason, timestamp | Preserve audit history; invalid changes fail closed. |

Under the Single-Operator Startup model, one person MAY exercise multiple conceptual roles, but the record MUST identify each role exercised and the evidence for every transition.

## 7. Document-family extensions

All governed documents use the common foundation, but identical lifecycle requirements do not apply to every family.

| Family | Primary lifecycle expectation | Additional required controls |
| --- | --- | --- |
| Standards, governing architectures, Product Decisions | Approval and effectivity are required before governing a scope. | Owner, scope, approval/effective evidence, review cadence, supersession. |
| ADRs | Decision disposition is required (`accepted`, `rejected`, `deferred`, or equivalent). | Decision version, rationale, consequences, governing links, supersession. |
| Architecture reviews | A review is evidence, not approval. | Reviewed version/source, reviewer, findings, recommendation, timestamp. |
| Approval / implementation / production authorization records | Event record, not a reusable governing specification. | Exact target/version/scope, actor roles, conditions, timestamp, outcome. |
| Runbooks and operating procedures | Approval/effectivity and review date are required when operationally relied upon. | Safety/classification, owner, emergency withdrawal, replacement guidance. |
| Release, deployment, verification, incident records | Historical evidence of an event. | Event time, scope, source identity, operator/reviewer, outcome, retention. |
| Research, business, UX, discovery notes | State and authority disclosure are required; they are supporting unless expressly approved as governing. | Evidence boundary, assumptions, review/expiry where material. |
| Historical / archived records | Preservation and discoverability are controlled by retention state. | Historical context, successor/warning, minimum derived identity where legacy metadata is absent. |

## 8. Authority and precedence

Authority is determined from explicit evidence, in this order: repository authority hierarchy; applicable product/system scope; governing document type; valid approval and effectivity; express precedence declaration; valid supersession; and documented conflict disposition. Filename, folder, recency, modification time, author seniority, UI placement, search ranking, or a derived record MUST NOT independently decide authority.

| Situation | Deterministic rule |
| --- | --- |
| Older governing document versus newer non-governing document | The older governing document controls until validly superseded or changed. |
| Standard versus architecture | The standard controls cross-cutting mandatory governance; architecture controls domain-specific design within those bounds. |
| Architecture versus ADR | The hierarchy and declared scope control. An ADR governs its accepted technical decision, but does not silently override a higher standard or broader architecture without explicit approved change control. |
| Approval record versus approved document | The record proves approval for an identified version/scope; it does not alter the document body. A mismatch invalidates normal effectivity/publication pending escalation. |
| Product-specific versus platform-wide rule | The platform-wide rule controls unless it expressly delegates a bounded product-specific exception. |
| Repository source versus Administration Repository derivative | Repository source controls content and declared governance; derived data records provenance and cannot override it. |
| Search or AI output versus authoritative document | Search and AI are navigation/summaries only and never govern. They MUST disclose source/status uncertainty and conflicts. |
| Two approved documents at equivalent authority | Do not silently select a winner. Flag a conflict, restrict normal publication/effectivity for the affected scope, and escalate to the relevant owner/approver. |

## 9. Metadata model and representation

### 9.1 Canonical fields

| Field group | Required for all governed documents | Family-specific / optional | Authority treatment |
| --- | --- | --- | --- |
| Identity | Document identifier where assigned, title, document family/type, repository path | Product/platform scope, version, tags | Authored identity is authoritative when internally consistent; path/commit/checksum are derived technical facts. |
| Ownership | Document owner or explicit unknown | Author, reviewer, approver, classification owner, records owner | Authored/approved where declared; derived inventory cannot fabricate an owner. |
| Lifecycle | Development and retention state or explicit unknown | Approval, publication, effectivity, implementation, production-adoption states | Governing metadata/evidence controls; unknown is safer than inference. |
| Dates | Created or source-date where available | Updated, effective, review, expiration, approval, publication dates | Source/evidence controls; derived timestamps do not change lifecycle. |
| Governance | Authority level, classification, governing documents | Supersedes/by, approval reference, implementation references, relationships, collection membership | Must have provenance and validation. |
| Publication | None until publication is in scope | Manifest identity, audience, source branch/reference, immutable commit, checksums, publisher, rollback reference | Manifest controls derivative-set evidence only. |
| Retention | Retention category or explicit unknown | Archive/tombstone reason, historical warning | Must preserve prior evidence. |

Document identifier, title, type, repository path, source commit/checksum, owner-or-unknown, classification-or-default, lifecycle disclosure, and relationship provenance form the minimum normalized inventory. A missing value MUST be represented as unknown/incomplete, not invented.

### 9.2 Authored, derived, and prohibited authority

| Metadata class | Allowed representation | Source of authority |
| --- | --- | --- |
| Authored governance metadata | Markdown front matter, controlled document-body metadata, or approved sidecar/manifest declaration | The governing document version and required approval evidence. |
| Publication metadata | Immutable publication manifest and linked source reference | Manifest for set membership/publish outcome; source remains authoritative for content. |
| Derived technical metadata | Inventory, checksums, parser results, link state, freshness, index state | Derived evidence only; must retain provenance. |
| User-preference metadata | Personal-view records | User convenience only; never authority. |
| Search metadata | Authorization-aware derivative index | Discovery only; never governing. |
| Audit metadata | Repository/governance/publication/security audit record | Event evidence; minimum necessary and redacted. |

Metadata MAY use front matter, a body table, repository manifest, sidecar file, generated inventory, or derived Administration Repository record after a future design chooses a representation. This standard selects no serialization. Where multiple forms exist, the approved authored governance declaration controls only if it agrees with its source evidence; publication and derived fields retain their separate authority boundaries.

### 9.3 Metadata conflict rules

| Conflict | Required handling |
| --- | --- |
| Front matter conflicts with body metadata table | Mark the field conflicting; do not infer authority/status; owner resolves through a new reviewed version. |
| Manifest conflicts with document content | Withhold affected item from normal publication and investigate source/version/checksum. A manifest cannot rewrite content. |
| Derived metadata conflicts with Git source | Git source and valid governing evidence control; retain discrepancy audit and refresh/repair derivative only after review. |
| Checksum mismatch | Fail publication/integrity validation; retain last known good set only with stale disclosure or withdraw affected scope. |
| Stated identifier differs from filename/path | Mark identity conflict and block normal publication if it affects authority, links, or references. |
| Document claims approval without approval record | Treat approval as unverified; do not make the item effective or present it as approved. |
| Document claims current but has valid supersession | Present as superseded/historical; escalate any source inconsistency. |
| Body and governing metadata disagree on status | Fail safe: do not publish as current/effective until an owner/approver resolves it. |

Conflicts affecting authority, classification, publication, or access MUST prevent normal publication for the affected scope until resolved. They MUST be surfaced, never silently ranked away.

## 10. Publication governance

Publication is a governed transition, not repository presence or deployment. Every publication set MUST include a source repository, protected source/release reference where selected, immutable commit, manifest identity, included-document inventory, checksums, publication timestamp, publisher identity, audience/environment, approval/effectivity evidence, and rollback/last-known-good reference.

| Publication state | Eligibility / disclosure |
| --- | --- |
| Repository-only | Present in Git; not available through a governed publication set. |
| Eligible | Meets declared source/metadata/approval/classification prerequisites but is not yet included. |
| Included | Listed in a candidate immutable manifest; not necessarily published/effective. |
| Published | Released in a completed verified manifest for its audience; source commit/checksum must be visible to authorized consumers. |
| Stale | Last known verified set remains available only with visible freshness limitation; it MUST NOT silently claim currentness. |
| Withdrawn | Removed from normal access due to controlled withdrawal; history and evidence remain. |

Publishing requires source integrity, classification/access validation, lifecycle validation, manifest completeness, and a rollback reference. A failed, partial, mismatched, or unauthorized publication MUST NOT become the effective set. Emergency unpublish is allowed only under Section 17. This standard does not select a transport, storage, signed-manifest format, or deployment mechanism.

## 11. Classification and authorization

The default classification is **Internal** unless a governing authority assigns a more restrictive label. The initial controlled vocabulary is intentionally minimal.

| Classification | Handling expectation |
| --- | --- |
| Internal | Authorized internal operational use; not public by implication. |
| Restricted | Need-to-know operational, commercial, incident, or controlled evidence content. |
| Security Restricted | Security-sensitive operational content; requires heightened review and logging policy. |
| Legal or Privileged | Legal, privileged, or protected material; handling follows designated legal authority. |
| Investor Confidential | Controlled due-diligence or investor material; no public/shared disclosure without authorization. |
| Public Candidate | Proposed for eventual public release; not public until separately approved and published. |
| Historical | Retention/discovery treatment label only; it does not reduce another applicable restriction. |

The classification owner assigns or changes classification; a security reviewer is required for Security Restricted and a designated legal authority for Legal or Privileged. Classification changes require reason, prior/new value, timestamp, and audit evidence. Downgrade/declassification requires the same or higher authority and evidence that restrictions no longer apply. Derived metadata, relationships, collections, snippets, caches, exports, and AI retrieval inherit the most restrictive applicable source handling requirement.

Classification metadata MUST NOT grant access. Authorization is a server-enforced platform responsibility.

### 11.1 Authorization before discovery

Authorization filtering MUST happen before inventories, indexes, search, result counts, filters, facets, snippets, autocomplete, related links, relationship graphs, collections, caches, exports, logs, analytics, and future AI retrieval/citations can expose source-derived information. A collection cannot override document authorization; a relationship cannot reveal an unauthorized target; aggregate counts MUST NOT disclose restricted existence; and unauthorized content MUST NOT be sent to a model provider.

## 12. Ownership and separation of duties

| Role | Responsibilities and transition authority |
| --- | --- |
| Document author | Creates/revises draft content; cannot claim approval merely by authorship. |
| Document owner | Accountable for scope, review, lifecycle accuracy, supersession, and correction. |
| Reviewer | Evaluates a specified version and records findings; does not approve unless separately authorized. |
| Approver | Approves/rejects the defined version and scope, including conditions. |
| Publisher | Publishes only verified eligible source sets and records manifest/rollback evidence. |
| Classification owner | Assigns/changes classification and reviews handling implications. |
| Platform administrator | Enforces server-side access and operational controls in a future implementation; cannot override content authority alone. |
| Security reviewer | Reviews restricted-content handling, discovery, rendering, integrity, and withdrawal conditions. |
| Records owner | Maintains retention, historical preservation, archive/tombstone, and audit posture. |
| Collection owner | Curates a future collection without changing document authority or access. |
| Incident responder | Initiates emergency withdrawal under documented authority and follow-up review. |
| Auditor | Reviews evidence, provenance, transition records, and conformance without silently altering source state. |

The current startup may consolidate roles under Michael Loren Stiger or another authorized operator. Such consolidation MUST be explicit in each material record, identify the conceptual role exercised, and retain the required evidence. A person acting as author SHOULD obtain independent review for high-authority, security-restricted, or production-governing changes where practicable. If a required role is unavailable, the incident responder may perform an emergency withdrawal only; restoration, reclassification, or approval requires documented escalation and post-event review.

## 13. Relationships, collections, and personal views

### 13.1 Controlled relationship vocabulary

| Canonical relationship | Inverse | Authority treatment |
| --- | --- | --- |
| `governs` | `governed_by` | Authoritative when declared/approved for scope. |
| `supersedes` | `superseded_by` | Authoritative only with valid owner/approval evidence. |
| `implements` | `implemented_by` | Informational/evidence-bearing unless an authorization record states otherwise. |
| `approves` | `approved_by` | Event evidence tied to exact approval version. |
| `reviews` | `reviewed_by` | Review evidence, not approval. |
| `verifies` | `verified_by` | Validation evidence, not authority change. |
| `depends_on` | `dependency_of` | Governing when approved; otherwise declared/candidate. |
| `evidence_for` | `supported_by` | Supporting evidence; does not independently govern. |
| `architecture_for` | `decision_for` | Scope/navigation relationship with declared provenance. |
| `runbook_for` | `released_by` | Operational/release context; does not override governing content. |
| `affects` | `affected_by` | Informational impact relationship. |
| `references` | `referenced_by` | Navigational/informational only. |
| `related_to` | `related_to` | Symmetric informational relationship only. |

Every typed relationship MUST name a target by stable identity, retain source/provenance (`declared`, `reviewed_derived`, or `candidate`), state whether it is authoritative or informational, and be authorization-filtered before display. Broken targets, circular authoritative supersession/governing chains, or invalid direction MUST fail validation and be surfaced. Historical targets remain linkable only to authorized users and MUST show historical/supersession context. Markdown hyperlinks MAY aid navigation but MUST NOT automatically become authoritative relationships.

### 13.2 Collections

A Collection is a future governed curated grouping of existing documents. A document MAY be in multiple collections. Membership does not copy content, change classification, alter status/precedence, or override authorization. Order MAY be meaningful; completeness MAY be assessed. Collections can later support release, audit, investor, grant, and evidence packages, but immutable snapshots require separate future architecture. Collections are not folders, categories, tags, search results, or personal views.

### 13.3 Personal views

Favorites, pins, recently viewed, recently updated, and my-documents views are user-specific convenience data. They MUST NOT alter authority, classification, access, governance evidence, or authority-implying ranking. They MAY need separate preference storage and remain deferred from Horizon 1.

## 14. Supersession, history, archive, withdrawal, and deletion

| State | Default discovery and treatment |
| --- | --- |
| Superseded | Retained and authorized-searchable by deliberate history access; default views show successor and non-current warning. |
| Historical | Retained for audit/reference; excluded from default current filters unless a user requests history. |
| Archived | Retained under records policy; not in default search and accessible only by authorized historical/archive discovery. |
| Withdrawn | Not normally accessible; show only a minimum authorized warning/tombstone and replacement where safe. |
| Deleted under retention rule | Allowed only under an approved retention/legal rule. Where removal would destroy governance evidence, preserve an authorized tombstone with identity, reason, authority, and time. |

Governed records MUST NOT be silently deleted when that would destroy approval, audit, release, operational, or historical truth. Links/bookmarks to removed or withdrawn items SHOULD resolve to an authorized warning and successor, not misleading absence.

## 15. Review cadence and freshness

The document owner is responsible for a next-review date for standards, effective architectures, operational procedures, and other families requiring current validation. Review cadence is set by the applicable family or governing record. A document may become `stale`, `expired`, or `overdue_review` in derived status without changing the underlying historical record.

Event-driven review is required after material architecture change, security incident, provider or regulatory change, product-scope change, supersession, major release, production failure, classification issue, or integrity failure. A stale document MAY remain accessible with visible status, but it MUST NOT remain silently effective or publication-eligible where current validation is required.

## 16. Audit and security requirements

Governance audit MUST cover material approval, rejection, conditional approval, publication, republishing, rollback, withdrawal, classification/ownership/supersession/relationship change, collection snapshot, and export of restricted material. Future restricted-content access must receive security-significant audit treatment where policy requires. Ordinary document views SHOULD NOT be audited indiscriminately unless classification or policy requires it.

| Audit event | Minimum evidence | Audit class |
| --- | --- | --- |
| Approval, rejection, or conditional approval | Target identity/version, actor/role, disposition/conditions, time | Governance audit |
| Publication, republishing, rollback, stale/failure outcome | Manifest/source reference, actor/role, audience, checksums, outcome, time | Publication audit |
| Withdrawal or emergency unpublish | Initiator/role, reason, affected set, warning/replacement, follow-up, time | Security and governance audit |
| Classification, owner, supersession, or relationship change | Prior/new value, provenance, actor/role, reason, time | Governance audit |
| Restricted export or future restricted access | Authorized actor, target classification/scope, outcome, time; no copied content | Security audit |
| Collection snapshot | Collection identity, membership provenance, manifest/source reference, owner, time | Governance/publication audit |

Repository history, governance audit, publication audit, security audit, and ordinary application telemetry are distinct evidence classes. Audit records MUST minimize content, personal data, and secrets; they MUST NOT needlessly copy document bodies, credentials, keys, or sensitive snippets.

Governed content and derivatives MUST be protected against embedded credentials, secrets, malicious Markdown/HTML/SVG/scripts/iframes, remote resources, path traversal, unsafe attachments, sensitive snippets, cache leakage, export leakage, log leakage, AI prompt injection, and integrity failure. Documents failing integrity or safety validation MUST NOT enter a normal publication set. Implementations must provide safe rendering/sanitization outcomes without this standard selecting a renderer.

## 17. Emergency withdrawal and unpublish

An authorized incident responder, security reviewer, records owner, or designated legal authority MAY initiate emergency unpublish for exposed credentials, a vulnerability, legal privilege, unsafe instruction, incorrect production procedure, classification error, malicious content, or broken integrity.

The action MUST record initiator, reason, timestamp, affected documents/publication sets, temporary warning or replacement, audit evidence, follow-up owner, and restoration/permanent-withdrawal decision. Emergency unpublish MUST NOT erase repository history. It may protect access immediately, but it does not retroactively alter approval or source content.

## 18. AI and evidence boundaries

This standard does not authorize AI. Any future AI use MUST enforce authorization before retrieval, permit only authorized source material into model context, cite document identifier/source version/status/authority, disclose conflicts and uncertainty, honor supersession/classification, resist prompt injection, prevent secret retrieval, avoid autonomous operational execution, prohibit unreviewed writeback, use classification-appropriate audit, remain model-provider independent, and preserve product/tenant isolation where applicable. AI output is never authoritative merely because it summarizes governed documents.

Future grant, investor, audit, release, sustainability, and operational evidence packages MUST preserve source identity, evidence period, methodology/assumption/calculation version where applicable, reviewer, approval, report version, and immutable source references. This standard does not become an analytics, evidence-management, or environmental-calculation architecture.

## 19. Legacy adoption and conformance

No bulk rewrite is required by this draft. Following approval, new governed documents MUST comply before required approval/publication. Materially revised current documents MUST be normalized when revised. High-authority effective documents SHOULD be prioritized. Legacy historical records MAY retain their original format if an inventory can attach derived minimum metadata without changing historical truth. Missing critical authority, classification, lifecycle, or identity facts MUST be surfaced rather than fabricated.

| Document population | Adoption expectation |
| --- | --- |
| Newly created governed document | Must meet the applicable CTX-STD-002 requirements before required approval or publication after this standard is approved. |
| Materially revised current document | Normalize applicable identity, lifecycle, classification, authority, and relationship metadata as part of the revision. |
| Current approved high-authority document | Prioritize for planned normalization; do not infer absent historical approval facts. |
| Legacy but still authoritative document | Attach derived minimum metadata where possible and visibly flag unknown critical fields until a controlled revision resolves them. |
| Historical or archived record | Preserve original form and history; add derived inventory/tombstone context only if it does not rewrite historical truth. |

| Conformance level | Minimum expectation |
| --- | --- |
| Structurally valid | Readable Markdown, valid heading progression, stable path, and working relevant relative links. |
| Governance metadata complete | Required identity, type, owner/unknown, classification/default, lifecycle disclosure, and provenance are present. |
| Lifecycle valid | State combination, transition evidence, and effective/supersession treatment are valid. |
| Relationship valid | Targets, direction, provenance, authority treatment, and access handling are valid. |
| Publication eligible | Integrity, classification, approval/effectivity, metadata, and required review conditions pass. |
| Publication valid | Immutable source reference, manifest/inventory/checksums, audience, publisher, outcome, and rollback evidence pass. |
| Historically preserved | Retention, warning, successor/tombstone, and audit treatment protect prior truth. |

Validation SHOULD detect duplicate identifiers, invalid state combinations, broken relationships, missing approval evidence, invalid supersession, missing classification, checksum mismatch, missing owner, overdue review, publication-manifest mismatch, unauthorized collection membership, conflicting metadata, and broken relevant relative links. This standard requires outcomes; it does not create validation tooling.

## 20. Deferred ADRs, consumers, and open questions

Future ADRs are expected for repository publishing model; manifest format; metadata representation/storage; restricted-content discovery/authorization; search; rendering/sanitization; derived Administration Repository persistence; collection snapshots/evidence packages; and AI retrieval/grounding. No ADR is created or approved by this draft.

Expected consumers include CTX-ARCH-009, CTX-ARCH-010, future Operations Library and Administration Repository work, future search/AI/evidence/GeoHaul/sustainability architecture, authors, reviewers, approvers, publishers, and auditors. Dependent architectures MUST be revised and reviewed separately after this standard is reviewed and approved; this standard does not amend their draft status.

Open questions include retention durations, signature requirements, metadata serialization, authoritative published source-reference form, classification-to-permission mapping, restricted-access auditing thresholds, search completeness criteria, attachment policy, collection snapshot format, and recovery objectives. These remain unresolved until a future appropriate authority decides them.

## 21. References

- [Documentation Library](../README.md)
- [Project Context](../project/project-context.md)
- [CTX-STD-001](./cretexchange-platform-standards.md)
- [Development Protocol](../development-protocol.md)
- [CTX-ARCH-009](../architecture/CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- [CTX-ARCH-009 Review](../architecture/reviews/CTX-ARCH-009-architecture-review.md)
- [CTX-ARCH-010](../architecture/CTX-ARCH-010-administration-repository-architecture.md)
- [Documentation Governance Discovery and Requirements](./documentation-governance-discovery-and-requirements.md)
