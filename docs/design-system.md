# CreteXchange UI Standard

This document defines the default UI standard for CreteXchange dashboard and admin surfaces.
It is the baseline for new work and the target for gradual refactors.

## Principles

- Keep interfaces dense, readable, and operational.
- Prefer clarity over decoration.
- Use shared primitives for repeated patterns.
- Preserve business logic while changing presentation.
- Avoid visual drift across admin, driver, owner, and operational pages.

## Typography

- Use Inter as the default typeface.
- Base text should read at 16px on desktop and scale down only where density requires it.
- Section titles should use a clear hierarchy:
  - page title: 24px to 32px, semibold
  - section title: 18px to 24px, semibold
  - card title: 16px to 18px, semibold
  - body text: 14px to 16px
  - helper text and metadata: 12px to 14px
- Primary body and operational text on dark surfaces should remain readable at a glance.
- Use secondary text for helper copy, metadata, and tertiary hints only; do not rely on muted text for core labels or queue/table content.
- Keep line lengths short on dashboards and long enough for normal copy on public pages.
- Do not rely on color alone to communicate meaning.

## Spacing

- Use a consistent spacing scale: 4, 8, 12, 16, 24, 32, 40.
- Use 16px to 24px page gutters on desktop and 12px to 16px on mobile.
- Prefer compact card internals over large empty surfaces.
- Use vertical rhythm:
  - page header to content: 16px to 24px
  - section header to content: 12px to 16px
  - stacked form fields: 12px to 16px
  - list rows: compact but breathable
- Avoid large padding blocks unless the section is intentionally promotional or public-facing.

## Page Structure

Use this order for operational pages whenever possible:

1. Header
2. KPI or summary area
3. Filters and actions
4. Table, list, or queue
5. Detail drawer or dialog when needed

This structure should be used for admin dashboards, operations centers, billing tools, and catalog management.

## Headers

- Use a header pattern with:
  - eyebrow or context label
  - page title
  - short supporting description
  - right-aligned actions
- Keep the title short and direct.
- Do not stack multiple competing title blocks in the same view.
- Use `DSSectionHeader` for repeatable section headers whenever practical.

## Cards

- Use `DSCard` for standard dashboard cards and repeated content blocks.
- Use a consistent radius, subtle border, and restrained shadow.
- Keep cards dense enough to scan without forcing unnecessary scrolling.
- Avoid nested cards unless the child card is a repeated item, a modal body, or a genuine framed tool.
- Prefer `DSCard` over page-specific `Card` markup for new dashboard surfaces.

## KPI Cards

- Use `DSKpiCard` for top-level metrics and summary cards.
- KPI cards should show:
  - label
  - value
  - optional detail
  - optional trend or tone
- Keep KPI grids responsive:
  - 1 column on narrow screens
  - 2 columns on tablets
  - 3 or 4 columns on desktop when space allows
- KPI cards should be readable at a glance and not depend on hover.

## Buttons

- Use the smallest button variant that supports the action clearly.
- Button hierarchy:
  - default: primary action
  - secondary: supporting action
  - outline: neutral action
  - ghost: low-emphasis navigation or utility
  - destructive: removal, cancellation, or irreversible actions
- Buttons must remain readable before hover.
- Disabled buttons must still communicate state clearly.
- Prefer icon + label for actions that repeat across workflows.
- Use icon-only buttons only when the action is obvious and a tooltip is available.

## Tables and Lists

- Use `DSTableShell` for dense operational tables and queues.
- Table headers should be concise and aligned with the most important fields.
- Keep row height compact but readable.
- Provide a clear empty state when a table has no data.
- Use row actions sparingly and keep primary actions visible.
- If a table becomes too dense for mobile, switch to stacked cards on small screens rather than forcing horizontal scrolling.

## Forms

- Use a simple vertical form layout by default.
- Use two-column fields only for short paired inputs such as first/last name or city/state.
- Keep labels visible and concise.
- Place helper text directly under the field it supports.
- Group related fields, but avoid deep nesting.
- Keep required and optional fields clear.
- Make validation messages specific and local to the field when possible.

## Dialogs, Drawers, and Sheets

- Use dialogs for short confirmations and small forms.
- Use sheets or drawers for detail views and longer task flows that should preserve context.
- Every drawer or sheet should have:
  - a clear title
  - a visible close or back action
  - an obvious route back to the list or queue
- Do not trap the user in a detail panel.
- Keep overlay and escape-to-close behavior enabled unless there is a specific operational reason not to.

## Status Chips

- Use `DSStatusChip` for recurring operational states.
- Tone mapping should stay semantic:
  - success: complete, active, delivered, approved
  - warning: pending, review needed, low stock
  - danger: failed, issue, canceled, rejected
  - info: in progress, queued, informational
  - neutral: inactive, archived, unknown
  - accent: platform-specific emphasis
- Do not create new status colors per page unless there is a real semantic need.

## Loading States

- Use skeletons or a clearly labeled loading state for long fetches.
- Keep loading affordances consistent inside the same page family.
- Avoid empty spinners without context on large pages.

## Empty States

- Empty states should explain:
  - what is missing
  - why it may be missing
  - what the user can do next
- Keep empty states concise.
- Use a single primary action when a next step exists.

## Error States

- Error states should be visible and actionable.
- Show the problem in plain language.
- Avoid burying errors in toasts alone when the page cannot function.
- Do not use red for everything; reserve destructive styling for actual failures or irreversible actions.

## Mobile Behavior

- Mobile layouts should remain functional without horizontal scrolling in core workflows.
- Collapse wide dashboards into stacked sections when needed.
- Keep primary actions reachable without excessive scrolling.
- Favor simple row stacking over cramped multi-column layouts on smaller screens.

## Accessibility and Contrast

- Maintain strong contrast in light and dark themes.
- No dark blue text on slate or dark cards.
- Use bright, readable colors for text and status chips on dark surfaces.
- Disabled controls must still read as controls.
- Focus states must remain visible.
- Do not use color alone to indicate state when text or icon support is needed.

## Dark / Slate Color Use

- Dark surfaces should use:
  - white
  - muted white
  - bright blue
  - green
  - amber
  - red
- Avoid low-contrast navy or dark blue text on slate backgrounds.
- Use accent colors sparingly and with purpose.

## Shared Component Guidance

Prefer these shared primitives for new work:

- `DSCard`
- `DSKpiCard`
- `DSSectionHeader`
- `DSStatusChip`
- `DSTableShell`

Use shadcn/ui primitives when the interaction is simple and the shared design-system wrapper does not already exist.

## Refactor Guidance

- New admin and dashboard work should use DS primitives by default.
- Existing pages should be converted gradually, one page group per commit.
- Preserve business logic while changing layout or presentation.
- Do not combine UI refactors with backend, billing, or schema changes unless the change genuinely requires both.
- Keep refactors scoped to one surface at a time:
  - admin pages
  - driver pages
  - owner pages
  - public/auth pages

## Phase Plan

### Phase 1
- Document the UI standard.
- Keep tokens and primitives as the source of truth.
- Avoid runtime behavior changes.

### Phase 2
- Tighten shared component behavior and defaults only if needed.
- Normalize card, header, chip, and table patterns.

### Phase 3
- Apply the standard to admin pages first.

### Phase 4
- Apply the standard to driver and owner dashboards and operational pages.

### Phase 5
- Apply the standard to public/auth pages.

## Notes for Future Work

- Do not invent one-off patterns for every page.
- Prefer composition from the shared system.
- If a page needs a special-case layout, document why and keep the exception small.
