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

