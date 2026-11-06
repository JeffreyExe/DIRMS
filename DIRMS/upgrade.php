<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';
require_once __DIR__ . '/app/migrations.php';
if (PHP_SAPI === 'cli') {
    if (!in_array('--apply', $argv, true)) {
        fwrite(STDERR, "Back up the database and uploads first. Apply with: php upgrade.php --apply\n");
        exit(1);
    }
    try {
        $changed = dirmsMigrate(db());
        fwrite(STDOUT, $changed ? "DIRMS tracking upgrade applied. Existing accounts, BS references and report data retained.\n" : "DIRMS database is already up to date.\n");
        exit(0);
    } catch (Throwable $e) {
        fwrite(STDERR, 'Upgrade failed: ' . $e->getMessage() . "\nNo existing records were deleted. Resolve the error and rerun this idempotent upgrade.\n");
        exit(1);
    }
}
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
try { $user = currentUser(); }
catch (PDOException $e) {
    http_response_code(503);
    exit('Database is unavailable. Check MySQL and config.php, then reopen the upgrade page.');
}
if (!$user || $user['role'] !== 'admin') {
    http_response_code(403);
    exit('Sign in as an administrator before opening this database upgrade page.');
}
$message = '';
$failed = false;
try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        if (!hash_equals(csrfToken(), (string)($_POST['csrf'] ?? ''))) throw new RuntimeException('Security token expired. Refresh this page and try again.');
        if (($_POST['backup_confirmed'] ?? '') !== 'yes') throw new RuntimeException('Confirm that you have backed up the database and uploads.');
        $message = dirmsMigrate(db()) ? 'Upgrade complete. Existing accounts, reports and historical BS references are preserved.' : 'The database is already up to date.';
    }
    $ready = dirmsSchemaReady(db());
} catch (Throwable $e) {
    error_log('DIRMS upgrade failed: ' . $e->getMessage());
    $message = 'The upgrade could not finish. Check the server log, fix the database permissions or connection, and rerun this page. No existing records were deleted.';
    $failed = true;
    $ready = false;
}
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Database upgrade — DIRMS</title><link rel="stylesheet" href="assets/css/style.css"></head><body class="setup-page"><main class="setup-card"><span class="eyebrow">DIRMS 1.0</span><h1>Upgrade report tracking</h1>
<?php if ($message): ?><p class="notice <?= $failed ? 'danger' : 'success' ?>" role="status"><?= htmlspecialchars($message,ENT_QUOTES) ?></p><?php endif; ?>
<?php if ($ready): ?><p>The report tracking database is ready.</p><a class="btn btn-primary" href="admin.php">Open administration</a>
<?php else: ?><p>First export your existing MySQL database and copy your uploads and configuration to a safe backup. This additive upgrade preserves residents, passwords, incident reports, original submission times and existing BS reference numbers.</p><p>Earlier administrative actions were not historically recorded. The upgrade records each known original submission without inventing administrative timestamps. Existing guest reports cannot gain a tracking secret retrospectively.</p><form method="post" class="form-stack"><input type="hidden" name="csrf" value="<?= htmlspecialchars(csrfToken(),ENT_QUOTES) ?>"><label><input type="checkbox" name="backup_confirmed" value="yes" required> I have backed up the database and uploads.</label><button type="submit" class="btn btn-primary">Apply tracking upgrade</button></form><?php endif; ?></main></body></html>
