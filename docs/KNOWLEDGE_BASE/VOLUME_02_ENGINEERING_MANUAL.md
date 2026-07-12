# Volume 02 - Engineering Manual

## CreteXchange Development Protocol

Use the current development protocol as the operating standard for every session:

- [CreteXchange Development Protocol](../development-protocol.md)

## Repository Standards

| Standard | Requirement |
| --- | --- |
| Production source of truth | `msti64-wq/Cretexchange_temp` |
| Production branch | `main` |
| Production changes | Use the Railway worktree/repository that tracks production |
| Non-production repos | Do not use legacy or older repos for production work |
| Scope discipline | One issue per commit whenever possible |

## Branch Standards

| Standard | Requirement |
| --- | --- |
| Branch intent | Use a branch name that describes the exact change |
| Scope safety | Avoid bundling unrelated fixes into the same branch |
| Promotion | Verify changes in the Railway line before merging or pushing production updates |
| Cleanup | Do not perform broad cleanup while production debugging is active |

## Deployment Workflow

1. Make the change in the Railway worktree that tracks production.
2. Run `npm run check`.
3. Run `npm run build`.
4. Commit the smallest safe change.
5. Push to the production line.
6. Redeploy Railway.
7. Verify the startup commit hash matches the deployed revision.

## Validation Workflow

| Step | Purpose |
| --- | --- |
| `npm run check` | Type and compile-time validation |
| `npm run build` | Production build verification |
| Runtime verification | Confirm the user-visible behavior matches the expected production state |
| Deployment verification | Confirm the startup commit hash matches the intended commit |

## Commit Standards

- Keep commits focused and reviewable.
- Prefer a single behavioral change per commit.
- Do not mix docs-only changes with production code changes unless the task explicitly requires it.
- Include a clear message that describes the operational effect of the change.

## UI Design Standards

CreteXchange uses shared design-system primitives for consistency:

- `DSCard`
- `DSKpiCard`
- `DSStatusChip`
- `DSSectionHeader`
- `DSTableShell`

Contrast standards:

- Dark backgrounds should use white, off-white, bright orange, bright blue, bright green, bright red, or bright yellow text where needed.
- Avoid dark foreground text on dark cards.
- Buttons must remain readable in their default state, not only on hover.
- Tables, chips, KPIs, and empty states must remain readable on slate, zinc, gray, or black surfaces.

## Logging Standards

- Add logs only when they isolate a failing step or confirm a critical production assumption.
- Prefer narrow diagnostic logs over broad noisy logging.
- Temporary logs should be removed once the issue is resolved unless they are clearly useful for ongoing operations.
- Error logs should identify the failing step, user role, route, and relevant identifiers when safe.

## Current Known Production Truths

| Area | Current Truth |
| --- | --- |
| Billing dry-run | `POST /api/admin/billing/preview-owner-washout-charge` is the dry-run entrypoint and does not call Stripe or write billing success records |
| Driver tip source | Driver tip values are derived from `washout_activities.amount` in the current production path |
| Shared ledger | Dry-run and live billing use the shared canonical calculator in `shared/billingPolicy.ts` |
| Owner wallet accounting | Completed `billing_batches` are included in owner spend and transaction history |
| Owner recurring subscription fees | Owners are not currently charged recurring subscription fees |
| Platform fees | Owners may still be charged per-washout platform fees |
| Driver/location tips | Owner/location-configured driver incentive tips are separate from platform fees |
| Terms acceptance | Terms acceptance should succeed when the acceptance write succeeds, even if the admin message write fails |
| Mobile navigation | Driver mobile navigation should remain fixed to the viewport bottom and respect safe-area insets |

## Stop Conditions

Stop and verify before continuing when:

- production and local commits do not match
- a route starts returning 500 or 401 unexpectedly
- a query returns empty because of an identifier mismatch or over-filtering
- a UI change causes low-contrast content on dark backgrounds
- a change would alter billing, Stripe execution, wallet accounting, schema, or legal content unexpectedly

## Engineering Best Practices

- Read the code path before editing it.
- Confirm the source of truth before changing logic.
- Keep billing and Stripe changes isolated.
- Fix the smallest layer that explains the bug.
- Prefer non-fatal diagnostics over failing user-facing flows when the non-essential step is not the actual business action.
- Leave legal text, billing math, and schema untouched unless a proven mismatch requires a targeted change.
- Verify the result with `npm run check` and `npm run build` before promotion.

## Notes

This manual describes current operational practice. It should be updated when the production repo, deployment flow, billing behavior, or design-system standards materially change.
