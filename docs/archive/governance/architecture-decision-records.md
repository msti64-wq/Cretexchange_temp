# Architecture Decision Records

## Purpose

Architecture Decision Records, or ADRs, document important technical choices that shape the platform.

They make implementation intent visible and reviewable.

## When an ADR Should Be Created

Create an ADR when a decision:

- affects a major system boundary
- changes data flow or architecture direction
- introduces a new integration pattern
- establishes a new platform capability model
- has long-term consequences for maintainability or scalability

## Required ADR Content

Each ADR should include:

- Title
- Status
- Context
- Decision
- Rationale
- Alternatives considered
- Consequences
- Related Product Decision(s)

## Approval / Review Workflow

ADR creation should follow this path:

1. Identify the architectural decision.
2. Review the product context and operational impact.
3. Record the decision in an ADR.
4. Link the ADR to relevant product decisions.
5. Review for alignment with the platform vision.
6. Approve before implementation when practical.

## Relationship to Product Decisions

Product Decisions define what the platform should do and why.

ADRs define how the platform should be built to support those decisions.

The two should reference each other whenever a choice affects architecture.

## Examples of Future ADRs

- Mobile Architecture
- Stripe Architecture
- AI Architecture
- Material Catalog Architecture
- Owner Operations Architecture

## Maintenance Note

ADRs should be concise, durable, and easy to search so future contributors can understand why the platform was built the way it was.
