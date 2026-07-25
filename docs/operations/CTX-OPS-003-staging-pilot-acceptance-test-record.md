# CTX-OPS-003 — Staging Pilot Acceptance Test Record

- **Document ID:** CTX-OPS-003
- **Version:** 0.1
- **Status:** In Progress — staging acceptance evidence
- **Owner:** Platform Operations
- **Product:** CreteXchange
- **Scope:** Release candidate `release/admin-repository-production`

## Purpose

This record preserves objective staging acceptance evidence for the controlled CreteXchange pilot release. It is not production authorization, does not authorize financial execution, and must not be used to represent an unexecuted test as passing.

## Environment and release identity

- **Repository:** `msti64-wq/Cretexchange_temp`
- **Remote:** `railway-repo`
- **Staging service:** `robust-cooperation`
- **Staging environment:** `staging`
- **Starting release commit:** `0a1bc067194c9b305310374f9120d7ec5199203a`
- **Financial execution:** disabled; no collection, settlement, payout, or provider execution is authorized.

## Results

| Test ID | Objective | Role | Preconditions | Exact steps | Expected result | Actual result | Status | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SAT-001 | Verify release identity and health | Operator | Staging deployment available | Request `/api/system/health` | Healthy staging response; no financial execution | Health response is healthy; later deployed correction reports `environment=staging` and `financialExecution=disabled`. | PASS | Sanitized endpoint result captured during release validation. |
| SAT-002 | Verify governed migrations | Operator | Controlled staging migration runner | Apply 0036 then 0037; inspect PostgreSQL catalog | Tables, indexes, and constraints present | Both migrations applied and catalog-verified. | PASS | 0036: review table, 4 indexes, 2 constraints. 0037: photo-review table, 2 indexes, 1 constraint. |
| SAT-003 | Verify Document Library publication | Admin | Admin session; governed synchronization complete | Open Operations Library and a governed document | Published inventory is protected and readable | 48 governed documents, 307 relationships, 7 categories, Healthy, zero conflicts; document viewer works. | PASS | Repository synchronization second run was duplicate-free. |
| SAT-004 | Driver submission with private photo | Driver | Controlled staging Driver, approved Facility, real staging object storage | Sign in, select facility, upload evidence, submit | Pending activity and private photo created | Not executed: controlled staging accounts and fixture data require the governed bootstrap to be run from the Railway staging service. | BLOCKED | No account credentials or Railway console session were available after deployment. |
| SAT-005 | Owner verification | Facility Owner | SAT-004 pending activity | Sign in, open owned activity, verify | Activity verified by Owner only | Not executed. | BLOCKED | Depends on SAT-004. |
| SAT-006 | Owner rejection and Driver review request | Driver / Facility Owner | Pending controlled activity | Owner rejects with reason; Driver submits explanation | One unresolved review request exists | Not executed. | BLOCKED | Depends on SAT-004. |
| SAT-007 | Admin closes review | Admin | Open SAT-006 review | Close with rationale and acknowledgement | Activity remains rejected; audit appended | Not executed. | BLOCKED | Requires controlled review data. |
| SAT-008 | Admin returns review to Owner | Admin / Facility Owner | Separate open rejected review | Return to Owner; Owner makes final decision | Pending return; final decision remains Owner-only | Not executed. | BLOCKED | Requires controlled review data. |
| SAT-009 | Photo Review verify and fail | Admin | Two real private photos in reviewable state | Verify one; fail one with reason; retry stale request | Evidence-only changes; audit records; stale request denied | Not executed. | BLOCKED | Queue is empty; no controlled photos exist. |
| SAT-010 | Private-image authorization | Driver / Owner / Admin / Super Admin | SAT-004 photo | Retrieve permitted image; test anonymous and cross-tenant access | Role-authorized access only; no public URL | Anonymous protected APIs return HTTP 401; role-specific image acceptance remains unexecuted. | PARTIAL | Requires real controlled private photo. |
| SAT-011 | Role isolation and concurrency | All roles | Controlled identities and review/photo records | Attempt prohibited actions and stale decisions | Denial or conflict; no financial effect | Focused automated authorization and optimistic-concurrency tests pass; live role acceptance not executed. | PARTIAL | Requires governed staging identities. |
| SAT-012 | Financial isolation | Operator | Staging service configuration | Inspect normalized execution controls while performing operational actions | All execution controls disabled | Confirmed disabled before acceptance scenarios. | PASS | No charges, collections, settlement, payout, or provider action performed. |

## Defect and blocker register

| Reference | Finding | Classification | Required resolution |
| --- | --- | --- | --- |
| SAT-B-001 | Staging role and photo-review acceptance cannot begin until the fail-closed staging bootstrap is executed through the authorized Railway staging service with non-secret configuration. | Release blocker | Configure the required staging-only bootstrap variables, run the script once, and continue SAT-004 through SAT-011. |

## Evidence controls

- Credentials, tokens, raw connection strings, object keys, private image URLs, and personal information are excluded from this record.
- Each test must retain its actual outcome. A blocked or unexecuted result must remain blocked until superseded by dated staging evidence.
- This record requires an update after every controlled acceptance run and before any production promotion decision.
