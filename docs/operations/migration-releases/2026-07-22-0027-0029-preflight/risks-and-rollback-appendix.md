# Risks and Rollback Appendix — 0027 and 0029

> **PREFLIGHT ONLY — NOT AUTHORIZATION TO EXECUTE**

## Risk register

| Risk | Detection | Control | Stop / recovery posture |
| --- | --- | --- | --- |
| Target is not intended production database | Target metadata and fresh catalog do not match package baseline. | Reconfirm environment/service/database binding before DDL. | Stop before connection/DDL. |
| Unknown or partial migration state | Ledger/catalg query differs from complete-absence gate. | Treat as drift; do not rely on `IF NOT EXISTS`. | Stop; controlled catalog reconciliation and forward repair. |
| 0027 write interruption | Lock/statement timeout or elevated lottery write activity. | Quiet window; 5s lock and 30s statement limits. | Roll back transaction automatically on error; reschedule. |
| Backup/PITR cannot be proved | No provider retention/restore evidence. | Obtain current owner-approved backup/PITR evidence. | No-Go. |
| Application schema mismatch | Affected read route or health check fails after a commit. | Verify catalog before route checks; capture sanitized logs. | Stop further work; choose compatible application rollback or forward repair after review. |
| Provider or financial execution | Flags/logs show a live execution attempt. | Keep flags absent/false; schema DDL has no provider call. | Stop and open a financial safety incident. |
| Schema rollback harms valid data | A new table/columns may already be used after release. | Do not pre-authorize `DROP` statements. | Forward repair is the default recovery. |

## Rollback and forward-repair posture

These additive migrations have no approved destructive rollback script. Before use, they create no application data; after use, dropping them could lose valid rows or invalidate deployed code. Therefore:

1. **Failure before `COMMIT`:** PostgreSQL transaction rollback is the recovery. Capture the error and do not retry blindly.
2. **Failure after 0027 commit, before 0029:** leave 0027 catalog state intact, verify it, and use a separately approved forward repair or compatible application rollback. Do not drop `rewards_periods`/columns ad hoc.
3. **Failure after 0029 commit:** verify all objects, keep schema intact, and forward repair route/application behavior under a new approval.
4. **Data restoration:** only a separately approved provider-supported restore/PITR procedure may be used; this package does not authorize it.

## Maintenance-window recommendation

Use a short, staffed, low-traffic window of 30 minutes, with a 15-minute post-verification observation period. The only material availability risk is 0027’s `ALTER TABLE` and non-concurrent index on `driver_lottery_entries`; the observed relation is 30 rows / 147,456 bytes, so expected DDL duration is short, but lock acquisition—not data volume—is the governing risk. Do not proceed merely because the table is small.
