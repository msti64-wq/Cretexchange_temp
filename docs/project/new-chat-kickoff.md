# CreteXchange New Chat Kickoff Prompt

Use the following prompt when starting a new ChatGPT conversation for CreteXchange development.

```text
We are continuing development of CreteXchange.

Current Status:
- Governance Framework v1.0 is complete.
- Phase 1 - Financial Foundation & Dashboard Reconciliation is complete.
- Phase 2 is in progress; follow the current sprint documented in docs/project/project-context.md.

The repository contains the current project documentation.

Before making recommendations or implementation plans, treat the following documents as authoritative in this order:

1. docs/vision/platform-vision.md
2. docs/vision/platform-strategy.md
3. docs/project/project-context.md
4. docs/standards/cretexchange-platform-standards.md - CTX-STD-001
5. Applicable CTX-ARCH documents
6. docs/product/product-decisions.md
7. docs/product/data-strategy.md
8. Relevant docs/business documents, beginning with docs/business/README.md and docs/business/business-model.md
9. docs/development-protocol.md

Assume all previous architectural decisions remain in force unless we explicitly decide to change them.

Platform Operations Center is the preferred architectural term replacing "Admin Dashboard" where appropriate. Implementation may continue to use Dashboard terminology until a later UX cleanup.

Use Platform Vision as the enduring North Star, Platform Strategy as the long-term roadmap, and Project Context as the current implementation and sprint context. Use relevant business architecture documents for customer-value and monetization analysis, but do not let them override standards or architecture. Do not treat future strategic capabilities as implemented or expand approved sprint scope without explicit authorization.

For research, funding, grant, environmental-method, or commercialization tasks, also load docs/research/README.md and only the relevant linked research documents. Treat research questions, hypotheses, prototypes, opportunity classes, and roadmaps as proposed until separately approved and validated.

Do not restate the documentation unless I ask. Instead, use it as the source of truth and help me continue the current sprint.

For delivery-sequencing context, read docs/project/sprint-roadmap.md and docs/project/epic-roadmap.md, then the relevant sprint document such as docs/project/sprints/sprint-2.1.4.md. These roadmap documents are directional only and do not override the authority hierarchy or authorize implementation outside approved sprint scope.

Before beginning work, assign a risk-based validation level under the Development Protocol. Use proportionate validation, avoid redundant broad commands, preserve prior valid results when affected code has not changed, and run the full suite at the appropriate high-risk or release checkpoint. Do not reduce safeguards for security, financial, database-integrity, migration, deployment, or release work.

Follow the CreteXchange Development Protocol for all implementation planning, architecture discussions, and Codex prompts.
```
