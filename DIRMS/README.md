# DIRMS 1.0 — Disaster Information and Response Management System

PHP 8.2+ / MySQL application for San Pablo City, Laguna, Philippines. The existing
multi-page PHP website is retained, with incident tracking, permanent history,
secure guest tracking, administrator review and in-app notifications.

This is a community project, not an official warning feed or automatic dispatch
service. Online reports do not call responders. For immediate danger in the
Philippines, call **911**. Demonstration alerts, news and centers are examples;
their presence does not establish a real emergency or an officially open shelter.

## Features

- Resident registration, session login/logout, hashed passwords, roles,
  disabled-account checks, password visibility controls and login throttling.
- Guest and signed-in incident submissions with optional protected JPG/PNG/WebP
  evidence, validation, duplicate-retry protection and a copyable reference.
- My Reports with search, filters, sorting, summary counts, actual event
  timelines, expandable history, public responses and manual refresh.
- Seven report states, validated admin actions, required closing explanations,
  explicit reopen events, private notes and concurrent-update conflict detection.
- Guest tracking using a reference **and** a private tracking code; reference
  alone never grants access. Only a protected code hash is stored in MySQL.
- Database-backed owner-only notifications and unread counts, without browser
  push or cross-device emergency-delivery claims.
- Existing alerts, evacuation centers/maps, emergency directory, preparedness,
  news, user administration and clearly marked browser-only previews.
- Responsive navy/light-blue/white/red layouts, keyboard interaction, visible
  focus and reduced-motion support.

See [docs/AUDIT.md](docs/AUDIT.md) for the original source audit and compatibility
decisions, and [docs/XAMPP-CHECKLIST.md](docs/XAMPP-CHECKLIST.md) for acceptance
checks that require a real browser/XAMPP installation.

## Repository layout and prerequisites

The repository root contains this application inside the **nested `DIRMS/`
folder**. Copy that inner folder, which contains `index.php` and `api.php`, into
your web server's document root. Examples assume `http://localhost/DIRMS/`.

Requirements:

- PHP **8.2+** with `pdo_mysql`, `mbstring`, `fileinfo`, session and JSON support.
  XAMPP's PHP/Apache and MariaDB/MySQL are suitable.
- MySQL **8.0+** or MariaDB **10.4+**, InnoDB and `utf8mb4`.
- A modern browser with JavaScript and cookies enabled.
- A writable private evidence directory and writable MySQL data storage.
- Internet access for external Google Maps/source links. Core report tracking
  does not require a third-party API key.

No Composer packages, JavaScript build or WebSockets are required. The migration
account needs CREATE/ALTER/INDEX/TRIGGER privileges. Use a separate application
account with fewer privileges after installation.

To allow the application's full 5 MB image limit, set PHP `upload_max_filesize`
to at least `5M` and `post_max_size` above the combined request size (for example,
`8M`), then restart Apache after editing `php.ini`. The server still enforces the
application's 5 MB limit and a 40-megapixel image-size ceiling.

## Fresh installation with Windows XAMPP

1. Clone/download the repository and copy its inner `DIRMS` folder to
   `C:\xampp\htdocs\DIRMS` (adjust if XAMPP is installed elsewhere).
2. Start **Apache** and **MySQL** in the XAMPP Control Panel.
3. Edit `config.php` if settings differ. Compatible defaults remain host
   `127.0.0.1`, port `3306`, database `bantay_sakuna`, user `root`, empty password.
   These defaults are for a local development installation.
4. On the XAMPP computer, open `http://localhost/DIRMS/setup.php` and create your
   own administrator name, email and password of at least 12 characters. Setup
   is localhost-only. Its explicit POST action creates the database, tables,
   tracking migration and clearly labeled demonstration content.
5. Open `http://localhost/DIRMS/login.php` with those credentials. Admins go to
   `admin.php`; residents go to My Reports.
6. Restrict or remove `setup.php` after installation. Keep recoverable backups.

There is **no default administrator email/password**. Registration always creates
a resident. Existing admins manage roles and account activation in **Admin → Users**.

Configuration preserves the original environment variables:

| Variable | Meaning / default |
| --- | --- |
| `BS_DB_HOST` | MySQL hostname, `127.0.0.1` |
| `BS_DB_PORT` | MySQL port, `3306` |
| `BS_DB_NAME` | Existing database name, `bantay_sakuna` |
| `BS_DB_USER` | Database account, `root` for local XAMPP only |
| `BS_DB_PASS` | Database password, empty for default local XAMPP |
| `DIRMS_PRIVATE_STORAGE` | Absolute private evidence directory; use a path outside the web root in production |

Keep actual credentials out of Git. Preserve customized `config.php` during
updates. Use HTTPS outside localhost; do not expose a development PHP server.

## Upgrade an existing database safely

**Do not drop tables, replace the database, recreate residents or import
`schema.sql` over existing production data.**

1. Export the current database through phpMyAdmin or `mysqldump`. Back up the full
   old application, customized `config.php`, legacy `uploads/` and private evidence.
   Confirm that the backups can be restored.
2. Use a maintenance window. Copy updated files, preserving local configuration
   and all evidence files.
3. Sign in with an existing admin and open `http://localhost/DIRMS/upgrade.php`.
   Confirm the backup checkbox and run the explicit upgrade action. GET does not
   migrate. Alternatively, from the **repository root** run:

   ```sh
   php DIRMS/upgrade.php --apply
   ```

   On Windows with default XAMPP PHP, from the repository root:

   ```bat
   C:\xampp\php\php.exe DIRMS\upgrade.php --apply
   ```

   If the working directory is already the inner application folder, use
   `php upgrade.php --apply` instead.
4. Use a migration database account with CREATE/ALTER/INDEX/TRIGGER privileges.
   The upgrade extends the existing enum and adds report columns, history,
   notification and migration-version storage, without deleting users or reports.
   It also adds a nullable evacuation-center last-edit timestamp. Existing rows
   keep an unknown last-edit time until an actual administrator save.
5. Run the upgrade again. It should report no pending change. Inspect existing
   account access, old references, timestamps and evidence before ending maintenance.

The migration uses a database advisory lock and version record. MySQL DDL is not
fully transactional. If interrupted or denied privileges, correct the problem
and rerun the idempotent upgrade; do not manually mark a failed migration applied.
If rollback is needed, restore the backups, including files and database together.
Do not drop new columns that may already contain real data.

Old references retain their original `BS-000123` form. New reports receive
`DIRMS-000123` references. Original enum values/order, account IDs and password
hashes remain intact. The database stays `bantay_sakuna` unless configured otherwise.
Never rename database identifiers just to update visible branding.

Old records receive only a submission event at their original `created_at` time.
Existing current status is preserved, but missing older admin actors/actions/times
cannot be reconstructed; the tracker discloses incomplete legacy history. Legacy
`admin_notes` remain **internal**. An admin must deliberately publish a new public
update if appropriate. A legacy guest report without an issued private secret
cannot be claimed using a predictable reference alone.

## Resident registration and submission

Register through `register.php` and sign in through `login.php`. Passwords need at
least eight characters; new passwords respect bcrypt's 72-byte limit. A disabled
account cannot keep accessing private data through an existing session. Use the
show/hide-password control as needed. Authentication failures and duplicate
registration use generic errors; repeated attempts are throttled.

Abuse counters are private, file-backed and locked across processes on one
server; clearing cookies does not reset them. Current limits are 30 login attempts
per IP and 10 per account per 15 minutes, 15 guest lookups per IP per 15 minutes,
20 registrations per IP per hour, and 20 report submissions per IP per 15 minutes.
Limits count attempts, including successful requests; a 429 response includes
`Retry-After`. The per-session report interval is additionally 15 seconds. For
multiple web servers, use shared locking storage or replace the limiter with a
shared backend before scaling. Retain the private storage between restarts.

At `report-incident.php`, choose an incident type, provide a specific location
and description of at least ten characters, and optionally supply contact details
and one JPG/PNG/WebP image up to **5 MB**. The server validates size, MIME and image
content rather than trusting the extension. Avoid unnecessary personal data.

The submit button shows loading, and the receipt has copy/save controls. A saved
report starts **Pending / Report Submitted**. Storage does not mean an admin has
read it or dispatched help. An idempotency key prevents a retry of the same
submission from creating another record. Separate submissions are also throttled.

## Tracking signed-in reports

Open `my-reports.php`. Only incidents submitted while signed into that account
appear. Search reference/type, filter status, sort newest/oldest and expand a
card's details or full history. Cards display reference, location, submission
time, current state, last activity and public administrator updates.

The timeline uses only recorded events and real timestamps. Skipped/unrecorded
milestones have no invented completion time. Rejection and information requests
are separate states, not normal forward milestones. Reopening preserves old
history and records an explicit new cycle. Guest reports do not automatically
become account-owned after later registration.

Private admin notes and another user's records are excluded by server-side
authorization and serialization, not merely hidden in the interface.

API event times are UTC with an explicit timezone; the interface displays
Philippine time (`Asia/Manila`). Saving a new note or reopening a report never
rewrites an earlier event's timestamp.

## Tracking guest reports

After logged-out submission, save **both** the reference and private tracking code
using the receipt's copy/save controls. Keep the code private: anyone possessing
both can view that report's public tracking details and authorized evidence.
PHP `random_bytes()` generates a 256-bit secret; MySQL stores only its SHA-256 hash.

At `track-report.php`, enter both values. The code is submitted in a **POST body**,
never in a URL or public link. Successful lookup grants expiring access within
the current server session for subsequent refresh/evidence requests. No private
tracking code is persisted in browser storage. Failed lookups use generic errors
and durable throttling. Sensitive responses use no-store and noindex protections.

A successful lookup grants access for **30 minutes** in that server session.
Re-enter both values when it expires, and use the tracking page's forget/close
control on shared devices. This does not transfer ownership to an account.

Save the code when issued. Its stored hash cannot recover it, and there is no
public recovery-by-reference mechanism. For older guest reports or lost receipts,
use independently verified administrator contact details. Administrators must
not disclose a report on the basis of a reference or claimed name alone.

## Administrator review workflow

In **Admin → Incident Reports**, use search/type/status/date filters and sorting,
then open a report. Review reporter, location, description, authorized evidence,
real history, latest public response, internal notes and last activity.

| Stored status | Resident label | Admin action |
| --- | --- | --- |
| `pending` | Report Submitted | Initial submission only |
| `received` | Received by Admin | Acknowledge Report |
| `reviewing` | Under Review | Start Review |
| `in_progress` | Action in Progress | Mark Action in Progress |
| `resolved` | Resolved | Mark Resolved; public resolution summary required |
| `rejected` | Rejected | Reject Report; public reason required |
| `needs_info` | Additional Information Required | Request More Information; public request required |

The server enforces allowed transitions. Residents cannot change administrative
status, including with a valid resident CSRF token. Resolved/rejected cases use
an explicit **Reopen Report** action with a public explanation, preserving history.

Use **Public update** for resident-facing content and **Internal note** for staff
information. Note-only saves create update events, not fake progress milestones.
A genuine transition locks the report, checks the expected version and atomically
saves current status, immutable history and owner notification. A stale admin
view receives a conflict rather than silently overwriting an earlier change.

The application cannot delete reports or edit/delete established history. Database
triggers additionally protect event immutability. A database owner can alter its
schema, so retain independent backups and use least-privilege runtime credentials.

## Automatic refresh and in-app notifications

Visible tracking pages check approximately every **12 seconds**. Polling pauses
while hidden and resumes promptly when visible. Requests do not overlap; version
comparison avoids returning unchanged report payloads. Expanded cards and focus
are preserved, Refresh is available, and the last successful sync time is shown.
Failure retains the last known status with clear connection feedback.

This is automatic polling, **not guaranteed instant delivery**. Leave the tracking
page open and online. DIRMS 1.0 is not a PWA, WebSocket dispatch service or
cross-device emergency push channel.

Authenticated owners receive database-backed report-change notifications and
unread counts in My Reports. A notification links to its report and can be marked
read. Other accounts cannot list or mark it. Guests track with their receipt.
No browser-push permission is requested; stored events support future DIRMS 2.0 work.

## Existing information modules

- **Alerts:** active/unexpired MySQL entries appear publicly with search,
  severity/category filters, details, safety instructions and Refresh. Admin-entered
  updates are not an integrated official live feed. Keep samples labeled demo.
- **Evacuation centers:** address, recorded capacity/occupancy and optional GPS
  are admin-managed. A precise coordinate query requires both latitude and
  longitude; unknown GPS uses a marked approximate address search. Stored
  occupancy or demo data does not prove official opening. Inactive entries are
  hidden publicly, while unverified/demo entries are identified. Confirm real
  designation, coordinates and current conditions before travel.
- **Hotlines:** links dial recorded numbers. Supplied directory content does not
  constitute a new verification of phone service. Verify with the responsible
  agency and record source information where available; never invent a number.
- **Preparedness/news:** database content is admin-editable; tips expand and news
  can link to sources. Check guidance and retain demo labels before public use.
- **Directory update:** admin-only `update-directory.php` adds missing starter
  hotline/tip entries. It does not verify them or overwrite reports/accounts.
- **Previews:** `preview.html`, `preview-*.html` and `admin-preview.html` simulate
  actions in browser storage. They do not write MySQL records, contact responders
  or verify real tracking. Use `.php` pages for database functionality.

## Private evidence and deployment security

New evidence uses `DIRMS_PRIVATE_STORAGE`, defaulting to `storage/private/` in
this application. For production, set an absolute directory **outside the web
root**, writable by PHP and included in backups. Evidence is served through
`api.php?action=report_photo&id=...` only after ownership, admin authorization or
an expiring guest-session grant. Raw paths and secret hashes are never public
API fields. Keep legacy evidence during upgrades.

Bundled Apache deny rules protect `storage/` and legacy `uploads/`. Enable the
needed override behavior or equivalent virtual-host rules, and verify direct
file requests return 403. PHP's built-in development server ignores `.htaccess`.
For Nginx, adapt these rules to the actual URL prefix:

```nginx
location ^~ /DIRMS/storage/ { deny all; }
location ^~ /DIRMS/uploads/ { deny all; }
location ^~ /DIRMS/app/ { deny all; }
location ^~ /DIRMS/migrations/ { deny all; }
```

Restrict SQL/config source, dotfiles, backups and installer tools. Do not expose
an entire checkout containing `.git`. Use HTTPS, least-privilege SQL credentials,
regular backups and appropriate retention. Prepared statements, escaping, CSRF,
roles, ownership checks, secure sessions and throttles protect the application
layer; actual web-server configuration and verified emergency operations remain
necessary. Do not log request bodies containing guest codes or personal details.

The application uses its own `DIRMSSESSID` cookie namespace. Login, registration
and logout clear prior principal-specific report grants/receipt caches; switching
accounts must not carry private guest access to the next account.

## Pages and implementation files

| Path | Purpose |
| --- | --- |
| `index.php`, public `*.php` wrappers | Common layout and public routes |
| `my-reports.php`, `track-report.php` | Account and guest tracking |
| `api.php` | Existing action API plus tracking/history/notifications |
| `admin.php`, `assets/js/admin.js` | Authorized administration and review |
| `app/bootstrap.php` | PDO/UTC, sessions, CSRF, validation and roles |
| `app/tracking.php` | Report authorization, serialization, transitions and notifications |
| `app/migrations.php`, `migrations/` | Additive versioned database upgrades |
| `upgrade.php`, `setup.php` | Existing-install upgrade and localhost fresh setup |
| `assets/js/tracking.js`, `assets/css/tracking.css` | Polling, timeline and notification UI |
| `assets/js/app.js`, `assets/css/style.css` | Shared public modules and responsive styling |
| `schema.sql`, `config.php` | Fresh schema and compatible configuration |
| `../tests/` | Automated test scripts, invoked from repository root |
| `docs/` | Baseline audit and manual acceptance checklist |

Existing API actions are retained. Tracking reads use `my_reports`,
`report_details`, `report_history`, `my_notifications` and protected `report_photo`.
Guest authentication uses **POST** `track_guest_report` to avoid secrets in URLs.
Admin writes use `report_status`, `admin_acknowledge_report` and
`report_add_public_update`; notification writes use `mark_notification_read`.
All writes need the session CSRF token. JSON responses include `ok`; failures
carry appropriate HTTP status. Residents cannot insert arbitrary history events.

## Testing and known limitations

The integration suite at `../tests/integration.php` exercises the original schema
upgrade and real HTTP/API/database workflows. It deliberately resets its selected
database, so run it **only on a disposable local database**. It requires explicit
`DIRMS_TEST_ALLOW_RESET=1`, a database name ending in `_test`, a local server URL,
and PHP `allow_url_fopen` for its HTTP client. Do not point a test at production.

From the **repository root**, create an empty disposable database such as
`dirms_test`, then configure the same `BS_DB_*` credentials in two terminals.
The account needs table/trigger creation and test-reset privileges. For local
development using the default credentials, a POSIX-shell example is:

```sh
export BS_DB_NAME=dirms_test
export DIRMS_PRIVATE_STORAGE="$PWD/work/qa-private"
php -d upload_max_filesize=6M -d post_max_size=8M -S 127.0.0.1:8080 -t DIRMS DIRMS/router.php
```

In the second terminal, with the same database/storage environment:

```sh
DIRMS_TEST_ALLOW_RESET=1 DIRMS_TEST_URL=http://127.0.0.1:8080 php tests/integration.php
```

Optional process-level fresh-setup and unavailable-database checks:

```sh
DIRMS_TEST_ALLOW_RESET=1 php tests/runtime-checks.php
```

These require `proc_open`, local subprocess listening and permission to create/drop
the derived disposable database: selecting `dirms_test` also resets
**`dirms_setup_test`**. Never use either name for valuable data. The suite launches
and stops its own temporary PHP servers; it does not use an external emergency
service.

Set host/port/user/password through the documented environment variables if they
differ. The server and test runner must use the same database. Use a fresh private
test directory and restart the test server for a new run so old abuse counters
do not affect it. Never remove a real deployment's counters or evidence to make
a test pass. The provided development router blocks direct private/legacy evidence
URLs; it is not a production server.

Windows users can run the same PHP scripts with `C:\xampp\php\php.exe`, set the
variables in their shell before starting Apache/PHP, and point `DIRMS_TEST_URL`
at a separate disposable XAMPP application/database. Keep production configuration
and data separate. Manual browser acceptance is separate from the automated
checks below.

JavaScript DOM regression tests use Node 18+ and jsdom; they do not replace visual
browser checks. Install their locked development dependency and run from the
repository root (Node/npm are test tools, not production PHP requirements):

```sh
npm --prefix tests ci --ignore-scripts
npm --prefix tests test
```

If PHP is not on `PATH`, set `PHP_BIN` to the absolute PHP executable for these
tests, for example `PHP_BIN=/path/to/php npm --prefix tests test`. The tests render
PHP page templates and simulate polling, filtering, focus/expansion preservation,
admin transitions, public/private notes and error handling in a DOM environment.

Executed validation in the isolated development runtime:

| Check | Actual result |
| --- | --- |
| Real HTTP/MySQL integration suite | **186 assertions passed** |
| Fresh installer/repeat install/unavailable DB process checks | **10 assertions passed** |
| Tracker/admin/public DOM regression suites | **29 tests passed** (11 / 8 / 10) |
| PHP syntax | **29 files passed** |
| JavaScript source syntax | **4 files passed** |
| Diff whitespace and local Markdown links | Passed |

Runtime: **PHP 8.3.36, MariaDB 11.8.6**. API checks exercised the original-schema
upgrade, retained accounts/BS references/timestamps, owner isolation, guest
codes/throttling, protected uploads, the full status lifecycle, note privacy,
notifications, invalid/stale/concurrent updates, atomic rollback, demo handling
and CRUD for existing information modules. Tests used disposable local databases;
no production database was modified. Windows Apache/XAMPP, every supported MySQL
version and actual browser layout were not verified by these automated runs.

Run the full [manual XAMPP checklist](docs/XAMPP-CHECKLIST.md) before deployment.
It includes the 20-step resident/admin scenario, guest lookup, ownership/CSRF,
invalid transitions, retries/conflicts, legacy records, evidence, notifications,
outages, modules and responsive/accessibility checks.

Browser acceptance remains necessary at **320, 360, 375, 390, 430, 768, 1024,
1280 and 1440+ px**, including zoom, long content, keyboard focus and reduced
motion. CSS source review cannot establish pixel-accurate behavior. External maps,
phone-call handling and actual hotline/center accuracy depend on deployment and
responsible agencies. Missing old events cannot be recovered. Guest-code recovery,
cross-device browser push and real emergency dispatch are not implemented.
