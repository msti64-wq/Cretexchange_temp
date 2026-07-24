# CreteXchange Development Protocol

## Purpose

The Development Protocol is the required execution workflow for every engineering task.

Governance is layered as follows:

- Platform Vision defines why CreteXchange exists.
- Platform Strategy defines long-term strategic direction.
- Project Context defines current implementation and delivery context.
- CTX-STD-001 governs engineering standards.
- Architecture documents govern implementation.
- Product Decisions govern business direction.
- Data Strategy governs strategic data value and protection.
- Business architecture guides customer-value and monetization evaluation without overriding standards or architecture.
- ADRs govern technical decisions.
- Business Rules govern operational behavior.

This protocol is the operational guide for how to work. It does not duplicate the substance of the governing standards and architecture documents; it references them.

## Governance Hierarchy

```text
Platform Vision
↓
Platform Strategy
↓
Project Context
↓
CTX-STD-001 — CreteXchange Platform Standards
↓
Applicable CTX-ARCH Documents
↓
Product Decisions
↓
Data Strategy
↓
Relevant Business Architecture Documents
↓
Development Protocol
↓
Sprint Tasks
↓
Implementation
```

Applicable ADRs and Business Rules remain authoritative within their governed technical and operational domains and are discovered before implementation.

## Production Release Governance

All production deployments MUST comply with both of the following mandatory governance documents:

1. [CTX-DEP-001 - Production Deployment Protocol](./standards/CTX-DEP-001-production-deployment-protocol.md)
2. [CTX-OPS-001 - Production Release Checklist](./operations/CTX-OPS-001-production-release-checklist.md)

CTX-DEP-001 defines the required release controls. CTX-OPS-001 is the operational checklist and release record used to demonstrate that those controls were completed. These documents supplement, and do not override, the applicable Platform Standards, CTX-ARCH documents, Product Decisions, and approved runbooks.

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

- applicable Platform Strategy direction
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

- [ ] Read Platform Vision
- [ ] Read Platform Strategy
- [ ] Read Project Context and the active sprint document
- [ ] Read CTX-STD-001
- [ ] Read governing architecture documents
- [ ] Read applicable ADRs
- [ ] Read applicable Product Decisions
- [ ] Identify applicable Business Rules
- [ ] Verify canonical helper availability
- [ ] Verify no duplicate functionality exists
- [ ] Identify configuration-first opportunities
- [ ] Complete Source of Truth Verification

## Risk-Based Validation Policy

Validation must remain responsible, proportionate to risk, and conscious of processing cost. Use the least expensive validation that provides reasonable confidence without reducing safeguards for authentication, authorization, payments, wallets, financial calculations, sensitive data, database integrity, migrations, deployment, or release reliability.

Assign a validation level before work begins. Increase the level when scope or risk grows. An approved task, governing architecture document, migration plan, security requirement, or release checklist may require additional validation beyond the minimum described here.

Existing documentation that generically requires broad commands for every implementation task is interpreted through this policy: run those commands at the checkpoint required by the assigned level, not after every intermediate edit. Explicit task-specific or release-specific validation requirements remain in force and may raise, but not reduce, the required safeguards.

### Engineering completion and deferred external validation

Engineering governance exists to enable safe delivery. A subsystem is **Engineering Complete** when its approved architecture, required implementation and documentation, repository-local tests, available integration tests, type checking, build validation, and applicable security controls are complete, and any unavailable environment-dependent validation is explicitly recorded.

When a required isolated external dependency—such as a validation PostgreSQL database, provider sandbox, or dedicated staging resource—is unavailable, record the subsystem as **Validation Pending — External Environment Required**. This is a deferred production release gate: it does not invalidate completed engineering work, reopen the same implementation sprint, or block unrelated and subsequent development.

Environment-dependent validation remains mandatory before production deployment when the risk level requires it. A Validation Pending subsystem MUST NOT be represented as approved for production deployment until the documented deferred validation succeeds. Low-risk work uses normal review and applicable tests; moderate-risk work adds targeted integration or architecture review; high-risk security, authentication, financial-execution, persistent-data-integrity, or foundational-infrastructure work requires its formal environment-dependent validation before production deployment.

### Level 1 — Low-Risk Isolated Change

Examples include:

- text or label correction
- documentation update
- minor styling change
- small accessibility fix
- isolated single-component adjustment
- nonfunctional copy or layout change

Use:

- inspection of the affected file and diff
- targeted type validation when available and relevant
- a targeted test only when applicable
- manual verification of the affected screen or document
- `git diff` and `git diff --check` where relevant

Do not automatically run:

- a full build
- the full test suite
- broad repository scans
- dependency audits

Run a broader command only when the changed code reasonably affects shared compilation or build behavior.

### Level 2 — Feature-Area Change

Examples include:

- Driver Dashboard
- Driver Rewards
- Location discovery
- Driver Activity
- Notifications
- Profile workflow
- Owner Locations
- a small feature-specific API change

Use:

- targeted code inspection
- type checking when TypeScript contracts are affected
- focused tests for the changed feature
- a manual walkthrough of the affected flow
- one build after the feature-area batch is complete

Avoid:

- rerunning successful broad checks after every edit
- full-suite execution for each small subtask
- repeated builds when no build-sensitive code changed

### Level 3 — High-Risk Change

Examples include:

- authentication or authorization
- payments or Stripe
- wallet balances or financial calculations
- database schema or migrations
- shared storage
- privacy or sensitive information
- security configuration
- deployment configuration

Use:

- a full type check
- a full build
- the full test suite when executable
- relevant focused security, financial, access-control, or migration tests
- transactional or database-backed tests where required
- explicit failure, retry, and idempotency testing

If the full suite has a known baseline failure:

- do not rerun it repeatedly during intermediate edits
- run focused tests during implementation
- run the full suite once at the appropriate checkpoint
- compare against the documented baseline
- report current-only regressions separately

### Level 4 — Release, Merge, Deployment, or Demo Checkpoint

After the related work is complete, run the full validation suite once:

```bash
npm run check
npm run build
npm run test
```

Also run:

- `git diff --check`
- relevant release and security checks
- migration validation where applicable
- a manual smoke test of critical workflows

Do not repeat a successful command unless a later change could reasonably affect its result.

### Cost-Awareness Rules

1. Preserve prior successful validation results when affected code has not changed.
2. Do not rerun successful broad checks solely for reassurance.
3. Prefer inspection and focused tests during intermediate implementation.
4. Group related fixes into a focused implementation batch.
5. Run the full build once after a Level 2 feature batch, not after every edit.
6. Run the full suite once at a Level 3 or Level 4 checkpoint unless a specific failure requires another run.
7. Explain why any additional broad or repeated command is necessary before running it.
8. Do not run dependency audits, repository-wide exploratory scans, or unrelated checks without a specific risk-based reason.
9. Do not treat documentation or cosmetic changes like financial or security changes.
10. Make validation effort proportional to change scope, security risk, financial risk, data-integrity risk, shared dependencies affected, and release importance.

### Validation Reporting

Every task report must include:

- assigned validation level
- reason for the level
- targeted checks run
- broad commands run
- approximate number of broad commands run
- checks intentionally omitted and why they were unnecessary
- prior successful results reused
- whether a Level 4 checkpoint remains outstanding

## Standard Development Workflow

1. Preflight
   - Verify repository path.
   - Verify remote and branch.
   - Verify required landmarks.
   - Stop immediately if incorrect.

2. Governance Discovery
   - Identify the relevant strategic direction, governing standard, architecture, ADRs, product decisions, and business rules.
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
   - Apply the assigned validation level and use proportionate checks.
   - Prefer focused tests during implementation and broad validation at the appropriate checkpoint.
   - Preserve prior successful results when affected code has not changed.
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

- Align approved work with Platform Vision and Platform Strategy without expanding the sprint.
- Reuse existing canonical helpers.
- Never duplicate financial calculations.
- Never duplicate business rules.
- Never hardcode configurable values.
- Prefer extension over modification.
- Preserve backward compatibility whenever practical.
- Keep runtime changes focused and minimal.
- Do not create alternate calculations when a canonical helper exists.

## Strategic Alignment and Sprint Scope

- Sprint work should support the long-term Construction Circular Economy Intelligence Platform where practical.
- Strategic alignment does not authorize future capabilities, new architecture, schema changes, or additional sprint scope.
- Project Context and the approved sprint document define current delivery scope.
- Future strategy must be described as future until separately approved, architected, implemented, and validated.
- Prefer work that strengthens verified transactions, data quality, operational usefulness, and reusable platform foundations within the approved task.
- Record strategically useful but unapproved ideas as roadmap recommendations rather than implementing them.
- Do not distort a current operational requirement merely to resemble a future platform layer.
- Significant feature proposals must identify the customer, value delivered, likely revenue or strategic benefit, required data, privacy implications, and whether the scope is current or future.

## Documentation Rules

If long-term strategic direction changes:
- Update Platform Strategy and applicable Product Decisions before changing roadmap guidance.

If the enduring purpose changes:
- Update Platform Vision first.

If architecture changes:
- Update architecture first.

If standards change:
- Update CTX-STD-001 first.

If product behavior changes:
- Update Product Decisions.

If implementation introduces a new technical pattern:
- Create or update an ADR.

## Testing Requirements

Every implementation must follow the Risk-Based Validation Policy. The selected validation level determines when `npm run check`, `npm run build`, `npm run test`, focused tests, database-backed tests, and manual verification are required.

Regardless of level, validation must provide reasonable confidence that the change introduces:

- no relevant TypeScript errors
- no duplicated logic
- no conflicting calculations
- no regression in the affected workflow

High-risk financial, security, data-integrity, migration, deployment, and release work retains the stronger safeguards defined by Levels 3 and 4.

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
- Assigned validation level and rationale
- Broad commands run and checks intentionally omitted
- Prior successful validation results reused
- Whether a Level 4 checkpoint remains outstanding
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
