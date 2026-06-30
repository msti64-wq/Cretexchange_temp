# CreteXchange Development Protocol

## Mandatory Codex Preflight Check

Before performing any CreteXchange task, Codex must verify the repository.

Required commands:

```bash
pwd
git status --short --branch
git remote -v
git rev-parse --show-toplevel
git rev-parse HEAD
git rev-parse railway-repo/main
```

Expected values:

- Repository path: `/Users/michaelstiger/cretexchange-railway-main`
- Remote: `railway-repo`
- Branch target: `railway-repo/main`

Required landmarks:

- `docs/design-system.md`
- `client/src/App.tsx`
- `client/src/pages/admin`
- `client/src/pages/driver`
- `client/src/components/design-system`

Stop condition:

If the repository path, remote, or landmarks do not match, stop immediately.

Do not:

- modify files
- search another repository
- substitute GeoHaul
- guess
- proceed with partial context

If verification fails, report the mismatch and wait for instructions.

## Operating Rules

- Treat the repository check as the first step for every task.
- Do not assume a sibling workspace or alternate remote is acceptable.
- Prefer explicit verification over inferred context.
- If a task references CreteXchange, the repository must be the one listed above.

## Standard Development Workflow

1. Preflight
- Verify repository path.
- Verify remote and branch.
- Verify required landmarks.
- Stop immediately if incorrect.

2. Audit
- Make no code changes.
- Understand the current implementation.
- Identify the files involved.
- Identify risks.

3. Plan
- Define the scope.
- Confirm whether the work is UI-only, backend, schema, or functional.
- Confirm what must not change.

4. Implement
- Keep changes narrowly scoped.
- Follow CreteXchange Design System V2 when UI-related.
- Do not mix unrelated work.

5. Validate
- Run `npm run check`.
- Run `npm run build`.

6. Post-Implementation Audit
- Show `git status --short`.
- Show `git diff --stat`.
- Confirm only intended files changed.
- Confirm no unintended backend, schema, routing, or business logic changes.

7. Visual Review
- Required for UI changes.
- Verify readability, contrast, layout, buttons, inputs, tables, dialogs, and mobile behavior where applicable.

8. Commit
- Commit only after approval.
- Stage only intended files.
- Use clear commit messages.

9. Deploy and Verify
- Push to `railway-repo/main` when approved.
- Verify production reflects the expected commit.
- Confirm the affected page or workflow still works.

Do not combine UI refactors, business logic changes, schema changes, and migrations in the same task unless explicitly requested.
