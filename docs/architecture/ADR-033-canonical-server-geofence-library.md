# ADR-033 — Canonical Server Geofence Library

- **Status:** Proposed implementation selection — Work Package 1 complete locally; Founder acceptance pending
- **Date:** 2026-08-04
- **Owner / approval authority:** Michael Loren Stiger
- **Related architecture:** [CTX-ARCH-016 — Canonical Facility Geofence Architecture](./CTX-ARCH-016-canonical-facility-geofence-architecture.md)
- **Supersedes:** None
- **Superseded by:** None

## Context

CTX-ARCH-016 requires one deterministic server authority for GeoJSON Polygon validation, boundary-inclusive point classification, geodesic nearest-edge distance, area/span limits, self-intersection detection, and radius distance. Work Package 1 must not place canonical evaluation in a browser or map provider and must avoid an unnecessary client bundle.

## Decision

Use the focused Turf 7.3.5 module set below, pinned exactly:

- `@turf/area`
- `@turf/bbox`
- `@turf/boolean-point-in-polygon`
- `@turf/distance`
- `@turf/helpers`
- `@turf/kinks`
- `@turf/point-to-line-distance`

All selected modules are MIT-licensed, include TypeScript declarations, are maintained in the active Turf monorepo, and were published as version 7.3.5 in 2026. They are imported only by `server/facilityGeofenceService.ts`. Vite client sources contain no Turf import, and the server build already treats packages as external.

The focused set adds seven direct dependencies and 18 package-lock nodes rather than the 117 direct dependencies declared by the all-encompassing `@turf/turf` package. The repository lockfile grows by approximately 250 lines. The package-install audit reported the repository's existing aggregate audit result of 36 findings; this ADR does not attribute unrelated aggregate findings to Turf, and no automatic audit rewrite was run.

## Rationale

The selected modules cover each governed operation without custom operational geometry math:

- `boolean-point-in-polygon` provides explicit boundary-inclusive behavior through `ignoreBoundary: false`;
- `point-to-line-distance` calculates geodesic minimum distance to the closed exterior ring;
- `distance` calculates radius center distance and WGS84 span;
- `area` and `bbox` enforce bounded operational geometry;
- `kinks` rejects self-intersections; and
- `helpers` constructs validated GeoJSON features.

The canonical service still owns structural and policy validation: one exterior ring, WGS84 coordinate order/range, closure, distinct vertices, limits, checksum, lifecycle, GPS confidence, uncertainty, and result projection. Turf supplies geometry operations; it does not own CreteXchange policy.

## Alternatives considered

| Alternative | Disposition |
| --- | --- |
| `@turf/turf` 7.3.5 | Rejected for Work Package 1 because its 117 declared dependencies are substantially broader than the seven operations required. |
| `geolib` 3.3.14 | Rejected despite MIT licensing, current maintenance, TypeScript declarations, and zero dependencies because it does not provide the complete GeoJSON topology/self-intersection validation set; adopting it would require additional custom polygon logic. |
| PostGIS | Deferred by CTX-ARCH-016 until scale, spatial-query, extension, backup, and recovery evidence justify the operational change. |
| Custom Haversine/polygon implementation | Rejected because the repository already contains duplicated distance logic and custom polygon math would weaken correctness and maintainability. |
| Map-provider evaluation | Rejected because a browser/provider response cannot be the durable server authority. |

## Consequences and boundaries

- Server geometry evaluation is deterministic and unit-testable against immutable boundary versions.
- The client bundle and participant-facing behavior remain unchanged in Work Package 1.
- Turf versions must move together and require dependency, geometry-regression, TypeScript, and build validation.
- This decision does not authorize Owner/Driver UI, submission enforcement, geofence notifications, Production migration execution, feature activation, deployment, or legacy retirement.
- Founder acceptance is required before these unstaged Work Package 1 changes may be committed or advanced.

## References

- [CTX-ARCH-016](./CTX-ARCH-016-canonical-facility-geofence-architecture.md)
- [PD-061](../product/PD-061-facility-geofence-and-operational-exception-policy.md)
- [Development Protocol](../development-protocol.md)
- [CTX-DB-001](../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md)
