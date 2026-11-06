# DIRMS 1.0 repository audit

Baseline: Git commit `cbf7b1c` (`Add files via upload`), checked out from
`https://github.com/JeffreyExe/DIRMS`. Development branch:
`codex/dirms-1-tracking`. This audit refers to the baseline, before the tracking
implementation. There was no attached production database to inspect or modify.

## Confirmed existing application

The repository contains a PHP 8.2+ application in the nested `DIRMS/` directory,
not a framework project. `index.php` renders the common header, footer and public
page bodies; small PHP wrappers select individual pages. `api.php` provides the
action-based API. `app/bootstrap.php` provides PDO, sessions, CSRF, authorization
and validation helpers. `schema.sql` and localhost-only `setup.php` install the
database and initial administrator. Existing `BS_DB_*` variables and the default
`bantay_sakuna` database name must remain compatible.

| Existing feature | Baseline implementation and limitation |
| --- | --- |
| Registration/login/logout | Server-side sessions, password hashes, unique email, active-account checks and resident/admin roles exist. Login has no durable rate limit. Registration identifies duplicate emails. Password visibility controls are absent. |
| Incident submission | Guest and resident reports, type/location/description validation, optional MIME-checked image, pending state and session-only 15-second throttle exist. Receipt numbers are calculated as `BS-` plus the record ID. There is no submission idempotency key. |
| My Reports | Owner-filtered list exists. It displays the current state and `admin_notes`, without separating public and private notes. No history, notification center, timeline or automatic refresh exists. |
| Administrator review | Admin-only API and dashboard exist, with four statuses and a free-text note. Changes overwrite current fields, without transition rules, a required resolution/rejection reason, version check or atomic history. |
| Alerts | Database-backed active/unexpired list, severity filter, search, detail modal and manual refresh exist. Demonstration rows are labeled. |
| Evacuation centers | Search, capacity/occupancy, GPS validation, Google Maps links and approximate address lookup exist. Occupancy alone is used to imply availability. Coordinate presence does not establish verification or official opening. |
| Hotlines/tips/news | Database content and admin editing exist. Telephone links, expandable guidance and source links exist. Hotline entries lack per-number verification metadata. |
| User management | Admin role and activation editing exist. A user cannot remove their own active admin access. |
| Browser previews | `preview*.html`, `admin-preview.html` and `demo-data.js` simulate behavior through browser storage. They are separate from the PHP/MySQL application. |

## Prioritized findings

1. **Private incident data:** `my_reports` returns `admin_notes` to residents.
   New public notes must be stored separately; legacy notes must remain private.
2. **Evidence privacy and missing directory:** image paths point to public
   `uploads/` URLs, and the baseline tree does not contain the advertised upload
   directory or deny rule. Images need private storage, server-side ownership
   checks and explicit web-server protection for old files.
3. **Missing history and concurrency:** status updates are a standalone UPDATE.
   There is no event table or version check. A second admin can overwrite an
   earlier update, and audit logs do not establish an accurate status timeline.
4. **Unsafe status workflow:** any of four valid strings can replace any other.
   Receipt acknowledgement, action in progress, more-information requests and
   explicit reopen events do not exist. Rejection and resolution have no
   mandatory explanation.
5. **Guest lookup absent:** saving a report gives a predictable reference only.
   No private tracking secret or authorized guest report access exists.
6. **History retention:** the generic delete endpoint permits report deletion.
   It must not allow removal of reports and their permanent event history.
7. **Authentication abuse:** login lacks a cross-session/IP/account rate limit.
   Existing prepared statements, session regeneration, HTTP-only/SameSite
   cookies and CSRF helpers are useful foundations to retain.
8. **Demonstration data:** editing an alert, center, hotline or news entry forces
   `is_demo=0`, which can silently turn a demonstration entry into a live-looking
   one. No official warning or center availability should be inferred from it.
9. **Unsupported verification claims:** `community-seed.php` and
   `update-directory.php` claim a November 2026 phone-number verification without
   an individual source or verification record. Preserve supplied numbers, remove
   unsupported assertions and require local administrators to verify them.
10. **User experience:** the baseline tracking page lacks search, status filters,
    statistics, progress milestones and connection state. Mobile navigation does
    not consistently reset `aria-expanded` on close; dialogs have no complete
    focus trap/restoration. Existing CSS breakpoints are useful, but source
    inspection alone cannot prove absence of overflow at every requested width.
11. **Database lifecycle:** `CREATE TABLE IF NOT EXISTS` cannot upgrade an
    existing status enum. Additive migrations, explicit version records and a
    backup procedure are required. MySQL DDL implicitly commits; a failed upgrade
    must be recoverable by rerunning an idempotent migration.

## Implementation boundaries

Reuse the action-based API, PHP page structure, PDO helpers, hashed account
credentials, common CSS palette and module data. Preserve the original database
name and old `BS-` reference identifiers. Extend the status enum and add columns,
history, notifications and rate-limit storage rather than replacing tables.

Backfill only an initial submission event using the original submitted timestamp.
An old current status does not establish when, by whom or in which sequence it
was reached. Keep that limitation visible; never fabricate missing admin events,
complete skipped milestones or copy legacy private notes into public history.

## Verification record

The initial workspace had Git and Node but no host PHP or MySQL executable. An
isolated runtime was subsequently prepared for actual integration checks.
This audit is a source inspection, not evidence that the original application
passed its claimed historical tests. Current execution results belong in the
README and test output after the checks actually run. Mobile visual rendering,
external Google Maps tiles and physical hotline accuracy require the manual
checks in [XAMPP-CHECKLIST.md](XAMPP-CHECKLIST.md).
