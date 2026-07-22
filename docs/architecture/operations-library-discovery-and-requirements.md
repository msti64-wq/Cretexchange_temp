# Operations Library Discovery and Requirements

- **Status:** Supporting discovery for CTX-ARCH-009; not an implementation specification or authorization
- **Date:** July 22, 2026
- **Related architecture:** [CTX-ARCH-009 — Operations Library and Knowledge Management Architecture](./CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- **Evidence boundary:** Repository inspection only. No runtime, Railway, database, provider, or production environment was accessed.

## 1. Purpose and evidence labels

This record separates observed repository facts from the proposed architecture. It supports independent review of CTX-ARCH-009 but does not approve an Operations Library, document synchronization, search, storage, AI, or GeoHaul integration.

| Label | Meaning |
| --- | --- |
| **Verified repository fact** | Directly observed in the checked-out repository at `e5ad8af9e14a57e82c8f08935b0dcc7e69c6575a`. |
| **Inference** | A reasoned conclusion from repository facts; validate before implementation. |
| **Unknown / requires design** | Not established by repository inspection. |

## 2. Documentation landscape

### 2.1 Inventory

**Verified repository fact.** `docs/` contains 117 Markdown files. It is already organized into these principal families: `architecture`, `standards`, `operations`, `product`, `project`, `vision`, `ux`, `business`, `research`, `api`, `development`, `design`, `KNOWLEDGE_BASE`, `archive`, and root-level operational/user/reference documents.

The [Documentation Library](../README.md) is the canonical entry point. Its authority hierarchy places Project Context, CTX-STD-001, applicable CTX-ARCH documents, Product Decisions, the Development Protocol, and release-governance documents in an ordered decision context. It explicitly says supporting, historical, and archived documents cannot override higher authority.

### 2.2 Existing categories and examples

| Category evidenced in repository | Examples | Initial library implication |
| --- | --- | --- |
| Architecture | CTX-ARCH-001 through CTX-ARCH-008; supporting discovery and verification records | First-class taxonomy and authority treatment. |
| ADRs | Embedded historical ADRs and [ADR-031](./ADR-031-production-database-migration-execution-architecture.md) | Distinguish decision records from architecture documents. |
| Standards | CTX-STD-001, CTX-DB-001, CTX-DEP-001 | High-authority documents. |
| Operations and release evidence | Runbooks, checklists, migration release packages | Preserve operational context and status. |
| Product and UX | PD records and CTX-UX specifications | Related, but not interchangeable with architecture. |
| Business, research, grants, and strategy | Business, research, and vision families | Support context and future evidence collections; do not imply current operations. |
| Archive / historical material | `docs/archive/` | Must remain visibly historical and lower authority. |

### 2.3 Metadata and lifecycle findings

**Verified repository fact.** Metadata is not uniform. Newer standards use `Document ID`, version, status, owner, and effective date. CTX-ARCH-008 and ADR-031 use richer status, date, related-document, supersession, and owner fields. Operational procedures, release records, user guides, historical architecture documents, and many legacy files use different headings or no normalized metadata.

**Inference.** Requiring a complete rewrite of legacy documents before a first release would create unnecessary governance risk. A derived metadata model with a small required core, extracted where reliable and explicitly marked incomplete otherwise, is appropriate for staged adoption.

### 2.4 Existing relationships

**Verified repository fact.** Markdown links, README indexes, related-document blocks, release records, and approval records form a useful but inconsistent relationship network. Links are helpful evidence but do not uniformly declare whether a relationship means governs, supports, supersedes, verifies, or is historical.

**Requirement.** An implementation must not treat untyped link inference as authoritative relationship truth.

## 3. Current application findings

### 3.1 Admin surface and navigation

**Verified repository fact.** `client/src/App.tsx` has a role-based Admin/Super Admin route branch within `AdminDarkWorkspace`. It already has top-level operational pages, including Dashboard, Users, Locations, Financial Operations, Rewards, reports, settings, and service accounts. `MobileNav.tsx` uses role-specific navigation and currently includes Financial Operations for Admin and Super Admin.

**Verified repository fact.** There is no Operations Library client page, route, navigation item, API endpoint, or document detail route. Therefore all Operations Library placement, route shape, breadcrumbs, and deep-linking behavior remain architecture work, not current capability.

### 3.2 Authorization model

**Verified repository fact.** The application supports `driver`, `owner`, `admin`, and `super_admin` roles. Server routes commonly enforce `admin` or `super_admin` after authentication; some sensitive routes require `super_admin`. The client router is role-aware, but server-side authorization remains required for sensitive content.

**Unknown / requires design.** There is no current `operations_admin`, compliance-reviewer, support, auditor, investor, document-classification, or document-level permission model.

### 3.3 Rendering, packaging, and search

**Verified repository fact.** The dependency manifest contains no Markdown/MDX rendering package, and source inspection found no document renderer. Production static serving serves the built application from `dist/public`; repository `docs/` are not packaged, copied, or exposed as a documented runtime content source.

**Verified repository fact.** Existing search is feature-specific client filtering and endpoint-specific operational search. There is no repository-document index, document search API, full-text document search, semantic index, or AI retrieval path.

### 3.4 Existing storage and audit conventions

**Verified repository fact.** Object storage exists for application objects such as photos, with configuration-dependent provider selection. It is not evidence of an approved documentation store. Financial batch audit events demonstrate append-only domain audit patterns, but no generic document access, synchronization, publication, or export audit model exists.

**Requirement.** A future Operations Library must not repurpose object storage, operational audit structures, or application roles as an undocumented substitute for a reviewed content, access, or audit design.

## 4. Requirements catalogue

| ID | Requirement | Classification |
| --- | --- | --- |
| OLIB-001 | A first release must be a distinct Admin Dashboard capability with no Driver, Owner, or public access. | MUST |
| OLIB-002 | Git repository documentation remains authoritative; any runtime copy preserves path, commit, and checksum. | MUST |
| OLIB-003 | Current/approved/authoritative status must be visible and drafts or historical material must not appear current. | MUST |
| OLIB-004 | Rendered Markdown must be sanitized and must not execute arbitrary HTML, scripts, iframes, or unapproved external content. | MUST |
| OLIB-005 | Initial discovery must support identifier, title, path, type, headings/body text, status, and tags where available. | SHOULD |
| OLIB-006 | Direct links, related documents, filtering, freshness indication, responsive accessibility, and failure isolation are needed. | SHOULD |
| OLIB-007 | Derived metadata, search, relationships, and user convenience data must remain distinguishable from authoritative content. | MUST |
| OLIB-008 | Direct in-app editing, public access, AI answers, raw telemetry, and grant-report generation are excluded from the first release. | OUT OF SCOPE |
| OLIB-009 | Historical versions, restricted collections, exports, document-level permissions, and synchronization administration are later governance capabilities. | DEFERRED |
| OLIB-010 | Semantic search, grounded AI, GeoHaul references, and sustainability/investor evidence collections are future roadmap capabilities. | DEFERRED |

## 5. Principal gaps and unknowns

- No normalized document manifest, metadata schema, lifecycle vocabulary, relationship declaration, or status parser exists.
- No authoritative runtime publishing/synchronization mechanism or freshness service exists.
- No document visibility/classification model has been approved.
- No content-rendering sanitization policy has been implemented.
- No document-history presentation, access audit, export, or search-index architecture exists.
- Repository inspection cannot establish private-repository runtime credential strategy, rate limits, hosted search capability, deployment artifact constraints, or content classification requirements.

## 6. Discovery conclusion

Repository convention supports a separate factual discovery artifact: CTX-ARCH-008 already uses that pattern. CTX-ARCH-009 should adopt a repository-authoritative, read-only, Admin-only initial posture and defer all runtime mechanisms, data schemas, roles beyond existing trusted Admin roles, and AI/GeoHaul integrations to separate authorized design and implementation work.

## References

- [Documentation Library](../README.md)
- [Architecture Library](./README.md)
- [CTX-STD-001](../standards/cretexchange-platform-standards.md)
- [Development Protocol](../development-protocol.md)
- [CTX-ARCH-004 — Admin Operations Architecture](./admin-operations-architecture.md)
- [ADR-031](./ADR-031-production-database-migration-execution-architecture.md)
