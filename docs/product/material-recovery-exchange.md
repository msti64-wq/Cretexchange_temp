# Material Recovery Exchange

## 1. Purpose

Material Recovery Exchange expands CreteXchange beyond concrete washout into construction material recovery, recycling, and responsible disposal.

The goal is to match the right load to the right location with the right operational context, while preserving the existing washout workflow as its own distinct driver mode.

## 2. Driver Operating Modes

### Mode 1: Ready-Mix / Washout Driver

This mode supports drivers who deliver ready-mix concrete and need approved washout locations between loads.

Workflow:

1. Batch plant
2. Job site delivery
3. Washout
4. Return to batch plant
5. Next load

Operational notes:

- A driver may deliver 3-7 fresh concrete loads per day.
- After each delivery, the driver must complete a washout before receiving the next batch.
- CreteXchange value: find approved washout locations quickly.

### Mode 2: Material Recovery Driver

This mode supports contractors and haulers working demolition, cleanup, excavation, or site prep.

Workflow:

1. Demolition / prep / construction site
2. Load rubble or recoverable material
3. Find the cheapest, closest, or best accepted material destination
4. Drop off material
5. Return to job site or next pickup

Operational notes:

- These drivers may be contractors or haulers working demolition, cleanup, excavation, or site prep.
- CreteXchange value: match the load to locations that accept the material and possibly tip, pay, or incentivize receiving it.

## 3. Material Catalog

Initial material types:

- Broken Concrete
- Returned Concrete
- Asphalt
- Brick
- Block / CMU
- Dirt
- Sand
- Gravel
- Rock
- Rebar
- Mixed Demolition
- Other

Catalog guidance:

- Materials should eventually be catalog-driven, not hard-coded.
- A load may contain multiple materials.
- Materials can be active or inactive.
- Materials can be driver-selectable, owner-acceptable, and reward-eligible.

## 4. Owner Acceptance Model

Owners should be able to configure what each location accepts.

For each material, future owner settings may include:

- accepted / not accepted
- tip amount
- fee amount if applicable
- max load size
- capacity status
- special instructions
- contamination restrictions
- whether mixed loads are accepted

## 5. Driver Matching

Future matching should consider:

- operating mode
- selected materials
- GPS distance
- accepted materials
- tip amount
- disposal / recovery fee
- open / closed status
- owner instructions
- whether a location accepts all or some selected materials

## 6. Sticky Job Type Selection

CreteXchange should support a sticky driver job type setting so drivers can keep a stable operating context across sessions.

Initial job types:

- Ready-Mix / Washout
- Material Recovery
- Both / Ask Each Shift

Guidance:

- Persist the selection locally for the first phase.
- Let drivers change context easily from the dashboard.
- Keep this separate from any future database-backed profile preference.
- Do not force material selection or location filtering yet.

Future guidance:

- A persistent database-backed job type belongs in a later phase.
- Location filtering should follow after the driver context model is validated.
- Owner material acceptance remains its own future phase.

## 7. Rewards

Rewards may differ by operating mode.

- Washout completion may earn standard entries.
- Material recovery may earn enhanced entries.
- Environmentally beneficial recovery may earn bonus entries.

Final reward rules are intentionally not defined yet.

## 8. Analytics and Business Intelligence

Material recovery data can support:

- most accepted materials
- most recovered materials
- most active recovery locations
- highest-tipping recovery locations
- market gaps
- regional demand
- owner performance
- admin marketing insights

## 9. Material Recovery Exchange Capability Stages

These historical capability stages are local to this product concept and are not program phase identifiers. In particular, Capability Stage 6 below does not conflict with or redefine the Founder-approved **Phase 6 — Material Quantity and Recovery Economics** governed by [PD-062](./PD-062-material-quantity-measurement-and-facility-recovery-offers-future-direction.md).

### Capability Stage 1

Documentation and product definition.

### Capability Stage 2

Driver operating mode and sticky job type UI foundation.

### Capability Stage 3

Owner material acceptance configuration.

### Capability Stage 4

Driver material selection and location filtering.

### Capability Stage 5

Material recovery reward logic.

### Capability Stage 6

Analytics and admin intelligence.

## 10. Guardrails

- Do not treat Ready-Mix and Material Recovery as the same workflow.
- Do not force ready-mix drivers to select materials every trip.
- Do not change existing washout behavior until the new flow is fully defined.
- Do not change `/driver/locations` without a preservation strategy.
- Keep Material Recovery extensible.
- Keep sticky job type persistence local until a later database-backed phase is defined.
