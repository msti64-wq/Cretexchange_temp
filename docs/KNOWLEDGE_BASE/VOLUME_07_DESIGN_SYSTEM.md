# Volume 07 - Design System

## Document Metadata

| Field | Value |
| --- | --- |
| Purpose | Document the current production design language and contrast standards. |
| Scope | Production UI behavior only; no speculative styling systems. |
| Version | 1.0 |
| Status | Active |
| Last Updated | 2026-06-25 |
| Maintained By | CreteXchange engineering and design operations |

## Revision History

| Date | Version | Author | Notes |
| --- | --- | --- | --- |
| 2026-06-25 | 1.0 | Codex | Initial design-system volume created. |

## Industrial Design Philosophy

CreteXchange uses an industrial, operational design language. The UI should feel functional, dense, readable, and task-oriented rather than decorative.

Current principles:

- prioritize scanability over ornament
- keep information hierarchy strong
- favor readable controls in default state
- preserve clarity on dark slate surfaces
- use consistent spacing and typography across roles

## Dark Theme Standards

The current production UI is primarily dark themed.

Approved dark background surfaces:

- `#121417`
- `#1B1F24`
- `#242A31`
- black / slate / zinc / gray-900 variants where used by the design system

Approved text and accent colors on dark surfaces:

- white / off-white
- bright blue
- bright green
- bright orange
- bright yellow
- bright red

### Contrast Rule

Dark/slate backgrounds shall always use high-contrast text (white, bright blue, bright green, orange, or red). Never use low-contrast slate or dark-blue text on slate backgrounds.

## Light Theme Standards

Light surfaces may be used for overlays, inputs, or legacy surfaces when present in production.

Current rule:

- light backgrounds must use dark readable text
- avoid white or near-white text on light surfaces
- do not use low-contrast gray text if the background is also light

## Color Palette

| Token / Color | Intended Use |
| --- | --- |
| `#121417` | App background |
| `#1B1F24` | Card background |
| `#242A31` | Elevated background |
| `#2A3138` | Border |
| `#F5F7FA` | Primary text |
| `#AAB4C0` | Secondary text |
| `#F97316` | Primary action / accent orange |
| `#22C55E` | Success |
| `#EAB308` | Warning |
| `#EF4444` | Danger |
| `#3B82F6` | Info |

The production design system uses these values as the basis for the current dark industrial appearance.

## Typography

Current typography behavior:

- use clear, compact headings for dense operational pages
- use readable body text with strong contrast
- reserve larger typography for KPI values and primary summaries
- keep letter spacing neutral and avoid decorative treatments that reduce legibility

## Iconography

Current iconography behavior:

- icons are functional, not decorative
- use icons to support actions, statuses, and navigation
- keep icons readable against dark surfaces

## Spacing

Current spacing behavior:

- use consistent spacing around cards, sections, and controls
- keep dense data views readable without crowding
- preserve touch target usability on mobile

## Buttons

Current button behavior:

- primary actions should be orange with white text by default
- hover states may darken the orange
- button labels must be visible before hover
- secondary and ghost actions must remain readable on dark backgrounds

## Cards

Current card behavior:

- cards use dark surfaces and elevated dark surfaces
- card titles, labels, and values must remain readable on slate/black backgrounds
- KPI cards should emphasize numeric values with high contrast

## Tables

Current table behavior:

- table shells must remain readable on dark surfaces
- row text, numeric values, and status labels must maintain contrast
- headers should not blend into the background

## Status Chips

Current status chip behavior:

- use color and text together to indicate state
- status text must remain readable in both selected and unselected states
- avoid low-contrast gray text on dark backgrounds

## KPI Cards

Current KPI card behavior:

- KPI values should be bright and easy to scan
- labels should remain secondary but readable
- avoid muted dark text for numeric values on dark surfaces

## Responsive Behavior

Current responsive behavior:

- layouts should remain usable on mobile, tablet, and desktop
- controls should wrap rather than overflow when necessary
- cards and buttons should not clip or run off the viewport

## Mobile Standards

Current mobile behavior:

- touch targets must remain large enough to use
- navigation should stay visible and fixed when expected
- buttons should keep readable labels without hover dependency

## Tablet Standards

Current tablet behavior:

- data cards should retain readable hierarchy
- grids may compress, but should not hide values or labels

## Desktop Standards

Current desktop behavior:

- preserve dense operational layouts
- keep charts, cards, and tables readable on large displays

## Accessibility

Current accessibility behavior:

- text must meet readable contrast on its background
- state changes should be visible without relying on hover alone
- controls should remain understandable in default, hover, focus, and selected states

## Contrast Rules

1. Dark backgrounds must use light or vivid text.
2. Light backgrounds must use dark text.
3. Primary buttons must be visible before hover.
4. KPI numbers must remain readable without interaction.
5. Empty states must not disappear into the background.

## Current Production Design Primitives

The production design system uses the following reusable primitives:

- `DSCard`
- `DSKpiCard`
- `DSStatusChip`
- `DSSectionHeader`
- `DSTableShell`

These primitives are the preferred foundation for current production surfaces.

