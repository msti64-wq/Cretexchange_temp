# CTX-STD-001 - CreteXchange Platform Standards

**Document ID:** CTX-STD-001  
**Version:** 1.0  
**Status:** Approved  
**Owner:** V8 Laboratories  
**Product:** CreteXchange  
**Effective Date:** July 2026

## Purpose

This document defines the mandatory engineering, architectural, operational, documentation, financial, security, UI, API, and development standards governing every component of the CreteXchange platform.

This document supersedes implementation preferences and serves as the primary governance document for all future development.

## Reference Documents

- CTX-ARCH-001 - Financial Architecture & KPI Specification
- CTX-ARCH-002 - Owner Operations Architecture
- CTX-ARCH-003 - Driver Operations Architecture
- CTX-ARCH-004 - Admin Operations Architecture
- CTX-ARCH-005 - Material Management Architecture

## 1. Platform Philosophy

- Configuration before customization.
- Architecture before implementation.
- Operational transparency.
- Financial conservatism.
- Single source of truth.
- Marketplace before payment processor.
- Scalability before optimization.
- Documentation before deployment.

## 2. Repository Standards

- Use clear folder organization.
- Use consistent naming conventions.
- Group features by domain and ownership boundary.
- Keep component and file naming predictable.
- Place durable documentation in docs/architecture, docs/standards, and docs/product.
- Keep implementation details out of architecture and standards documents.

## 3. Architecture Standards

- Architecture documents govern implementation.
- No implementation may contradict architecture.
- Architecture changes require documentation updates before coding.
- Every subsystem must identify its governing architecture document.

## 4. Business Rule Standards

- Business rules are authoritative.
- Rules are documented before implementation.
- Business rules are reusable.
- Business rules are never duplicated.

## 5. Financial Standards

Reference CTX-ARCH-001.

- Single source of truth.
- Canonical calculations.
- No duplicate financial math.
- Idempotent reconciliation.
- Financially conservative reporting.
- Operational and financial separation.

## 6. Material Standards

Reference CTX-ARCH-005.

- Never hardcode materials.
- Never hardcode pricing.
- Never hardcode settlement models.
- Never hardcode financial direction.
- Never hardcode capacity.
- Never hardcode owner rules.
- Everything is configuration driven.

## 7. Dashboard Standards

- All dashboards shall distinguish operational KPIs, financial KPIs, historical KPIs, current KPIs, pending KPIs, and paid KPIs.
- Dashboard labels must accurately reflect underlying calculations.
- No misleading KPI terminology.

## 8. API Standards

- Use REST conventions.
- Use appropriate HTTP status codes.
- Version APIs consistently.
- Return a consistent response structure.
- Validate inputs.
- Support pagination, filtering, and sorting where relevant.

## 9. Database Standards

- Maintain schema consistency.
- Use UUIDs consistently.
- Apply a soft delete policy where appropriate.
- Include audit timestamps.
- Manage migrations deliberately.
- Preserve foreign keys and indexes.

## 10. Security Standards

- Require authentication where needed.
- Enforce authorization and RBAC.
- Apply least privilege.
- Manage secrets carefully.
- Log auditable actions.
- Rate limit sensitive endpoints.
- Validate input and encode output.

## 11. UI Standards

- Keep dashboards consistent.
- Use clear card layouts, tables, and forms.
- Maintain strong typography and iconography conventions.
- Meet accessibility requirements.
- Support responsive behavior.
- Provide loading, empty, and error states.

## 12. Development Standards

- Prefer TypeScript strict mode.
- Follow React best practices.
- Keep server code organized.
- Use shared helper modules.
- Do not duplicate business logic.
- Use reusable utilities where appropriate.

## 13. Logging Standards

- Use structured logging.
- Redact sensitive data.
- Include correlation IDs when possible.
- Log financial events.
- Log administrative actions.

## 14. Testing Standards

- Write unit tests.
- Write integration tests.
- Validate financial behavior.
- Protect against regressions.
- Verify UI behavior where applicable.

## 15. Documentation Standards

Every major feature requires:
- Architecture
- Business Rules
- Product Decision
- ADR if applicable
- Mermaid diagrams where beneficial
- Cross references

## 16. Git Standards

- Keep commits small.
- Use meaningful commit messages.
- Separate documentation commits from runtime commits whenever practical.

## 17. Codex Engineering Standards

Codex shall:
- Read governing architecture before implementation.
- Reuse canonical helpers.
- Avoid duplicate calculations.
- Avoid alternate business rules.
- Never bypass configuration.
- Never hardcode values governed by architecture.
- Prefer extension over modification.
- Document assumptions.
- Maintain backward compatibility where possible.

## 18. Review Checklist

- Architecture compliance
- Business rule compliance
- Financial compliance
- Security compliance
- Documentation updated
- Testing complete
- Build passes

## 19. Architecture Governance

- Architecture documents govern implementation.
- Standards govern architecture.
- Business rules govern implementation.
- Product decisions govern product direction.
- ADRs govern technical decisions.

## 20. Future Governance

- Every new architecture document shall reference this standard.
- Every sprint shall validate compliance.
- Every pull request shall verify architecture compliance.
- Every major subsystem shall identify:
  - governing architecture
  - governing ADRs
  - governing product decisions

## Architecture Decision Records

### ADR-026 - Platform Standards Govern Development
Decision: CTX-STD-001 governs all future development standards and implementation discipline.

### ADR-027 - Configuration Before Customization
Decision: Configuration is the default extension mechanism; custom code is the exception.

### ADR-028 - Canonical Helpers Before New Logic
Decision: New implementation should reuse canonical helpers before introducing alternate calculations.

### ADR-029 - Documentation Before Implementation
Decision: Architecture and governance documentation must be updated before significant implementation changes.

### ADR-030 - Architecture Compliance Required
Decision: All major components must remain compliant with the governing architecture and standards documents.

