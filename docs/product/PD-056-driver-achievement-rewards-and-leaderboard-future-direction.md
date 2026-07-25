# PD-056 — Driver Achievement, Rewards, and Shared Leaderboard Future Direction

**Document ID:** PD-056
**Version:** 0.1
**Status:** Approved Future Product Direction — Not Authorized for Pilot Implementation
**Owner:** Product / V8 Laboratories
**Product:** CreteXchange
**Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
**Effective Date:** July 24, 2026
**Review Frequency:** Event-driven before any architecture, compliance, promotional, privacy, or implementation approval
**Classification:** Internal

## 1. Purpose

This decision records the approved future product direction for a Driver Achievement Center, a related Driver Rewards Center, and an opt-in shared Driver Leaderboard. It preserves a future engagement direction without changing the current pilot release, existing Driver Dashboard, Driver Earnings Center, operational verification lifecycle, or financial behavior.

## 2. Decision and Scope Boundary

CreteXchange may later provide a separate **Driver Achievement Center** for achievement and engagement information. It must remain separate from the primary Driver Dashboard and Driver Earnings Center so operational next actions, activity status, earnings presentation, wallet information, and settlement state are not cluttered or conflated with engagement activity.

The future Achievement Center may present qualifying achievement progress and recognition. Candidate achievement measures include:

- verified washout milestones;
- qualifying photo-approval rate;
- consecutive approval streaks;
- facilities visited;
- new facilities used or discovered;
- participation and reliability milestones;
- Founding Driver recognition; and
- seasonal or promotional challenges.

A future **Driver Rewards Center** may present the rewards attached to those achievements. Depending on the governing rule, a reward may provide additional CreteXchange monthly-drawing entries, reward points, promotional recognition, special badges, sponsored or non-cash rewards, eligibility for future incentives, or early access to selected future capabilities.

A future opt-in **Shared Driver Leaderboard** may allow participating Drivers to view comparative, friendly-competition rankings. Candidate categories include most verified washouts during the current month, highest qualifying photo-approval rate, longest approval streak, most facilities visited, most new facilities used, most monthly reward entries earned, regional rankings, seasonal-challenge rankings, and Founding Driver recognition or rankings.

This is an approved **future product direction** only. It is not part of the current Pilot Release unless separately authorized. It does not authorize application code, APIs, UI, database schema, migrations, reward execution, Stripe behavior, wallet behavior, payouts, settlement, payment behavior, drawing changes, or a production promotion.

## 3. Relationship to Existing Authority

This decision must be read with:

- [Project Context](../project/project-context.md);
- [CTX-STD-001 — CreteXchange Platform Standards](../standards/cretexchange-platform-standards.md);
- [CTX-ARCH-003 — Driver Operations Architecture](../architecture/driver-operations-architecture.md), including its additive-rewards and auditable-ledger boundaries;
- [CTX-ARCH-004 — Admin Operations Architecture](../architecture/admin-operations-architecture.md), including rewards-administration audit expectations;
- [CTX-ARCH-006 — Driver Incentive and Financial Settlement Architecture](../architecture/driver-incentive-and-financial-settlement-architecture.md), including operational and financial separation;
- [PD-051 — Driver Activity and Payment Lifecycle](./PD-051-driver-activity-and-payment-lifecycle.md); and
- [PD-052 — Marketplace Trust, Administrative Activity Review, and Dispute Resolution](./PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md).

Existing Driver Rewards and drawing behavior remain governed by their current implementation and applicable architecture. This decision does not assert that they already provide the future Achievement Center, expanded Rewards Center, or shared leaderboard described here.

## 4. Eligibility and Integrity Rules

Future achievement, reward, and ranking rules MUST preserve operational truth:

- Only finally verified washouts qualify.
- Rejected, duplicate, reversed, fraudulent, invalid, or otherwise disqualified activity does not qualify.
- Activity under Administrative Review does not qualify unless and until it receives final qualifying verification under the governing operational lifecycle.
- Leaderboard totals and rewards MUST be corrected when later evidence reverses or disqualifies qualifying activity.
- Percentage-based rankings MUST use an appropriate, rule-defined minimum qualifying-activity threshold; a percentage without a sufficient denominator must not be ranked.
- Administrative adjustments require authorized action, an auditable record, and a participant-safe explanation where applicable.
- Achievement, reward, challenge, and ranking rules MUST be versioned so historical outcomes remain explainable under their governing rule.
- Anti-gaming, duplicate-activity, fraud, collusion, and abuse controls require dedicated review before production activation.

These rules do not create a new activity status or alter the canonical operational statuses. They describe future qualification and correction requirements only.

## 5. Future Reward Ledger Requirement

Before any future reward is issued, CreteXchange requires an auditable, append-only reward-ledger design. The future ledger must record, at minimum:

- recipient;
- qualifying achievement or event;
- reward type;
- number of drawing entries or points awarded;
- award date;
- promotion or reward period;
- expiration, when applicable;
- reversal or administrative adjustment; and
- governing rule version.

The reward ledger is not a Driver Wallet, payment ledger, payout ledger, settlement ledger, bank account, or Stripe record. It must preserve the existing separation between operational verification, rewards, financial entitlements, and external financial execution.

## 6. Leaderboard Privacy and Display Rules

The shared leaderboard must be voluntary and privacy-oriented. Future presentation options may include a Driver-selected public handle, first name and last initial, optional profile image, general service region, and opt-in or opt-out participation.

The shared leaderboard MUST NOT display or derive rankings from Driver tip amounts, payout balances, bank information, Stripe information, wallet balances, payment details, or other private financial data. Drivers MUST NOT be ranked by tip earnings.

Regional displays require a future privacy review to determine the minimum safe geographic granularity. A leaderboard must not expose exact location, precise GPS, private facility relationships, or other information that would create avoidable participant risk.

## 7. Required Future Review Before Activation

No portion of this direction may be activated without separately approved:

1. product scope and governing rules for each achievement, reward, challenge, and ranking;
2. architecture for qualification, versioning, corrections, the reward ledger, and read models;
3. privacy, security, accessibility, authorization, and data-retention review;
4. compliance and promotional-law review for drawings, points, contests, sponsored rewards, eligibility, and geographic availability;
5. anti-gaming, fraud, duplicate-activity, and collusion controls;
6. implementation scope, tests, audit model, operator workflow, and participant communications; and
7. a separate decision for any cash-equivalent, financial, provider, wallet, payout, settlement, or Stripe implication.

## 8. Explicit Non-Goals

This decision does not:

- change the Pilot Release scope;
- create an achievement, reward, leaderboard, point, drawing, or challenge implementation;
- change current drawing eligibility or issue rewards;
- create a public Driver profile or expose participant information;
- authorize a ranking algorithm, a public region model, or a participation default;
- alter owner approval, administrative review, activity verification, fraud handling, or the transaction lifecycle; or
- authorize financial execution, payment, wallet, Stripe, payout, settlement, or accounting behavior.

## 9. Open CEO Decisions

Before future activation, CEO approval remains required for:

- the business purpose, success measures, and first approved achievement and challenge set;
- whether participation is opt-in by default and the public-display identity options;
- eligible jurisdictions, sponsor participation, prize categories, and whether any reward has cash-equivalent value;
- monthly-drawing relationship, points value, expiration, fulfillment, and participant terms;
- Founding Driver qualification, duration, and recognition treatment;
- the authorized administrative-adjustment authority and participant appeal/escalation policy; and
- the minimum safe regional display model and any public-profile policy.

## 10. Related Documents

- [Product Decision Index](./product-decisions.md)
- [Sprint Roadmap](../project/sprint-roadmap.md)
- [Driver Operations Architecture](../architecture/driver-operations-architecture.md)
- [Admin Operations Architecture](../architecture/admin-operations-architecture.md)
- [Driver Incentive and Financial Settlement Architecture](../architecture/driver-incentive-and-financial-settlement-architecture.md)
- [Data Strategy](./data-strategy.md)
