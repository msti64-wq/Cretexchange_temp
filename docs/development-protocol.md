# CreteXchange Development Protocol

## Purpose

The Development Protocol is the required execution workflow for every engineering task.

Governance is layered as follows:

- CTX-STD-001 governs engineering standards.
- Architecture documents govern implementation.
- Product Decisions govern business direction.
- ADRs govern technical decisions.
- Business Rules govern operational behavior.

This protocol is the operational guide for how to work. It does not duplicate the substance of the governing standards and architecture documents; it references them.

## Governance Hierarchy

```text
docs/README.md
↓
CTX-STD-001 — CreteXchange Platform Standards
↓
CTX-ARCH-001 through CTX-ARCH-005
↓
Architecture Decision Records
↓
Product Decisions
↓
Development Protocol
↓
Sprint Tasks
↓
Implementation
```

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

- `docs/README.md`
- `docs/standards/cretexchange-platform-standards.md`
- `docs/architecture/README.md`
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

## Mandatory Architecture Discovery

Before implementation, identify:

- applicable standards document
- governing architecture document(s)
- applicable ADRs
- applicable Product Decisions
- applicable Business Rules
- existing canonical helpers
- existing APIs
- existing database entities

No implementation begins until these are identified.

## Mandatory Source of Truth Verification

Before modifying any existing feature, explicitly answer:

- What is the canonical source of truth?
- Where is it documented?
- Which helper, API, or module owns the logic?
- Is this implementation reusing the existing source of truth?
- If not, why is the existing source insufficient?
- Could this change create duplicate logic or conflicting calculations?

If the source of truth is unclear, stop and audit before implementing.

## Mandatory Preflight Checklist

Before writing code:

- [ ] Read CTX-STD-001
- [ ] Read governing architecture documents
- [ ] Read applicable ADRs
- [ ] Read applicable Product Decisions
- [ ] Identify applicable Business Rules
- [ ] Verify canonical helper availability
- [ ] Verify no duplicate functionality exists
- [ ] Identify configuration-first opportunities
- [ ] Complete Source of Truth Verification

## Standard Development Workflow

1. Preflight
   - Verify repository path.
   - Verify remote and branch.
   - Verify required landmarks.
   - Stop immediately if incorrect.

2. Governance Discovery
   - Identify the governing standard, architecture, ADRs, product decisions, and business rules.
   - Identify canonical helpers, APIs, and database entities.
   - Confirm the source of truth before touching implementation.

3. Audit
   - Make no code changes.
   - Understand the current implementation.
   - Identify the files involved.
   - Identify risks.

4. Plan
   - Define the scope.
   - Confirm whether the work is UI-only, backend, schema, or functional.
   - Confirm what must not change.

5. Implement
   - Keep changes narrowly scoped.
   - Reuse canonical helpers.
   - Do not duplicate business rules or financial calculations.
   - Do not create alternate calculations when a canonical helper exists.
   - Follow governing architecture and standards documents.

6. Validate
   - Run `npm run check`.
   - Run `npm run build`.
   - Add appropriate tests where applicable.

7. Post-Implementation Audit
   - Show `git status --short`.
   - Show `git diff --stat`.
   - Confirm only intended files changed.
   - Confirm no unintended backend, schema, routing, or business logic changes.

8. Visual Review
   - Required for UI changes.
   - Verify readability, contrast, layout, buttons, inputs, tables, dialogs, and mobile behavior where applicable.

9. Commit
   - Commit only after approval.
   - Stage only intended files.
   - Use clear commit messages.

10. Deploy and Verify
   - Push to `railway-repo/main` when approved.
   - Verify production reflects the expected commit.
   - Confirm the affected page or workflow still works.

## Implementation Rules

- Reuse existing canonical helpers.
- Never duplicate financial calculations.
- Never duplicate business rules.
- Never hardcode configurable values.
- Prefer extension over modification.
- Preserve backward compatibility whenever practical.
- Keep runtime changes focused and minimal.
- Do not create alternate calculations when a canonical helper exists.

## Documentation Rules

If architecture changes:
- Update architecture first.

If standards change:
- Update CTX-STD-001 first.

If product behavior changes:
- Update Product Decisions.

If implementation introduces a new technical pattern:
- Create or update an ADR.

## Testing Requirements

Every implementation should verify:

- `npm run check`
- `npm run build`
- appropriate tests where applicable
- no TypeScript errors
- no duplicated logic
- no conflicting calculations

## Git Workflow

- Documentation commits should remain separate from runtime commits whenever practical.
- Architecture milestones should be committed independently.
- Standards updates should be committed independently.
- Runtime fixes should be isolated from unrelated documentation changes.

## Completion Report

Every completed task should report:

- Files changed
- Architecture documents referenced
- Standards referenced
- ADRs referenced
- Product Decisions referenced
- Business Rules referenced
- Source of Truth verified
- Validation completed
- Scope confirmation

## Architecture Compliance Verification

Before declaring work complete, verify:

- Architecture followed
- Standards followed
- Business Rules followed
- Canonical helpers reused
- Configuration used where applicable
- No duplicate implementation introduced
- No conflicting calculations introduced
- No missing production schema assumptions introduced

## Escalation Rules

If implementation conflicts with:

- CTX-STD-001
- CTX-ARCH documents
- Product Decisions
- ADRs
- Business Rules
- Production schema
- Existing canonical helpers

Stop implementation and recommend documentation or architecture updates before proceeding.

## Future Protocol Evolution

- The Development Protocol is a living operational guide.
- Engineering standards belong in CTX-STD-001.
- Architecture belongs in CTX-ARCH documents.
- The protocol references those documents rather than duplicating them.

