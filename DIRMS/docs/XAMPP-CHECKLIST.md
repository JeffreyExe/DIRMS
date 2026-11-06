# Manual XAMPP acceptance checklist

Use test incidents and clearly marked demonstration records. Do not submit a
false emergency to a real service. Run these checks against a backed-up staging
database first. Record the browser, viewport, database version and actual result
beside each item. An unchecked box means unverified.

## Installation and upgrade

- [ ] Back up the full existing application, private evidence, legacy `uploads/`
  folder and database. Confirm the backup can be restored.
- [ ] Fresh installation: start Apache/MySQL and create an administrator through
  localhost `setup.php`; no default administrator credentials exist.
- [ ] Existing installation: preserve `config.php`, account records and evidence;
  run `upgrade.php` as an existing admin, rather than importing `schema.sql` over
  an existing database.
- [ ] Run the upgrade a second time; it reports no pending change and does not
  duplicate history, erase records or change references.
- [ ] Sign in with a pre-upgrade account and find a pre-upgrade `BS-` report.
  Confirm original submission time and private legacy notes are preserved.
- [ ] An upgraded old report shows only the known submission and real newer
  events; missing older administrative actions are disclosed.

## Required resident-to-administrator scenario

1. [ ] Register a resident account with a unique test email.
2. [ ] Log out and log in with that account. Check show/hide-password controls
   with keyboard and screen-reader labels.
3. [ ] Submit a Flood test report with a valid location and description.
4. [ ] Obtain a `DIRMS-` reference. Copy the reference and confirm a double click
   or retry of the same submission does not create another report.
5. [ ] Open My Reports and find the report by reference.
6. [ ] Confirm its current label is **Report Submitted** (Pending), with its real
   submission timestamp and no automatic administrative acknowledgement.
7. [ ] Open an independent browser profile/session and sign in as an admin.
8. [ ] Open Incident Reports and choose **Acknowledge Report**.
9. [ ] Choose **Start Review**.
10. [ ] Save a public review note and a different internal note without another
    status transition. Confirm there is an update event, not a fake milestone.
11. [ ] Return to the resident tracking page, keeping both sessions open.
12. [ ] Wait for the visible-page polling interval. Confirm the real Received and
    Reviewing events and public note appear automatically; the internal note
    never appears in the page, API JSON or page source.
13. [ ] As admin, choose **Mark Action in Progress** with a public update.
14. [ ] Confirm the resident timeline updates again without a page reload.
15. [ ] Enter a resolution summary as admin.
16. [ ] Choose **Mark Resolved**. Attempting this without a summary must fail.
17. [ ] Confirm the resident sees Resolved and the complete recorded event history.
18. [ ] Compare all saved history timestamps to the database. Refresh, add notes
    and reopen the report; earlier timestamps and events must stay unchanged.
19. [ ] Using the resident session, directly POST an admin status update. It must
    fail even if a valid resident CSRF token and report ID are supplied.
20. [ ] Sign in as a second resident. Direct report/details/history/photo lookups
    for the first resident's report must fail; its notifications must be absent.

## Exceptional workflow and concurrency

- [ ] Request More Information requires a public explanation. The resident sees
  the request and an action to provide follow-up through the displayed contact
  guidance; it is not a normal forward milestone.
- [ ] Reject a separate report with a reason. The timeline does not show a
  completed resolution. Rejecting without a public reason fails.
- [ ] Attempt an invalid jump such as Pending directly to Resolved. It fails on
  the server and creates neither status history nor a notification.
- [ ] Open the same report in two admin sessions. Save one change, then save from
  the stale view. The latter reports a conflict instead of overwriting the first.
- [ ] Retry a saved request with its original version. It does not duplicate
  history or notifications.
- [ ] Reopen a resolved/rejected case using the explicit Reopen action and a
  public explanation. Its former resolution remains in history; current progress
  is shown for the reopened case, without invented intermediate milestones.
- [ ] Direct SQL attempts to update/delete an established history entry fail.
  Use an appropriately restricted application database user in deployment.

## Guest reports and evidence

- [ ] In a logged-out session submit a test report. Its receipt shows a reference
  and private tracking code once, with copy/save controls and a privacy reminder.
- [ ] In a new browser session enter both values at `track-report.php`; details
  appear. Neither secret nor report data is put into the URL.
- [ ] A reference alone, guessed ID and wrong secret return generic errors and
  reveal no report existence, contact details, evidence or private notes.
- [ ] Repeated failed guest lookups are rate limited across fresh sessions.
- [ ] Check that browser history, outgoing URLs and access logs contain no guest
  tracking secret; guest pages/API responses have no-store/noindex protection.
- [ ] A legacy guest `BS-` report without a previously issued tracking secret
  cannot be claimed by reference alone; follow the administrator contact guidance.
- [ ] Valid JPG/PNG/WebP evidence under 5 MB is accepted. Oversized, malformed,
  disguised text/HTML/SVG and unsupported files are rejected with useful feedback.
- [ ] An authorized resident/admin/guest can open their report's protected photo.
  Another resident and a logged-out browser cannot fetch it by ID.
- [ ] Direct legacy `/uploads/...` and private-storage web requests are denied by
  Apache/Nginx. Confirm this on the actual web server; PHP's development server
  does not read `.htaccess` files.

## Polling, notifications and error handling

- [ ] While visible, tracking checks for updates approximately every 12 seconds.
  The UI says when it last synchronized; this is polling, not guaranteed instant
  delivery or emergency dispatch.
- [ ] Hide the tab and inspect network traffic: periodic checks pause. Reopen it:
  a fresh check runs promptly without overlapping requests.
- [ ] Keep a card/details/history expanded and focus a control. A background
  refresh preserves both expansion state and keyboard focus.
- [ ] The manual Refresh button works. An unchanged response does not rebuild
  the cards or cause a screen-reader announcement storm.
- [ ] Disconnect networking or stop MySQL. The UI preserves the last known
  status, shows failure/retry feedback, and does not invent a new status or sync.
- [ ] Restore service; the page recovers on refresh or the next successful poll.
- [ ] A real status change adds an owner-only notification and unread count.
  Clicking the notification reaches its timeline; marking it read persists.
- [ ] A different resident cannot mark the first resident's notification read.
- [ ] No browser-push permission prompt or cross-device push delivery is claimed.

## Existing modules and authentication

- [ ] Duplicate registration cannot create a second account; errors do not disclose
  account existence unnecessarily. Invalid and disabled logins use generic errors.
- [ ] Repeated bad logins trigger the durable throttle; a new session does not
  bypass it. Correct credentials work again after the documented window.
- [ ] Disabled users cannot keep using their existing authenticated session.
- [ ] Logout removes access to reports, notifications and guest session grants.
- [ ] All state-changing API actions reject absent or incorrect CSRF tokens.
- [ ] Expired/inactive alerts do not appear publicly. Severity/type/search/detail/
  safety instructions/manual refresh work. Demonstration edits stay labeled.
- [ ] A center with missing GPS uses a clearly approximate address search, without
  a precise custom pin. Supplying only one coordinate fails validation.
- [ ] Capacity/occupancy is shown as recorded; unknown/unverified/demo status
  never becomes a claim that a shelter is officially open.
- [ ] Hotline `tel:` links contain the recorded number. Check actual accuracy with
  the responsible agency; this software test does not verify phone service.
- [ ] Admin hotline/news/tip edits appear publicly, and expandable tips are usable
  by keyboard. No invented source-verification date appears.
- [ ] Browser-only previews explicitly say simulation and do not claim to have
  contacted responders, stored server records or delivered real notifications.

## Responsive and accessibility checks

At each width **320, 360, 375, 390, 430, 768, 1024, 1280 and 1440 pixels**:

- [ ] No page-level horizontal overflow, clipped references or unreadable text.
- [ ] Tracking cards, filters, stat cards and notifications reflow naturally.
- [ ] Mobile timelines stack vertically; state is conveyed by text/icons as well
  as color, including rejected and needs-information cases.
- [ ] Admin report tables/cards and review dialogs remain usable; content scrolls
  without trapping the entire page sideways.
- [ ] Navigation opens/closes by button, Escape and link activation, and updates
  `aria-expanded`. The active page is indicated.
- [ ] Touch controls have usable 44px targets, visible focus and correct labels.
- [ ] Dialog focus stays inside the dialog and returns to its opener on close.
- [ ] Browser zoom at 200%, long locations/notes and screen-reader navigation are
  usable. Reduced-motion preference prevents unnecessary animation.
- [ ] Real external Google Maps rendering and directions work with the deployment
  browser/network; the application does not claim coordinates were verified by it.
