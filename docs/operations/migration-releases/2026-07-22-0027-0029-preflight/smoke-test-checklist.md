# Smoke-Test Checklist — 0027 and 0029

> **PREFLIGHT ONLY — NOT AUTHORIZATION TO EXECUTE**

Run only after schema verification passes. These are non-destructive checks; do not create rewards periods, lottery entries, payment attempts, financial batches, payments, or provider actions.

| Check | Expected result | Evidence |
| --- | --- | --- |
| Production health endpoint | HTTP 200, healthy, database connected. | |
| Application startup logs | No missing-column/table startup or route error related to rewards periods or canonical payment attempts. | |
| Admin rewards-period read route | Authorized read response is schema-safe; unauthorized access remains denied. | |
| Lottery history/read route | Schema-safe response; no missing eligibility/rewards-period column error. | |
| Admin Financial Operations overview | Schema-safe read response; no missing canonical payment-attempt table error. | |
| Canonical batch detail/read route | Schema-safe read response; no execution request is issued. | |
| Financial execution policy | Startup policy and route controls remain denied; no provider request. | |
| Existing owner/driver operational reads | Continue to respond normally; no financial lifecycle behavior is changed by this schema-only release. | |

## Observation plan

Observe the production application for at least 15 minutes after the final schema verification. Review only sanitized health and error-level logs for the affected route/table/column names. Stop and escalate on any schema error, authorization regression, startup error, or financial-execution signal.
