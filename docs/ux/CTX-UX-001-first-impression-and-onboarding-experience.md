# CTX-UX-001 — First Impression and Onboarding Experience

**Document ID:** CTX-UX-001

**Status:** Foundational UX architecture

**Product:** CreteXchange
**Scope:** Public-facing experience and onboarding philosophy

## 1. Purpose

CreteXchange's public-facing experience is the beginning of an operational relationship, not a standalone marketing website. A visitor's first impression affects whether a driver can confidently begin onboarding, whether a facility owner sees a practical reason to participate, and whether both understand the next step.

This document defines the experience architecture for the landing page, public messaging, first impression, and onboarding philosophy. It does not authorize implementation, redesign existing React pages, change routes, or describe unimplemented functionality as available.

## 2. Experience Vision

The CreteXchange experience should feel:

- professional and modern
- trustworthy and operationally grounded
- clear, confident, and construction-focused
- technology-enabled without being technology-first in its language
- practical for field and facility work

The experience should avoid startup hype, vague sustainability claims, unnecessary buzzwords, and exaggerated promises. It should make a serious construction professional feel that the platform understands real work, real locations, and real operating constraints.

## 3. Brand Position

CreteXchange is **the trusted operational network connecting construction professionals with verified material recovery facilities while establishing the operational foundation for the future Construction Circular Economy Intelligence Platform.**

### Current MVP value

The current MVP centers practical operational workflows: participant onboarding, facility discovery, location configuration, verified activity, and role-appropriate operational visibility. Public messaging must describe only capabilities that are approved and available in the current product context.

### Long-term direction

The Construction Circular Economy Intelligence Platform is the long-term mission described by [Platform Vision](../vision/platform-vision.md) and [Platform Strategy](../vision/platform-strategy.md). It is a direction, not a present-day feature claim. Future marketplace, enterprise, government, research, and index capabilities must remain clearly distinguished from the MVP.

## 4. Primary Audiences

### Primary audience — Drivers

| Dimension | Experience need |
| --- | --- |
| Goals | Find an eligible facility, understand the next step, complete work efficiently, and record verified activity. |
| Concerns | Wasted time, unclear facility rules, uncertain eligibility, complex onboarding, and unclear status. |
| Desired action | Choose the Driver path and begin or continue onboarding. |

### Secondary audience — Facility Owners

| Dimension | Experience need |
| --- | --- |
| Goals | Make a facility discoverable, configure operational readiness, receive appropriate activity visibility, and manage participation. |
| Concerns | Operational disruption, unclear setup, poor-quality activity, and loss of control over facility information. |
| Desired action | Choose the Facility path and begin or continue facility onboarding. |

### Future audiences

| Audience | Goals | Concerns | Desired action |
| --- | --- | --- | --- |
| Contractors | Reliable material-recovery coordination and visibility. | Workflow fit and operational evidence. | Understand the future network direction; do not imply current availability. |
| Ready Mix Producers | Practical facility and material-workflow coordination. | Integration with existing operations. | Understand the platform's operational foundation. |
| Municipalities | Governed, aggregated operational insight. | Privacy, methodology, and public accountability. | Learn about future-direction opportunities only. |
| Environmental Organizations | Credible evidence of recovery activity and outcomes. | Unsupported environmental claims. | Understand the verified-data direction only. |
| Investors | A practical, trusted network with durable expansion potential. | Unproven scale or exaggerated claims. | Understand the MVP foundation and long-term vision. |
| Researchers | Governed, traceable data opportunities. | Data governance, consent, and methodological rigor. | Understand the future research direction only. |

## 5. User Journey

```text
Visitor
↓
Landing Page
↓
Choose Driver or Facility
↓
Registration
↓
Profile Completion
↓
Operational Dashboard
↓
Verified Activity
↓
Platform Operations Center
```

The journey is role-aware. Drivers and facility owners should encounter a clear, relevant decision at the landing page, then move through registration and profile completion without needing to understand unrelated roles or future capabilities. The Platform Operations Center is an administrator-facing operational destination; it is not a public onboarding destination.

## 6. Messaging Hierarchy

Public messaging should answer these questions in order:

1. **What is CreteXchange?** A trusted operational network for construction professionals and verified material recovery facilities.
2. **Why should I care?** It helps participants find, prepare for, and record practical facility activity with clearer workflows.
3. **How does it work?** Select a role, create an account, complete the relevant profile, and use the operational workflow.
4. **What should I do next?** Begin as a Driver or Facility Owner through the single relevant call to action.

The first screen should make the value proposition and the next action understandable without requiring a visitor to read a long explanation.

## 7. Landing Page Information Architecture

The recommended public-page structure is:

1. **Hero** — concise definition of the operational network with a clear role-aware primary action.
2. **Value Proposition** — the practical problem addressed for construction operations and facility participation.
3. **How It Works** — a short, accurate explanation of role selection, onboarding, and verified activity.
4. **Drivers** — driver-focused value, concerns addressed, and a Driver action.
5. **Facilities** — facility-owner value, readiness context, and a Facility action.
6. **Operational Trust** — verified activity, clear workflows, professional standards, and accurate terminology.
7. **Future Vision** — a restrained statement that today's operational foundation supports the long-term Construction Circular Economy Intelligence Platform.
8. **Footer** — essential navigation, support, legal, and trust references appropriate to the implemented product.

Each section should maintain one primary call to action. Supporting links may provide context, but they must not compete with the decision required at that point in the journey.

## 8. Visual Language

The visual language should communicate coordinated construction operations, logistics, infrastructure, and professional field work. It should be expansive enough for the platform's future direction while remaining credible for today's concrete washout foundation.

Recommended imagery and visual motifs include:

- construction operations and infrastructure
- logistics and multiple vehicle types
- coordinated activity between people, facilities, and locations
- construction technology used in practical settings
- professional, well-organized environments

Avoid visual identity that depends exclusively on concrete trucks, novelty imagery, or generic technology imagery detached from construction work. Use hierarchy, typography, spacing, and accessible contrast to convey professional confidence. Any future implementation must follow the [Design documentation](../design/README.md) and applicable accessibility standards.

## 9. UX Design Principles

- **Mobile first:** Field users must be able to understand and act on the journey from a phone.
- **Simplicity:** Explain the immediate next step before presenting deeper detail.
- **Progressive disclosure:** Reveal complexity only when it becomes relevant to the selected role or workflow.
- **One primary action per section:** Do not ask visitors to make competing decisions.
- **Consistent terminology:** Use the same role, activity, facility, and verification terms across public and authenticated experiences.
- **Professional spacing:** Use calm layout rhythm and readable grouping to reduce cognitive load.
- **Accessible layouts:** Support legibility, contrast, keyboard use, semantic structure, and responsive reading order.
- **Operational clarity:** Explain actions, requirements, and status plainly; avoid ambiguous promotional language.

## 10. Trust Strategy

Trust is created through the experience as much as through policy. The public journey should establish trust by:

- describing verified activity accurately and without overstating what verification proves
- presenting clear workflows and role-specific next steps
- using a professional, consistent visual and content system
- applying transparent terminology to facilities, activity, and participant roles
- presenting operational metrics only where their definitions and availability are clear
- preserving a consistent handoff from public messaging to registration and authenticated workspaces

Trust language must not imply payment completion, settlement, environmental impact, facility certification, or future intelligence capabilities unless those claims are explicitly supported by the current product and governing documentation.

## 11. MVP Positioning

### Current MVP

The MVP is a practical operating foundation for drivers and facility owners. Its public experience should prioritize onboarding readiness, facility participation, verified operational activity, and a clear path into the relevant workspace.

### Future vision

CreteXchange may evolve into a broader construction circular economy intelligence platform. That vision should be presented as a long-term commitment to trusted operational data and better coordination—not as a promise that advanced marketplaces, enterprise SaaS, government intelligence, or the Construction Circular Economy Index already exist.

## 12. Future Evolution

As the verified operational network matures, the experience architecture may extend to additional construction participants, recovered-material workflows, governed intelligence, and role-aware information products. Future changes must preserve the same fundamentals: operational credibility, clear audience value, evidence-based claims, and appropriate privacy and governance.

This document defines no implementation sequence or timeline. [Platform Strategy](../vision/platform-strategy.md) remains the authoritative long-term strategic roadmap; approved sprint documents define delivery scope.

## 13. UX Decision Filter

Before approving a public-experience, landing-page, or onboarding change, answer:

- Does this improve the first impression for a real construction professional?
- Does it increase the likelihood of successful driver onboarding?
- Does it increase the likelihood of successful facility onboarding?
- Does it reduce confusion about what CreteXchange is and what to do next?
- Does it reinforce trust through accurate, professional, and transparent communication?
- Does it support today's MVP while preserving tomorrow's vision?
- Does it avoid presenting future strategic capabilities as current functionality?

If the answer is no, defer the change unless it is required for safety, accessibility, legal compliance, or a separately approved operational need.

## 14. Governance and Boundaries

This UX architecture is governed by the documentation hierarchy in [Project Context](../project/project-context.md) and [CTX-STD-001](../standards/cretexchange-platform-standards.md). It informs future public-experience work but does not override implementation architecture, product decisions, business rules, or approved sprint scope.

It does not authorize:

- React-page or component redesigns
- route or navigation changes
- new public claims, capabilities, integrations, or data collection
- changes to financial, settlement, Stripe, wallet, or billing behavior
- CCEI expansion work

Any implementation derived from this document requires separate approved scope, source-of-truth verification, and risk-based validation under the [Development Protocol](../development-protocol.md).
