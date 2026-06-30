# CreteXchange Design System V2

CreteXchange Design System V2 defines the visual and interaction standards for the product workspace. It is the reference for new UI work and the target state for gradual refactors.

## Philosophy

CreteXchange uses an **Enterprise Slate Workspace** for operational surfaces.

- The workspace is neutral, dense, and task-focused.
- Structure should be visually quiet.
- Color communicates operational meaning, not decoration.
- Pages should feel like working tools, not marketing surfaces.
- Shared patterns are preferred over page-specific inventions.
- Changes to presentation must not alter business logic.

## Design Principles

- Keep interfaces dense, readable, and operational.
- Prefer clarity over decoration.
- Use shared primitives for repeated patterns.
- Preserve business logic while changing presentation.
- Avoid visual drift across admin, driver, owner, and public surfaces.
- Titles should use the platform accent blue.
- Operational data should remain high-contrast and readable at a glance.
- Hover should enhance, not reveal.

## Design Tokens

The design tokens are the source of truth for colors, spacing, radius, and typography roles.

- Background and surface tokens should resolve to neutral slate workspace values in admin mode.
- Primary text should remain readable on both light and dark surfaces.
- Secondary text should stay readable without becoming washed out.
- Accent blue is reserved for titles and emphasis.
- Semantic status colors should be used consistently across chips, counts, active indicators, and warnings.

Semantic text roles:

- `pageTitle`: bright platform accent blue for page-level titles
- `sectionTitle`: bright platform accent blue for section titles
- `cardTitle`: bright platform accent blue for card headers and operational emphasis
- `operationalText`: high-contrast primary text for names, values, and queue items
- `bodyText`: near-primary readable body copy
- `helperText`: readable secondary copy for guidance and descriptions
- `metadataText`: tertiary labels and subtle supporting information

## Shared Components

Prefer these shared primitives for new work:

- `DSCard`
- `DSKpiCard`
- `DSSectionHeader`
- `DSStatusChip`
- `DSTableShell`

Use shadcn/ui primitives when the interaction is simple and the shared design-system wrapper does not already exist.

### Shared component guidance

- `DSCard`: standard dashboard cards and repeated content blocks.
- `DSKpiCard`: top-level metrics and summary cards.
- `DSSectionHeader`: repeatable section headers with clear hierarchy.
- `DSStatusChip`: recurring operational states using semantic tones.
- `DSTableShell`: dense operational tables and queues with compact headers and readable rows.

## Layout Standards

Use this order for operational pages whenever possible:

1. Header
2. KPI or summary area
3. Filters and actions
4. Table, list, or queue
5. Detail drawer or dialog when needed

### Headers

- Use an eyebrow or context label.
- Keep the page title short and direct.
- Include a short supporting description.
- Place actions on the right when space allows.
- Do not stack competing title blocks in the same view.

### Cards

- Use neutral surfaces.
- Keep cards dense enough to scan without unnecessary scrolling.
- Avoid nested cards unless the child is a repeated item, modal body, or framed tool.
- Prefer `DSCard` over page-specific card markup for new dashboard surfaces.

### KPI cards

- Show label, value, and optional detail.
- Keep KPI grids responsive:
  - 1 column on narrow screens
  - 2 columns on tablets
  - 3 or 4 columns on desktop when space allows
- KPI cards should be readable at a glance and not depend on hover.

### Tables and lists

- Use `DSTableShell` for dense operational tables and queues.
- Table headers should be concise and aligned with the most important fields.
- Keep row height compact but readable.
- If a table becomes too dense for mobile, switch to stacked cards on small screens.

### Forms

- Use a simple vertical form layout by default.
- Use two-column fields only for short paired inputs.
- Keep labels visible and concise.
- Place helper text directly under the field it supports.
- Keep validation local and specific.

### Dialogs, drawers, and sheets

- Use dialogs for short confirmations and small forms.
- Use sheets or drawers for detail views and longer task flows.
- Every drawer or sheet should have:
  - a clear title
  - a visible close or back action
  - an obvious route back to the list or queue
- Do not trap the user in a detail panel.

## Operational Color Philosophy

CreteXchange uses a neutral slate workspace. Structure should remain visually quiet.
Color communicates operational meaning, not decoration.

- Containers remain neutral.
- Status chips, counts, icons, active indicators, and progress elements carry semantic color.
- Operational data such as driver names, owner names, prize names, and ticket numbers should use high-contrast primary text.
- Titles use the platform accent blue.
- Never require hover or text selection to reveal content.
- Avoid decorative gradients and full-card color fills unless there is a compelling product reason.

### Semantic meaning

- Green = completed / healthy
- Amber = waiting / pending
- Blue = active / informational
- Cyan = in transit / shipped
- Red = needs attention / error
- Slate = inactive / archived / canceled

### Usage rules

- Use semantic color on chips, counts, icons, active indicators, and progress states.
- Keep containers neutral.
- Keep labels readable before hover.
- Avoid using color fills for entire cards unless the card itself is the semantic indicator.

## Surface Hierarchy

The visual stack should read in this order:

1. Page shell
2. Neutral card or panel
3. Section content
4. Operational data
5. Semantic chip or accent

### Surface rules

- Card and panel surfaces should usually be neutral slate.
- Light surfaces are acceptable only where the theme intentionally calls for them.
- Dark surfaces should use the DS token set rather than hard-coded page colors.
- If a surface is semantic, it should be obviously intentional and narrow in scope.

### Dark / slate color use

- Dark surfaces should use:
  - white
  - muted white
  - bright blue
  - green
  - amber
  - red
- Avoid low-contrast navy or dark blue text on slate backgrounds.
- Use accent colors sparingly and with purpose.

## Role-Based Experience Design

Different workspaces have different presentation priorities, but the shared system should stay consistent.

### Admin

- Admin surfaces use the Enterprise Slate Workspace.
- Admin pages should default to neutral card surfaces with semantic accents.
- Operational data and table content should remain bright and readable.

### Driver

- Driver pages may be more utility-heavy, but they should still follow the same readability and spacing rules.
- Operational actions should remain obvious and readable in both light and dark contexts.

### Owner

- Owner pages should stay professional and task-focused.
- Financial and operational data should be readable without hover or selection.

### Public / auth

- Public and auth pages can be lighter or more promotional when appropriate.
- They still must respect readability, hierarchy, and contrast.

## Accessibility Standards

- Maintain strong contrast in light and dark themes.
- No dark blue text on slate or dark cards.
- Use bright, readable colors for text and status chips on dark surfaces.
- Disabled controls must still read as controls.
- Focus states must remain visible.
- Do not use color alone to indicate state when text or icon support is needed.
- Never require hover or text selection to understand content.

## Definition of Done

### V2 Compliant

A surface is V2 compliant when it:

- uses the documented token roles
- uses shared DS primitives where practical
- keeps layout compact and task-focused
- preserves neutral surfaces with semantic accents only
- remains readable before hover
- passes contrast expectations in the Enterprise Slate Workspace
- does not introduce page-specific design drift
- does not change business logic, API behavior, or routing

### Refactor guidance

- New admin and dashboard work should use DS primitives by default.
- Existing pages should be converted gradually, one page group per commit.
- Preserve business logic while changing layout or presentation.
- Do not combine UI refactors with backend, billing, or schema changes unless the change genuinely requires both.
- Keep refactors scoped to one surface at a time:
  - admin pages
  - driver pages
  - owner pages
  - public/auth pages

## Change Log

### V2

- Renamed the document to **CreteXchange Design System V2**.
- Added the Enterprise Slate Workspace philosophy.
- Added explicit semantic text roles.
- Added operational color philosophy and surface hierarchy guidance.
- Added role-based experience design guidance.
- Added a V2 compliance definition for future work.
- Preserved the prior guidance on typography, spacing, cards, tables, forms, dialogs, status chips, loading, empty, error, accessibility, and refactor strategy.

