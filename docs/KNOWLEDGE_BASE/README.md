# CreteXchange Knowledge Base

This knowledge base is the long-form technical and operational reference for CreteXchange. It is intended to capture the current production state, the engineering rules that keep the platform safe to change, and the business context needed to work effectively in the Railway production line.

The knowledge base is organized into volumes so that operational, product, and engineering material can be maintained without mixing concerns.

## Volumes

| Volume | File | Purpose |
| --- | --- | --- |
| Volume 01 | [VOLUME_01_EXECUTIVE_OVERVIEW.md](./VOLUME_01_EXECUTIVE_OVERVIEW.md) | Company mission, platform overview, user roles, current deployment, and high-level system context. |
| Volume 02 | [VOLUME_02_ENGINEERING_MANUAL.md](./VOLUME_02_ENGINEERING_MANUAL.md) | Development protocol, repository standards, deployment workflow, validation workflow, UI standards, logging standards, and known production truths. |

## Purpose

The Knowledge Base exists to provide a stable reference for:

- how CreteXchange is deployed and operated in production
- which repository and branch are the source of truth
- how engineers should approach code changes safely
- what current production behavior should be preserved
- what is known to be true about billing, terms, wallet accounting, and design-system rollout

It should be used as a read-first reference before making changes.

## Planned Volumes

Additional volumes may be added over time for product, operations, support, compliance, and architecture, but they should only be created when there is a clear need and a stable scope.

Planned future areas:

- product and workflow reference
- support and troubleshooting reference
- architecture and data-flow reference
- release and incident response reference

## Revision History

| Date | Version | Author | Notes |
| --- | --- | --- | --- |
| 2026-06-25 | 1.0 | Codex | Initial knowledge base created with executive overview and engineering manual volumes. |

## Navigation

- [Volume 01 - Executive Overview](./VOLUME_01_EXECUTIVE_OVERVIEW.md)
- [Volume 02 - Engineering Manual](./VOLUME_02_ENGINEERING_MANUAL.md)
- [CreteXchange Development Protocol](../development-protocol.md)
