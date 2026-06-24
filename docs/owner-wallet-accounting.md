# Owner Wallet Accounting

## Accounting Scope

The owner wallet is an accounting surface, not a billing preview.

It should include:

- total spend
- average monthly spend
- historical owner charges
- completed washout billing totals
- transaction history

## Source Of Truth

- Total spend includes completed `billing_batches`
- Transaction history includes `billing_batch` rows
- Average monthly spend derives from completed billing/accounting totals
- Wallet spend should not be inferred from pending approval washouts
- Completed batch rows should be visible as owner charge history
- Owner wallet totals reflect completed billing batches and posted accounting entries, not recurring subscription charges.
- Do not infer a subscription balance from wallet analytics.
- Owners are not currently charged recurring subscription fees.

## Expected API Shape

- `GET /api/owners/wallet`
- `GET /api/owners/wallet/transactions`
- `GET /api/owners/wallet/analytics`

## Calculation Rules

- `totalSpent` should include completed billing batches plus any existing wallet spend rows already represented in the accounting feed.
- `avgMonthlySpend` should be derived from the same completed spend source as `totalSpent`.
- `transactionCount` should reflect the merged history rows returned by the wallet feed when billing batches are included.
- Pending washouts and approval counts are operational indicators, not a substitute for accounting totals.

## Notes

- Pending approval counts should not replace financial totals.
- Wallet accounting should stay in sync with completed billing batches and existing wallet transaction history.
