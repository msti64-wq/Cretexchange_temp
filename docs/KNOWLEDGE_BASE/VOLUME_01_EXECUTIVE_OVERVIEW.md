# Volume 01 - Executive Overview

## Company Mission

CreteXchange helps owners and drivers coordinate washout work, track operational activity, and manage related billing, approvals, and payouts in a single platform.

## Platform Overview

CreteXchange is a production web application with owner, driver, admin, and super-admin workflows. The platform supports washout activity reporting, approval flows, billing previews and execution, wallet/accounting views, lottery entry tracking, and legal-term acceptance.

## User Roles

| Role | Primary Responsibilities |
| --- | --- |
| Driver | Complete washout work, track activities, review earnings and wallet history, accept terms, and view lottery participation. |
| Owner | Review washout activity, approve or reject work, review billing and wallet/accounting information, and manage owner-facing settings. |
| Admin | Operate billing, review platform reporting, manage operational workflows, and oversee system health. |
| Super Admin | Perform higher-privilege administrative and operational tasks, including billing and reporting management. |

## Business Philosophy

CreteXchange is run as an operations-first platform. Production changes should be narrow, measurable, and reversible. Billing and accounting behavior should remain consistent with the shared ledger and live schema. User-facing terms and billing language should describe current reality without implying unsupported future guarantees.

## Current Production Deployment

| Item | Value |
| --- | --- |
| Production repository | `msti64-wq/Cretexchange_temp` |
| Production branch | `main` |
| Hosting | Railway |
| Database | Neon |
| Domain | `https://cretexchange.app` |
| Deployment verification | Confirm startup commit hash matches the deployed source revision |

## High-Level System Overview

The current production system includes:

- a React/Vite frontend
- an Express-based backend
- shared schema and domain helpers in `shared/`
- billing and ledger logic that is shared between dry-run and live execution paths
- owner, driver, admin, and super-admin workflows
- legal-term acceptance tracking
- wallet/accounting surfaces for owners and drivers

## Current Operating Region

Production operations are currently managed in `America/Chicago` time. Billing dates, dashboard views, and operational workflows should be interpreted with that timezone in mind unless a route or setting explicitly says otherwise.

## Future Document Roadmap

| Planned Volume | Topic |
| --- | --- |
| Volume 03 | Product and workflow reference |
| Volume 04 | Support and troubleshooting reference |
| Volume 05 | Architecture and data-flow reference |
| Volume 06 | Release and incident response reference |

