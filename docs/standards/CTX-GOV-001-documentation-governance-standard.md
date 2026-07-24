# CTX-GOV-001 — Documentation Governance Standard

- **Document ID:** CTX-GOV-001
- **Version:** 0.1
- **Status:** Approved
- **Owner:** Documentation and Operations Governance
- **Product:** CreteXchange
- **Approval Date:** July 23, 2026
- **Effective Date:** July 23, 2026
- **Classification:** Internal
- **Review Frequency:** Semiannual and event-driven when the documentation hierarchy, governance process, or Administration Repository changes.
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
- **Last Reviewed:** July 23, 2026 — formal owner approval
- **Next Review:** January 23, 2027, and event-driven after a material governance, lifecycle, or Administration Repository change

## 1. Purpose

This standard defines how the CreteXchange Documentation Library is created, maintained, reviewed, related, approved, archived, and governed. It gives contributors and AI assistants a single, practical authoring model while preserving the authority of the documents that govern product, architecture, engineering, operations, and release behavior.

This approved standard governs documentation practice only; it does not alter an existing authority or authorize implementation. It does not replace [CTX-STD-001](./cretexchange-platform-standards.md), any CTX-ARCH document, Product Decision, the [Development Protocol](../development-protocol.md), Operations Guide, runbook, policy, or release control.

## 2. Scope

This standard applies to documents maintained in the CreteXchange Documentation Library, including standards, architecture, governance, operations, runbooks, policies, UX specifications, Product Decisions, ADRs, business, research, vision, strategy, project, roadmap, sprint, archival, release, and supporting records.

It does not define application behavior, database schema, APIs, financial calculations, production deployment authority, a content-management system, or a public-documentation program. Documents remain subject to the authorities that govern their substantive domain.

## 3. Documentation Philosophy

- **Single source of truth:** identify and link the authoritative document; do not create competing copies of a rule or lifecycle.
- **Architecture first and standards first:** establish applicable standards and architecture before material implementation where practical.
- **Truthful representation:** distinguish current implementation, manual or partial operation, planned capability, and future strategy.
- **Operational accuracy:** instructions must reflect an authorized, currently supported procedure and its boundaries.
- **Evidence-based documentation:** use repository evidence and approved authorities, not prior chat, assumption, or promotional language.
- **No speculative implementation:** do not represent intended features, routes, roles, data, provider actions, or roadmap items as current.
- **Least privilege:** do not record secrets, credentials, connection strings, payment details, protected financial identifiers, or unnecessary personal information.
- **Financial separation:** do not conflate operational verification, financial review, approval, billing, payment, payout, wallet activity, or settlement.
- **Living documentation:** material policy, architecture, lifecycle, authorization, process, or release changes require synchronized documentation updates.

## 4. Documentation Hierarchy

The [Documentation Library](../README.md#documentation-hierarchy) is the canonical navigation and precedence source. Its current order governs project and implementation decisions:

1. Documentation Library and Project Context
2. Platform Standards, including applicable CTX-STD and approved documentation-governance standards
3. Applicable CTX-ARCH documents
4. Product Decisions
5. Development Protocol
6. Applicable production release governance, Operations Guides, and runbooks
7. UX specifications, policies, business documents, research documents, roadmaps, sprint plans, tests, implementation details, and code as supporting evidence within their domains

Earlier applicable authorities take precedence when guidance conflicts. Vision and strategy define enduring direction and long-term roadmap context; they do not authorize implementation or override current architecture. Lower-level documents never override a higher applicable authority. When applicability or precedence is unclear, stop, identify the conflict, and escalate rather than selecting an interpretation by convenience.

## 5. Document Families

| Family | Purpose | Primary audience / owner | Default review cadence | Examples |
| --- | --- | --- | --- | --- |
| CTX-STD | Mandatory cross-cutting platform and engineering controls. | Engineering and designated standard owner. | Semiannual and event-driven. | CTX-STD-001, CTX-STD-002. |
| CTX-GOV | Documentation governance, library practice, and related controls. | Documentation and Operations Governance. | Semiannual and event-driven. | CTX-GOV-001. |
| CTX-ARCH | Domain architecture, source-of-truth boundaries, and implementation contracts. | Architecture owner and engineering. | Quarterly and event-driven. | CTX-ARCH-001, CTX-ARCH-007. |
| CTX-OPS | Durable operational guides and release records. | Operations owner. | Quarterly and event-driven. | CTX-OPS-001, CTX-OPS-002. |
| CTX-RB | Task-specific operational procedures and checklists. | Procedure owner. | Quarterly and event-driven. | CTX-RB-009. |
| CTX-POL | Durable policy where the repository formally assigns this family. | Policy owner. | Annual and event-driven. | No current assigned example. |
| CTX-UX | Experience architecture and durable interface requirements. | Product, design, and engineering. | Quarterly and event-driven. | CTX-UX-007, CTX-UX-008. |
| PD | Durable product and operational policy decisions. | Product / decision owner. | Event-driven; review when policy changes. | PD-050 through PD-053. |
| ADR | Architectural decision record for a defined technical decision. | Architecture / decision owner. | Immutable decision record; review on supersession. | ADR-031. |
| Business | Customer-value, business-model, and related business context. | Business owner. | Annual and event-driven. | Business Model, Revenue Architecture. |
| Research | Hypotheses, study governance, grant readiness, and research context. | Research owner. | As needed and event-driven. | Research Roadmap. |
| Vision and Strategy | Enduring mission and long-term strategic direction. | Leadership / strategy owner. | Annual and event-driven. | Platform Vision, Platform Strategy. |
| Project | Current phase, delivery context, pilot baseline, and approved scope. | Project owner. | At phase or scope change. | Project Context, Pilot Baseline. |
| Roadmaps and Sprints | Directional sequencing and approved delivery objectives. | Product / delivery owner. | At planning, transition, and closeout. | Sprint Roadmap, Sprint 2.2. |
| Archive | Historical references retained for context without current authority. | Records owner. | On archive or supersession. | `docs/archive/`. |

These are recommended defaults, not newly created staffing, retention, or service-level commitments. A document may set a different cadence when an applicable authority supports it and records the rationale.

## 6. Document Identifier Rules

Use an identifier only after verifying that it is unique across the repository and that no existing document already serves the same authoritative purpose.

| Family | Format | Numbering rule |
| --- | --- | --- |
| Architecture | `CTX-ARCH-NNN` | Sequential three-digit identifier. |
| Platform standard | `CTX-STD-NNN` | Sequential three-digit identifier. |
| Governance standard | `CTX-GOV-NNN` | Sequential three-digit identifier. |
| Operations guide | `CTX-OPS-NNN` | Sequential three-digit identifier. |
| Runbook | `CTX-RB-NNN` | Sequential three-digit identifier. |
| Policy | `CTX-POL-NNN` | Sequential three-digit identifier when this family is formally adopted. |
| UX specification | `CTX-UX-NNN` | Sequential three-digit identifier. |
| Product Decision | `PD-NNN` | Sequential three-digit identifier. |
| Architecture Decision Record | `ADR-NNN` | Sequential three-digit identifier. |

Identifiers are permanent. Do not reuse an identifier, rename an existing document to obtain one, or create a duplicate identifier in a new path. When a document is superseded, retain its identifier and link the successor; do not repurpose it.

### 6.1 Identifier gap register

The following identifiers are intentionally unassigned pending historical verification. This register does not assert a historical use, retirement, or reservation that is not evidenced in the repository:

| Identifier | Disposition | Evidence / next action |
| --- | --- | --- |
| CTX-RB-001, CTX-RB-002 | Intentionally Unassigned — pending historical verification | Do not allocate without confirming that no retained historical record exists. |
| CTX-POL-001, CTX-POL-002, CTX-POL-005 through CTX-POL-007 | Intentionally Unassigned — pending historical verification | Do not allocate without confirming that no retained historical record exists. |

## 7. Required Metadata

Every governed document SHOULD declare the following metadata near its title. Legacy documents may be normalized when materially revised; missing historical facts must be marked unknown rather than invented.

| Field | Requirement |
| --- | --- |
| Document ID | Unique stable identifier for the applicable family. |
| Title | Clear, durable title matching the document’s purpose. |
| Version | Current document version. |
| Status | Current lifecycle state. |
| Owner | Accountable document owner or owner group. |
| Approval Authority | Existing approving authority, or `To be formally assigned` when undefined. |
| Product | CreteXchange where applicable. |
| Effective Date | Date the document becomes effective, where approved and applicable. |
| Review Frequency | Cadence or event trigger. |
| Last Reviewed | Most recent substantive review date. |
| Next Review | Scheduled or event-based next review. |
| Classification | Handling classification when the repository convention supports it. |

Metadata must agree within a document. Do not copy a status, approval, owner, effective date, or classification from another document without evidence. [CTX-STD-002](./CTX-STD-002-documentation-governance-metadata-lifecycle-authority-and-relationships.md) is the approved detailed metadata, lifecycle, classification, and relationship model; it does not supersede this standard’s hierarchy or create implementation authority.

## 8. Document Status Lifecycle

| Status | Meaning | Transition rule |
| --- | --- | --- |
| Draft | Work in progress; not approved or effective. | Revise through review or withdraw. |
| Proposed | Prepared for a defined review or approval decision. | Move to Under Review or return to Draft. |
| Under Review | Submitted to the appropriate existing review process. | Approve, return to Draft, or retire with evidence. |
| Approved | Accepted by the documented approval authority. | Set an effective date when applicable; retain approval evidence. |
| Superseded | Replaced by a linked successor. | Preserve historical identity and successor link. |
| Archived | Retained as historical, non-current reference. | Do not silently restore current authority. |
| Retired | No longer operative and not to be used for current decisions. | Preserve reason and replacement, if any. |

Status changes must be evidence-based and recorded in change history. A Draft, Proposed, or Under Review document must not be described as effective or as authorizing implementation, production adoption, or operational execution.

## 9. Governance Requirements

Every governed document should include, as applicable:

- purpose;
- scope and exclusions;
- intended audience where operational use is involved;
- related documents and source-of-truth references;
- governance metadata and review information; and
- change history.

Use a procedure, checklist, table, or escalation matrix where it improves safe operation. A document must not create a role, approval right, retention duration, service level, or business rule merely by naming it.

## 10. Relationship Rules

Relationships explain authority and context; they do not override the hierarchy.

- Architecture references applicable standards and Product Decisions.
- Operations Guides reference applicable architecture, Product Decisions, and release controls.
- Runbooks reference the Operations Guide, governing standards, and task-specific authority.
- Policies reference the standards and decisions that constrain them.
- Research and business documents reference strategy and governing project context.
- Sprint documents reference applicable Product Decisions and approved scope.
- A relationship must use the target’s stable identifier and a valid relative Markdown link when the target is in the repository.
- Do not create circular authority: a document cannot establish its own authority by referencing itself or a lower-level dependent document.

Informational links may support navigation, but a link does not make a document authoritative. Broken or unknown targets must be corrected before approval.

### 10.1 Standalone and embedded decision records

A standalone PD or ADR file is an independently governed and discoverable record. An embedded PD or ADR section inside a catalog or architecture document is a summary, historical catalog entry, or navigation aid unless it has its own standalone source record. Embedded sections may retain their stable identifier in prose and links, but they MUST NOT be presented as a second independently governed record. The Administration Repository derives relationships only to discoverable records; a link to an embedded-only historical entry must disclose that it is a catalog reference rather than a separate repository record.

## 11. Cross-Reference Rules

- Use relative Markdown links for repository documents.
- Use the target document identifier in the link text where an identifier exists.
- Verify every internal link resolves before approval.
- Do not duplicate an identifier or create a near-duplicate authoritative title for the same purpose.
- Link to the governing source instead of repeating its entire policy.
- Use a successor/supersession link when a current document replaces an earlier one.

## 12. Change Control

Revise a document when its governing policy, architecture, lifecycle, authorization, procedure, release control, ownership, relationship, or current-implementation statement materially changes. Correct factual errors promptly and preserve the correction in change history.

| Change type | Version guidance | Required review |
| --- | --- | --- |
| Major | Increment the major version for a material authority, scope, lifecycle, or policy change. | Re-review by the documented authority. |
| Minor | Increment the minor version for a material clarification or new bounded procedure that does not alter authority. | Review appropriate to the family and scope. |
| Editorial | Preserve the version or use a documented patch convention for formatting, grammar, or link correction without meaning change. | Verify links and confirm no semantic change. |

Versioning guidance is a documentation convention, not a substitute for a required formal approval or release record.

## 13. Review Cadence

Use the defaults in the Document Families table unless a higher applicable authority specifies otherwise. Review is also required after a material architecture or policy change, security incident, provider or regulatory change, production failure, classification issue, supersession, or integrity failure. A stale document must be visibly identified; it must not remain silently effective.

### 13.1 Legacy metadata normalization backlog

New and materially revised governed documents SHALL use the metadata model in Section 7. Existing legacy records will be normalized in bounded, reviewable batches; absent historical facts remain `Not recorded`, `Pending assignment`, or otherwise explicitly unknown rather than inferred. The current priority order is: governing standards and architectures; active operations, policy, and runbook records; standalone Product Decisions and ADRs; then historical/supporting sources. Completion of a metadata field does not constitute approval, effectivity, publication, implementation authorization, or production adoption.

## 14. Repository Organization

The Documentation Library organizes documents by durable purpose:

- `docs/standards/` for standards and governance controls;
- `docs/architecture/` for architecture and ADR records;
- `docs/product/` for Product Decisions and product policy;
- `docs/operations/` for operations guides and CTX-RB runbooks;
- `docs/ux/` for UX specifications;
- `docs/project/` for project context, pilot, roadmaps, and sprints;
- `docs/business/`, `docs/research/`, and `docs/vision/` for their supporting domains; and
- `docs/archive/` for retained historical material.

Place a document where its purpose belongs; do not create a parallel directory to avoid established review or discovery controls. Update [docs/README.md](../README.md) when adding a new authoritative family, index, or navigation path.

## 15. Administration Repository Integration

The Administration Repository is a read-only operational knowledge center. Governed-document discovery uses allowlisted repository paths, metadata parsing, lifecycle validation, relationship validation, immutable source versions, and checksum-verified content. Search, document viewing, printing, and exports are derived conveniences; Git remains authoritative for content and history.

Authors must not rely on the repository UI to edit, approve, publish, or change metadata. Synchronization, source-version identity, classification, relationship persistence, and publication behavior remain governed by their existing architecture and safeguards. A document must be valid in Git before a separately authorized synchronization can represent it.

## 16. Documentation Quality Standards

Documents must be objective, auditable, professional, concise enough to use, complete enough for their stated purpose, current, and truthful. Avoid marketing language, unsupported conclusions, and implementation speculation. Use tables for repeated comparisons, numbered procedures for ordered steps, and explicit cautions for sensitive, irreversible, or financial boundaries.

Do not expose sensitive values. Do not describe a roadmap item, future interface, or provider capability as current without implementation and governing evidence.

## 17. AI Contributor Rules

AI assistants and automation must:

1. Read the Documentation Library hierarchy and applicable governing sources before authoring or changing documentation.
2. Respect the highest applicable authority and identify a conflict rather than silently resolving it.
3. Never invent policies, architecture, roles, approval rights, retention periods, service levels, or escalation authorities.
4. Never promote roadmap, planned, partial, or future capability to implemented functionality.
5. Never contradict an applicable Product Decision or use code, a test, or prior chat to override a governing source.
6. Verify identifier uniqueness, metadata consistency, internal links, relationships, and current-versus-future statements.
7. Keep documentation changes scoped, preserve history, and record material changes.

## 18. Archive Rules

Archive a document only when it is retained for historical reference and no longer provides current authority. Mark it Archived or Superseded, preserve its identifier and source history, state the successor or reason, and ensure navigation does not misrepresent it as current. Do not delete governance evidence merely to simplify the library. Retention duration and deletion authority are **Procedure not yet formally defined** unless an approved policy provides them.

## 19. Governance Checklist

Before approving a governed document, confirm:

- [ ] Identifier is unique and the purpose is not already served by an authoritative document.
- [ ] Metadata is complete, internally consistent, and evidence-based.
- [ ] Applicable hierarchy and governing sources were reviewed.
- [ ] Scope, audience, exclusions, related documents, governance, and change history are present.
- [ ] Current, manual/partial, planned, and future capability are clearly distinguished.
- [ ] Internal links resolve and relationships are valid and non-circular.
- [ ] No duplicate authority, unsupported role, policy, approval, retention period, service level, or business rule was introduced.
- [ ] No secrets, credentials, payment details, or unnecessary personal information are present.
- [ ] Required documentation validation has passed and the Administration Repository can discover the document under existing controls.

## 20. Related Documents

- [Documentation Library](../README.md)
- [Project Context](../project/project-context.md)
- [CTX-STD-001 — CreteXchange Platform Standards](./cretexchange-platform-standards.md)
- [CTX-STD-002 — Documentation Governance, Metadata, Lifecycle, Authority, and Relationship Standard](./CTX-STD-002-documentation-governance-metadata-lifecycle-authority-and-relationships.md)
- [Development Protocol](../development-protocol.md)
- [CTX-DEP-001 — Production Deployment Protocol](./CTX-DEP-001-production-deployment-protocol.md)
- [CTX-OPS-001 — Production Release Checklist](../operations/CTX-OPS-001-production-release-checklist.md)
- [CTX-OPS-002 — Administration Operations Guide](../operations/CTX-OPS-002-administration-operations-guide.md)
- [Operations Runbook Framework](../operations/README.md)
- [CTX-ARCH-009 — Operations Library and Knowledge Management Architecture](../architecture/CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- [CTX-ARCH-010 — Administration Repository Architecture](../architecture/CTX-ARCH-010-administration-repository-architecture.md)

## 21. Change History

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | July 23, 2026 | Formally approved and made effective by Michael Loren Stiger, CreteXchange Project Owner. This documentation-governance approval does not authorize an application release, implementation, deployment, or production adoption. |
| 0.1 | July 2026 | Initial Draft documentation-governance standard. |
