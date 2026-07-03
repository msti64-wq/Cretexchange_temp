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

## 6. Rewards

Rewards may differ by operating mode.

- Washout completion may earn standard entries.
- Material recovery may earn enhanced entries.
- Environmentally beneficial recovery may earn bonus entries.

Final reward rules are intentionally not defined yet.

## 7. Analytics and Business Intelligence

Material recovery data can support:

- most accepted materials
- most recovered materials
- most active recovery locations
- highest-tipping recovery locations
- market gaps
- regional demand
- owner performance
- admin marketing insights

## 8. Implementation Phases

### Phase 1

Documentation and product definition.

### Phase 2

Driver operating mode UI foundation.

### Phase 3

Owner material acceptance configuration.

### Phase 4

Driver material selection and location filtering.

### Phase 5

Material recovery reward logic.

### Phase 6

Analytics and admin intelligence.

## 9. Guardrails

- Do not treat Ready-Mix and Material Recovery as the same workflow.
- Do not force ready-mix drivers to select materials every trip.
- Do not change existing washout behavior until the new flow is fully defined.
- Do not change `/driver/locations` without a preservation strategy.
- Keep Material Recovery extensible.
