# CTX-ARCH-009-REVIEW — Operations Library and Knowledge Management Architecture Review

- **Document ID:** CTX-ARCH-009-REVIEW
- **Review status:** Independent architecture review; not an approval, implementation authorization, or production-adoption authorization
- **Architecture reviewed:** [CTX-ARCH-009 — Operations Library and Knowledge Management Architecture](../CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- **Supporting discovery reviewed:** [CTX-GOV-002 — Documentation Program Health Assessment](../../standards/CTX-GOV-002-documentation-program-health-assessment.md)
- **Repository / branch / starting commit:** `cretexchange-phasea-clean` / `feature/cutoff-and-rewards-controls` / `06d7520df988f559f321ebacc2fd81ea9af9f458`
- **Date:** July 22, 2026
- **Review boundary:** Documentation and repository inspection only. No application, database, provider, Railway, deployment, or production action occurred.

## Executive Summary

**Recommendation: APPROVE WITH MAJOR CHANGES.**

CTX-ARCH-009 has a coherent product boundary: a top-level, read-only, Admin-only Operations Library that keeps the repository authoritative and treats runtime content, metadata, relationships, and search as derived. It correctly excludes a CMS, public access, AI, raw GeoHaul telemetry, and sustainability calculations from the first horizon. Its rendering, failure-isolation, provenance, accessibility, and future AI boundaries are materially stronger than a generic documentation portal proposal.

However, the draft is not yet conditionally approvable without major clarification. It does not define a deterministic publication contract: authoritative, approved, published, effective, current, superseded, and historical are discussed but not normatively distinguished. It also lacks a conflict-resolution rule for metadata versus body content and for two approved documents at the same authority level; a branch/tag/release identity for published knowledge; a policy for restricted-content discovery and search-result leakage; and named operational ownership for publication, classification, lifecycle correction, and incident response. These are governance design gaps, not implementation details.

The review supports a revised draft followed by a separate approval record. Implementation and production adoption remain prohibited.

## Strengths

1. **Repository authority is explicit.** The draft correctly prevents a database, object store, index, or runtime copy from becoming authoritative by convenience.
2. **Initial scope is disciplined.** Admin-only, read-only consumption avoids creating an uncontrolled CMS or public knowledge portal.
3. **Derived-data provenance is strong.** Path, commit, checksum, status, and freshness are called out as required evidence.
4. **Security posture is credible.** Server-side authorization, private-repository credential isolation, sanitization, path-traversal defense, controlled external links, and redacted logging are appropriate starting boundaries.
5. **Failure isolation is correct.** A library outage must not block core marketplace or financial operations.
6. **Future boundaries are restrained.** AI must be grounded, authorized, cited, and non-executing; GeoHaul and sustainability remain methodology/evidence concerns, not initial features.
7. **Repository conventions are respected.** A separate factual discovery artifact follows the CTX-ARCH-008 pattern and distinguishes facts from proposals.
8. **Accessibility is integrated early.** Keyboard, focus, semantic headings, non-color status, responsive large-document navigation, and bilingual readiness are recognized.

## Critical Findings

No critical finding prevents a revised architecture from reaching conditional approval. Implementation is already prohibited, so no live security, data-integrity, or production control is being weakened by this draft.

## Major Findings

| ID | Finding and evidence | Impact | Recommendation | Proposed owner | Blocks approval? |
| --- | --- | --- | --- | --- | --- |
| M-01 | CTX-ARCH-009 calls the repository authoritative and describes lifecycle terms, but does not define authoritative, approved, published, effective, current, superseded, and historical as separate normative states or permitted combinations. | The UI, search, audit, and future AI could incorrectly show a Git file as current simply because it was indexed. | Add a publication/lifecycle state matrix, invariants, transition authority, and UI disclosure rules. Explicitly answer whether a document can be in Git but unpublished, approved but not effective, and published but superseded. | Architecture + Information Governance | Yes |
| M-02 | The draft defers the publishing mechanism but does not select the source ref that constitutes a published operational set: protected branch, immutable tag, signed release manifest, or another reviewed reference. | No deterministic answer exists for “what operational knowledge was displayed at time X”; rollback and audit evidence remain ambiguous. | Define a source-ref contract: immutable publication identifier, repository/ref/commit/checksum evidence, publish/rollback semantics, and the minimum publish manifest. The transport mechanism may remain deferred. | Architecture + Release Governance | Yes |
| M-03 | Authority hierarchy is referenced, but conflict resolution is not operationalized for conflicting metadata/body content or two approved documents at equivalent authority. | Search and AI ranking could conceal conflicts, and reviewers would lack a stop/escalation rule. | Add a precedence and conflict protocol: body-versus-derived metadata precedence, authority tie-break prohibition, conflict flagging, escalation owner, and prohibition on silently selecting a winner. | Information Governance + Architecture | Yes |
| M-04 | Security recognizes restricted content, but it does not prescribe whether unauthorized documents are excluded from search indexing, result counts, snippets, autocomplete, relationship edges, and AI retrieval before ranking. | Restricted titles, identifiers, snippets, or relationships can leak even if document rendering is protected. | Add an authorization-before-discovery invariant covering index build, query, facets/counts, snippets, related links, history, cache keys, exports, and future retrieval. Define no-existence-disclosure behavior for denied content. | Security Architecture + Application Security | Yes |
| M-05 | Publication, metadata normalization, classification, freshness exception handling, access audit review, and incident response are described as future work but lack accountable roles and separation-of-duties assumptions. | A startup can build an application with no safe operator for stale content, wrong classification, emergency unpublish, or disputed authority. | Define a minimal operational ownership model and incident controls. It can retain the current single-operator model, but must record role overlap, authority, escalation, and evidence requirements. | Operations Governance + Business Owner | Yes |

## Moderate Findings

| ID | Finding and evidence | Impact | Recommendation | Proposed owner | Blocks approval? |
| --- | --- | --- | --- | --- | --- |
| MO-01 | Metadata is carefully staged, but no canonical machine-readable minimum representation is proposed for initial publication. | Implementation may parse inconsistent Markdown heuristically and create drift. | Specify an initial manifest/sidecar model and a source-of-truth rule for metadata fields; defer field serialization details. | Information Governance | No; blocks implementation |
| MO-02 | Typed relationships are proposed, but no provenance, confidence, review status, or lifecycle for derived versus declared relationships is defined. | Link inference may become silently authoritative or stale. | Add relationship provenance (`declared`, `reviewed-derived`, `candidate`) and display/authorization rules. | Knowledge Management Architecture | No; blocks relationship features |
| MO-03 | Search is correctly deferred, but relevance, recall, synonym handling, phrase queries, result caps, and authoritative-result guarantees are not specified. | Basic search may appear complete while omitting controlling material. | Define measurable initial search acceptance criteria and a “governing source” result treatment before implementation. | Search Architecture | No; blocks search implementation |
| MO-04 | Rendering restricts unsafe content but does not set an attachment format, malware, preview, or download-policy boundary. | Attachments could introduce content-disposition, scanning, privacy, or availability gaps. | Make attachments/downloads unavailable in Horizon 1 unless separately approved; specify a future controlled attachment policy. | Security + Operations | No |
| MO-05 | The draft states accessibility goals but does not require an accessible text alternative or fallback for Mermaid/complex diagrams. | Screen-reader users may lose material architecture information. | Require text description and safe fallback for every rendered diagram. | UX / Accessibility | No |
| MO-06 | “Admin-only” is practical, but existing `admin` and `super_admin` roles are broad and not equivalent to future compliance/support/auditor roles. | Future role expansion can become ad hoc or overbroad. | Define first-release access as a temporary trusted role set and require a permission review before restricted collections. | Security + Product | No |

## Minor Findings

| ID | Finding and evidence | Impact | Recommendation | Proposed owner | Blocks approval? |
| --- | --- | --- | --- | --- | --- |
| MI-01 | Taxonomy mixes document families with cross-cutting facets such as security, deployment, database, and sustainability. | Filters may be inconsistent. | Define a small controlled vocabulary and distinguish primary type from tags/facets. | Knowledge Management | No |
| MI-02 | “Current” and “approved” are used together in defaults without a documented distinction. | Users may infer approval is effectiveness. | Use precise labels in the lifecycle matrix and UI vocabulary. | Information Governance + UX | No |
| MI-03 | Audit events are listed but retention, redaction review, and access-review frequency are not bounded. | Auditability may be expensive or insufficient. | Add a future audit policy requirement and minimum event-retention decision. | Audit + Security | No |
| MI-04 | Print/export is deferred but availability/format expectations are not explicitly excluded from Horizon 1. | Scope can expand through convenience requests. | State that exports, bundles, and offline packages are not included in initial acceptance criteria. | Product + Architecture | No |

## Observations

- **Collections are valuable, but Horizon 2.** Curated, non-duplicative collections such as Production Migration, Disaster Recovery, Release Evidence, Investor Due Diligence, Grant Evidence, Sustainability Methodology, GeoHaul Integration, and Security Operations should be an architectural capability in Horizon 2. They need a collection owner, membership provenance, lifecycle, access policy, and publication snapshot. They do not require a separate architecture today, but their metadata and permission model should be anticipated.
- **Favorites, pinned documents, recently viewed, recently updated, and “my documents” are Horizon 2 convenience data.** They should not delay Horizon 1, should never affect authority ranking, and should be stored as user-specific derived data with privacy minimization.
- **No existing dedicated security or privacy architecture document was evidenced in the reviewed documentation families.** This strengthens the need for a focused security review before implementation, not a claim that no security controls exist.
- **The existing Platform Operations UX architecture supports a dedicated operational surface and least-privilege progressive disclosure.** CTX-ARCH-009 should cross-reference it more explicitly in a revision.
- **The repository’s 117-document scale supports a simple, controlled first search approach.** It does not justify semantic or internet-scale search infrastructure in Horizon 1.

## Risk Assessment

| Risk | Rating | Principal mitigation | Residual condition |
| --- | --- | --- | --- |
| Published content diverges from repository | High | Immutable source ref, checksum, publish manifest, stale warning | Requires publication contract. |
| Draft/superseded material appears governing | High | State matrix, authority-aware default, explicit conflict handling | Requires lifecycle/precedence revision. |
| Restricted metadata leaks through discovery | Critical | Authorization before indexing/query/facets/snippets/AI retrieval | Requires security revision. |
| Malicious Markdown/attachment content | High | Sanitizer, deny active content, defer attachments, test adversarial input | Requires renderer and attachment policy. |
| No operational owner responds to stale/incorrect content | High | Named publishing/classification/incident roles and runbook | Requires operational ownership model. |
| Future AI produces unsupported or unauthorized advice | High | Separate architecture; retrieval authorization, citations, no execution | Deferred by design. |
| Sustainability/investor claim lacks provenance | High | Methodology/evidence governance; no calculations in library | Future architecture and review required. |

## Review Scores

Scores are readiness of the draft architecture, not implementation quality.

| Area | Score / 10 | Rationale |
| --- | --- | --- |
| Architecture coherence | 8 | Strong repository-first and horizon boundaries; missing state contract. |
| Governance | 6 | Good hierarchy reference; conflict and ownership rules missing. |
| Repository authority | 8 | Clear principle, but published source ref is unresolved. |
| Publication model | 4 | Correctly identified, insufficiently specified for approval. |
| Metadata | 6 | Staged approach is sound; minimum manifest/source rules absent. |
| Lifecycle | 4 | Vocabulary exists; normative combinations/transitions absent. |
| Authority hierarchy | 5 | Existing hierarchy is cited; tie/conflict behavior absent. |
| Security | 6 | Good controls, but discovery leakage and attachments need decisions. |
| Authorization | 5 | Admin-only start is sensible; classification/discovery enforcement incomplete. |
| Rendering | 7 | Secure baseline is credible; attachment/diagram policy incomplete. |
| Search | 5 | Correct scope restraint; acceptance and permission-safe discovery incomplete. |
| Relationships | 5 | Typed-model direction sound; provenance/lifecycle absent. |
| Collections | 6 | Valuable future capability, appropriately deferred; needs model later. |
| Auditability | 6 | Right event categories; ownership/retention/access-review incomplete. |
| Accessibility | 7 | Strong stated principles; diagram and test requirements need precision. |
| Operational practicality | 5 | Bounded Horizon 1; publishing and operating model unresolved. |
| Implementation readiness | 3 | Intentionally not ready; major governance decisions remain. |
| Future AI readiness | 7 | Strong boundaries, appropriate deferral. |
| GeoHaul boundary | 8 | Clearly separated from library and analytics work. |
| Grant / investor readiness | 6 | Appropriate future role; provenance and collection governance remain needed. |
| **Overall readiness** | **6** | Ready for revision and conditional approval review, not implementation. |

## Conditions Before Approval

1. Resolve M-01 through M-05 in CTX-ARCH-009.
2. Add a normative document state/publication matrix and authority/conflict protocol.
3. Define a source-ref and immutable published-set evidence contract without selecting an unverified transport mechanism.
4. Define authorization-before-discovery and no-existence-disclosure behavior for restricted content.
5. Define minimal owners, single-operator overlap controls, lifecycle correction, emergency unpublish, and incident escalation.
6. Add an explicit Horizon 1 exclusion for attachments/downloads/exports unless a controlled policy is approved.

## Conditions Before Implementation Authorization

- Architecture approval record and any required ADRs.
- Approved CTX-STD-002 or equivalent metadata/lifecycle/authority/relationship standard.
- Selected publishing mechanism, storage boundary, source ref, synchronization/freshness/recovery behavior, and credential model.
- Security design for classification, authorization before discovery, renderer sanitization, caching, attachments, and audit redaction.
- Approved API/UI/data change scope, accessibility design, test plan, operational runbook, and ownership.
- Bounded Horizon 1 acceptance criteria and branch/change controls.

## Conditions Before Production Adoption

- Authorized implementation, code review, and production release approval under CTX-DEP-001 and CTX-OPS-001.
- Authorization, restricted-search leakage, sanitizer, path traversal, stale-content, publish rollback, and repository-divergence tests.
- Accessibility and responsive validation, performance evidence, monitoring, alerting, audit-retention evidence, and support/incident readiness.
- Verified source publication, immutable commit/checksum traceability, and disablement/rollback procedure.
- Separate gates for AI, external evidence sharing, GeoHaul integration, and sustainability analytics.

## Recommendations

Revise CTX-ARCH-009 before seeking conditional approval. Preserve its repository-authoritative, Admin-only, read-only Horizon 1 direction. Add governance precision rather than implementation detail: a state matrix, publication reference, conflict protocol, restricted-content discovery rule, operational ownership model, attachment exclusion, and typed relationship provenance.

Do not implement any Operations Library feature until the revised architecture is approved and the implementation gate is separately authorized.

## Future Standards

### Recommended: CTX-STD-002 — Documentation Metadata, Lifecycle, Authority and Relationship Standard

This standard is recommended because CTX-ARCH-009 requires cross-cutting vocabulary and rules that cannot safely remain application-specific. It should define required/derived metadata, identifier format, state vocabulary, transition authorities, published/effective/superseded semantics, authority levels, tie/conflict handling, relationship types/provenance, classification, source-ref/checksum requirements, review intervals, retention, and document-quality validation.

It **does not block approval of a revised architecture draft** if CTX-ARCH-009 contains the necessary governing direction. It **does block implementation authorization** because implementation needs stable metadata, lifecycle, authority, and relationship contracts.

## Future ADRs

- **Repository publishing and immutable published-set ADR:** source ref, publisher, commit/checksum manifest, rollback, freshness, and operational ownership.
- **Operations Library authorization and restricted-content discovery ADR:** category/document access, no-existence-disclosure, cache/index/search/AI boundaries.
- **Search architecture ADR:** approved initial indexing/query approach, ranking, completeness, and authority-aware result behavior.

## Future Architectures

- **AI Knowledge Grounding Architecture:** authorized retrieval, citations, prompt-injection controls, evaluation, retention, and non-execution policy.
- **GeoHaul and CreteXchange Sustainability Intelligence Architecture:** telemetry boundaries, privacy, methodology, provenance, reporting, and evidence controls.
- **Evidence Collection and External Sharing Architecture:** grants, investor due diligence, exports, bundles, restricted access, and audit packages.

## References

- [CTX-ARCH-009](../CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- [CTX-GOV-002 — Documentation Program Health Assessment](../../standards/CTX-GOV-002-documentation-program-health-assessment.md)
- [Documentation Library](../../README.md)
- [CTX-ARCH-004 — Admin Operations Architecture](../admin-operations-architecture.md)
- [CTX-UX-007 — Platform Operations Center Experience](../../ux/CTX-UX-007-platform-operations-center-experience.md)
- [CTX-STD-001](../../standards/cretexchange-platform-standards.md)
- [Development Protocol](../../development-protocol.md)
- [CTX-DEP-001](../../standards/CTX-DEP-001-production-deployment-protocol.md)
- [CTX-OPS-001](../../operations/CTX-OPS-001-production-release-checklist.md)
- [ADR-031](../ADR-031-production-database-migration-execution-architecture.md)
