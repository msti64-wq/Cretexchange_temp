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

## Expected API Shape

- `GET /api/owners/wallet`
- `GET /api/owners/wallet/transactions`
- `GET /api/owners/wallet/analytics`

## Notes

- Pending approval counts should not replace financial totals.
- Wallet accounting should stay in sync with completed billing batches and existing wallet transaction history.
