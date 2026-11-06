<?php
declare(strict_types=1);

/** Shared resident/guest presentation. All private report data is fetched with authorization. */
function renderTrackingPage(bool $guest = false): void { ?>
<main class="page-main interior-page tracking-page" id="reportTracker" data-tracking-mode="<?= $guest ? 'guest' : 'resident' ?>">
  <div class="interior-intro tracking-intro">
    <div><span class="feature-kicker">DIRMS · INCIDENT TRACKING</span><h1><?= $guest ? 'Track My Report' : 'My Incident Reports' ?></h1><p>Follow recorded updates from submission to resolution. Online reports do not dispatch emergency assistance.</p></div>
    <a class="btn btn-danger" href="report-incident.php">+ Report an incident</a>
  </div>
  <section class="tracking-help" aria-label="How tracking works"><span aria-hidden="true">◷</span><p>Updates are checked about every 12 seconds while this page is visible. Delivery depends on your connection and administrator activity. For immediate danger, call <a href="tel:911">911</a>.</p></section>
<?php if ($guest): ?>
  <section class="panel guest-tracking-panel" aria-labelledby="guestTrackingTitle">
    <div><span class="feature-kicker">PRIVATE GUEST ACCESS</span><h2 id="guestTrackingTitle">Use your submission receipt</h2><p>Your reference identifies the report. Your private tracking code protects its details. Keep the code private.</p></div>
    <form id="guestTrackingForm" class="form-stack" autocomplete="off">
      <label for="guestReference">Report reference<input id="guestReference" name="reference" required maxlength="40" spellcheck="false" autocapitalize="characters" placeholder="DIRMS-000125 or BS-000125"></label>
      <label for="guestTrackingCode">Private tracking code<span class="tracking-secret-field"><input id="guestTrackingCode" name="tracking_code" type="password" required maxlength="128" autocomplete="off" spellcheck="false"><button type="button" id="toggleTrackingCode" aria-controls="guestTrackingCode" aria-pressed="false">Show</button></span></label>
      <button class="btn btn-blue" type="submit" id="guestTrackingSubmit">Track report</button>
    </form>
    <p class="tracking-muted">Signed in when you submitted? <a href="my-reports.php">Open My Reports</a>. Older guest reports without a private code need direct follow-up with the disaster office.</p>
  </section>
<?php else: ?>
  <section class="tracking-stats" id="trackingStats" aria-label="Your report totals" hidden></section>
  <section class="panel tracking-notifications" id="trackingNotifications" aria-labelledby="trackingNotificationsTitle" hidden>
    <div class="tracking-section-heading"><h2 id="trackingNotificationsTitle">Report notifications <span class="tracking-unread" id="notificationUnread" aria-label="Unread notifications">0</span></h2><button class="btn btn-outline btn-sm" id="markAllNotifications" type="button">Mark all as read</button></div>
    <details id="notificationDetails"><summary>View recent updates</summary><div id="notificationList"></div></details>
  </section>
<?php endif; ?>
  <section class="panel tracking-dashboard" aria-labelledby="trackingReportsTitle">
    <div class="tracking-section-heading"><div><span class="feature-kicker"><?= $guest ? 'YOUR PRIVATE TIMELINE' : 'YOUR REPORTS' ?></span><h2 id="trackingReportsTitle"><?= $guest ? 'Report progress' : 'Every report, every recorded update' ?></h2></div><div class="tracking-sync-actions"><button class="btn btn-outline btn-sm" id="trackingRefresh" type="button">↻ Refresh</button><?php if ($guest): ?><button class="btn btn-outline btn-sm" id="trackingForget" type="button" hidden>Clear report</button><?php endif; ?></div></div>
    <p class="tracking-sync" id="trackingSync" role="status" aria-live="polite">Loading tracking service…</p>
    <div class="tracking-feedback" id="trackingFeedback" role="status" aria-live="polite" hidden></div>
<?php if (!$guest): ?>
    <div class="tracking-filters" id="trackingFilters" hidden>
      <label for="trackingSearch">Find a report<input id="trackingSearch" type="search" placeholder="Reference or incident type" maxlength="100"></label>
      <label for="trackingStatus">Status<select id="trackingStatus"><option value="all">All statuses</option><option value="pending">Report Submitted</option><option value="received">Received by Admin</option><option value="reviewing">Under Review</option><option value="in_progress">Action in Progress</option><option value="resolved">Resolved</option><option value="needs_info">Additional Information Required</option><option value="rejected">Rejected</option></select></label>
      <label for="trackingSort">Sort<select id="trackingSort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </div>
<?php endif; ?>
    <p id="trackingResultCount" class="tracking-muted" hidden></p>
    <div id="trackingReportList" class="tracking-report-list" aria-busy="true"><div class="tracking-loading"><span class="tracking-spinner" aria-hidden="true"></span><p>Loading your tracking dashboard…</p></div></div>
  </section>
  <p class="interior-note">Only recorded actions appear as completed. Private administrator notes never appear in the resident timeline.</p>
</main>
<?php }
