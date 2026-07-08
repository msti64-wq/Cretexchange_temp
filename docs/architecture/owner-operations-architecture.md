# CTX-ARCH-002 — CreteXchange Owner Operations Architecture

**Document ID:** CTX-ARCH-002  
**Version:** 1.0  
**Status:** Approved  
**Owner:** V8 Laboratories  
**Product:** CreteXchange  
**Effective Date:** July 2026  
**Purpose:** Define the complete owner operational architecture, business rules, workflows, KPIs, and extensibility model for all owner-facing functionality.

## 1. Purpose

The owner portal is the operational control center for every registered washout or material location.

Owners manage:

- locations
- materials accepted
- pricing
- driver interactions
- approvals
- capacity
- compliance
- operational settings
- billing visibility

This architecture defines how those responsibilities are modeled in the product and how owner-facing workflows should behave over time.

## 2. Owner Operations Philosophy

- Operational management is separate from financial accounting.
- Owners control facility configuration.
- Drivers consume owner-defined operational data.
- Financial calculations follow CTX-ARCH-001.
- Every owner action should have a measurable operational outcome.

The owner portal should help owners run their sites, not just inspect financial data.

## 3. Guiding Principles

- Configuration over hardcoding.
- Material-specific behavior.
- Operational transparency.
- Driver safety.
- Environmental compliance.
- Extensible data model.
- Dashboard KPIs answer one operational question.
- Future features should extend rather than replace the architecture.

## 4. Owner Operational State Machine

Owner Creates Location  
→ Configure Materials  
→ Configure Pricing  
→ Configure Availability  
→ Open for Drivers  
→ Driver Check-In  
→ Owner Review  
→ Approve / Reject  
→ Billing  
→ Reporting  
→ Historical Analytics

### Transition meanings

- **Owner Creates Location**
  - A new location record is created.
  - Operational data may still be incomplete.
- **Configure Materials**
  - The owner defines what the site accepts.
  - Material rules and restrictions become available to drivers.
- **Configure Pricing**
  - The owner sets driver incentives, platform fee context, and site-specific pricing behavior.
- **Configure Availability**
  - Hours, capacity, and restrictions are set.
- **Open for Drivers**
  - The location is visible as eligible for driver workflows.
- **Driver Check-In**
  - A driver creates an operational visit or washout activity.
- **Owner Review**
  - The owner inspects the activity and supporting evidence.
- **Approve / Reject**
  - The owner decides whether the activity is billable and acceptable.
- **Billing**
  - Approved billable activities feed financial architecture and billing summaries.
- **Reporting**
  - Operational reporting aggregates activity and site behavior.
- **Historical Analytics**
  - Long-term trends, approvals, capacity, and compliance are analyzed.

## 5. Location Lifecycle

### Draft
- Operational meaning: location is being configured.
- Visibility: not yet available to drivers.

### Pending Approval
- Operational meaning: location is awaiting review or activation.
- Visibility: limited or hidden.

### Active
- Operational meaning: location is available for driver use.
- Visibility: visible to eligible drivers.

### Temporarily Closed
- Operational meaning: location is paused for a short period.
- Visibility: hidden or deprioritized temporarily.

### Suspended
- Operational meaning: location is blocked by admin or compliance action.
- Visibility: unavailable until restored.

### Archived
- Operational meaning: location is retired.
- Visibility: historical only.

## 6. Material Management Architecture

The system should maintain a material catalog rather than hard-code material names in UI or workflow logic.

### Example material groups

#### Concrete
- Ready Mix Washout
- Returned Concrete
- Slurry
- Wash Water
- Hardened Concrete

#### Aggregates
- Sand
- Gravel
- Rock

#### Excavation
- Dirt
- Topsoil
- Clay

#### Recycling
- Asphalt Millings
- Rebar
- Scrap Metal
- Wood
- Plastic

#### Future
- Hazardous Materials

The catalog is extensible and should grow with platform support for new material classes and regions.

## 7. Material Acceptance Rules

Each material can be configured as:

- Accepted
- Not Accepted
- Approval Required
- Temporarily Suspended
- Hidden

### Operational meaning

- **Accepted**
  - Drivers may be matched with the location for that material.
- **Not Accepted**
  - The location does not support that material.
- **Approval Required**
  - Drivers or owners may need manual review before the site is eligible.
- **Temporarily Suspended**
  - Material handling is paused temporarily.
- **Hidden**
  - Material is not shown in normal operational selection flows.

## 8. Material Pricing Model

For every material, the owner configuration may define:

- Driver Incentive
- Platform Fee
- Owner Charge
- Default Capacity
- Measurement Unit
- Photo Requirements
- Restrictions
- Instructions
- Availability

Owner Charge must follow CTX-ARCH-001.

The material pricing model should allow site-specific differentiation without hard-coding per-material UI logic.

## 9. Capacity Management

Capacity should be modeled per location and, when relevant, per material.

Definitions:

- Maximum Capacity
- Current Inventory
- Remaining Capacity
- Availability Thresholds
- Capacity Alerts
- Full
- Near Full
- Unavailable

Future support should allow automatic capacity updates from activity state, manual adjustments, or integrated site systems.

## 10. Hours of Operation

Operational availability should support:

- Weekly Schedule
- Holiday Overrides
- Emergency Closures
- Weather Closures
- Temporary Closures
- Lunch Breaks
- Maintenance Windows

Hours of operation are part of the owner’s operational control surface and should influence driver eligibility.

## 11. Driver Instructions

Owner-configurable instructions may include:

- Entrance
- Exit
- Scale Procedures
- PPE
- Safety
- Speed Limits
- Maximum Vehicle Size
- Dispatch Contact
- Gate Codes
- Site Maps

Instructions should be visible to drivers at the point of action and remain editable by owners.

## 12. Photo Requirements

Owner-configurable photo rules may include:

- Truck Number
- Rear Drum
- Washout Area
- Completed Cleanup
- GPS
- Timestamp
- Additional Custom Photos

Photo requirements should support compliance, verification, and dispute reduction.

## 13. Operational Restrictions

Examples of restrictions:

- Commercial Only
- Approved Contractors
- Maximum Loads
- Maximum Daily Visits
- Appointment Required
- Business Hours Only
- Driver Certification Required

Restrictions should be clear, enforceable, and visible before driver arrival whenever possible.

## 14. Environmental Compliance

Owner sites may require compliance records such as:

- EPA Permit
- State Permit
- Local Permit
- Inspection Schedule
- Expiration Dates
- Compliance Alerts
- Environmental Notes

Compliance status should be visible in the owner workflow and eligible for admin review.

## 15. Owner Dashboard KPI Catalog

### Active Sites
- Purpose: show how many locations are operational.
- Audience: owner
- Source: owner location records
- Calculation: count of active locations
- Update Trigger: location lifecycle changes
- Included: active, eligible sites
- Excluded: draft, suspended, archived

### Pending Reviews
- Purpose: show work awaiting owner action.
- Audience: owner
- Source: pending washout activities
- Calculation: count of pending/submitted/awaiting-approval statuses
- Update Trigger: new check-in or status change
- Included: pending operational reviews
- Excluded: billable or rejected activities

### Billable Washouts
- Purpose: show billable activity in the selected period.
- Audience: owner
- Source: billable activity statuses
- Calculation: verified/approved/completed count
- Update Trigger: status change
- Included: billable washouts
- Excluded: pending, rejected, cancelled, declined

### Rejected Washouts
- Purpose: show rejected or non-billable activity.
- Audience: owner
- Source: washout status mix
- Calculation: rejected/declined/cancelled count
- Update Trigger: rejection or status change
- Included: rejected washouts
- Excluded: billable washouts

### Current Receivables
- Purpose: show current financial obligations.
- Audience: owner
- Source: canonical billing receivables summary
- Calculation: total owner charge
- Update Trigger: approval and billing summary refresh
- Included: billable receivables
- Excluded: pending review, paid history

### Platform Fees
- Purpose: show platform portion of current receivables.
- Audience: owner
- Source: canonical billing receivables summary
- Calculation: platform fee sum
- Update Trigger: billing summary refresh
- Included: platform fees
- Excluded: driver incentives

### Driver Tips
- Purpose: show driver incentive portion of current receivables.
- Audience: owner
- Source: canonical billing receivables summary
- Calculation: driver tip sum
- Update Trigger: billing summary refresh
- Included: driver incentives
- Excluded: platform fees

### Owner Charges
- Purpose: show combined charge obligation.
- Audience: owner
- Source: canonical billing receivables summary
- Calculation: platform fees + driver tips
- Update Trigger: billing summary refresh
- Included: current owner charge
- Excluded: paid history

### Material Capacity
- Purpose: show remaining site capacity.
- Audience: owner
- Source: capacity settings and operational activity
- Calculation: remaining capacity estimate
- Update Trigger: activity, owner update, or manual adjustment
- Included: active material capacity
- Excluded: archived capacity

### Open Locations
- Purpose: show currently available sites.
- Audience: owner
- Source: location lifecycle records
- Calculation: active open locations
- Update Trigger: location lifecycle changes
- Included: active locations
- Excluded: suspended or archived locations

### Driver Visits
- Purpose: show site traffic volume.
- Audience: owner
- Source: activity history
- Calculation: count of driver visits in selected range
- Update Trigger: new activity
- Included: visit history
- Excluded: non-visit admin records

### Average Approval Time
- Purpose: show operational review speed.
- Audience: owner
- Source: activity timestamps
- Calculation: time from check-in to approval/rejection
- Update Trigger: status change
- Included: reviewed activities
- Excluded: unreviewed pending items

### Revenue Trends
- Purpose: show directional operational and financial performance.
- Audience: owner
- Source: reporting layer
- Calculation: aggregated trends over time
- Update Trigger: report refresh
- Included: historical trends
- Excluded: raw unprocessed records

## 16. Driver Experience Integration

Owner configuration affects drivers through:

- Accepted Materials
- Hours
- Capacity
- Instructions
- Photos
- Restrictions
- Pricing Visibility

Driver-facing workflows should read owner configuration as a live operational source of truth.

## 17. Admin Integration

Administrators may override or control:

- Suspend Location
- Adjust Materials
- Compliance Flags
- Review Queue
- Platform Settings

Admin tools should support governance, compliance, and escalation without undermining owner autonomy.

## 18. Notifications

Owner notifications may include:

- New Check-In
- Pending Approval
- Capacity Warning
- Compliance Expiration
- Failed Billing
- Driver Questions
- Location Status

Notifications should be tied to actionable owner operations.

## 19. Reporting

Operational reports may include:

- Activity
- Materials
- Capacity
- Approvals
- Driver Visits
- Environmental
- Performance

Financial reports must reference CTX-ARCH-001.

Operational reporting should remain distinct from financial reporting, even when they reference the same site or activity.

## 20. Architecture Decision Records

### ADR-006 — Owner Configuration Drives Operations

**Decision:** Owner-defined configuration is the source of truth for operational behavior at a location.

### ADR-007 — Material-Centric Architecture

**Decision:** Material configuration should be a first-class concern in owner-facing workflows.

### ADR-008 — Capacity Managed Per Material

**Decision:** Capacity should be modeled at the material and location level where applicable.

### ADR-009 — Operational KPIs Separated From Financial KPIs

**Decision:** Owner KPIs must distinguish operational status from financial obligation.

### ADR-010 — Configurable Owner Workflow

**Decision:** Owner workflows should be configurable and extensible rather than hard-coded.

## 21. Codex Engineering Rules

- Never hardcode accepted materials.
- Never duplicate owner configuration logic.
- Material behavior must be configuration driven.
- Dashboard KPIs must use shared operational helpers.
- New owner features require architecture updates.
- Future schema changes must preserve extensibility.

## 22. Future Expansion

The architecture should support future owner site types and operational models, including:

- Quarries
- Landfills
- Transfer Stations
- Aggregate Plants
- Recycling Facilities
- Asphalt Plants
- Municipal Disposal
- Industrial Waste
- Environmental Monitoring
- Fleet Scheduling
- AI Capacity Forecasting
- Predictive Analytics

## 23. Change Governance

Any owner operational change must:

- update CTX-ARCH-002
- identify affected APIs
- identify affected dashboards
- identify affected workflows
- include migration guidance when required

This document is the governing source for owner operations architecture until superseded by a newer approved architecture document.
