<?php
declare(strict_types=1);
require __DIR__.'/app/bootstrap.php';
require_once __DIR__.'/app/community-seed.php';
header('X-Robots-Tag: noindex, nofollow');
$user = currentUser();
if (!$user || $user['role'] !== 'admin') {
    http_response_code(403);
    exit('Administrator login required. Please sign in on login.php with your admin account, then reopen update-directory.php.');
}
$status = '';
$error = '';
try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals(csrfToken(), (string)($_POST['csrf']??''))) throw new RuntimeException('Invalid security token. Refresh and try again.');
        $result=seedCommunityDirectory(db());
        $status='Directory updated. New verified-reference hotlines: '.$result['hotlines'].'. New preparedness topics: '.$result['tips'].'. Existing records and report data were preserved.';
    }
} catch (Throwable $e) {
    error_log('DIRMS directory update: '.$e->getMessage());
    $error='The update could not be completed. Make sure MySQL is running and try again.';
}
function viewEscape(string $str): string { return htmlspecialchars($str,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
?>
<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Update DIRMS Directory</title><link rel="stylesheet" href="assets/css/style.css"></head>
<body class="setup-page"><main class="setup-card"><h1>Update emergency contacts &amp; preparedness tips</h1>
<p>This administrator-only tool adds missing official-reference hotline numbers and disaster preparedness topics to your <strong>existing MySQL database</strong>. It does not delete your current reports, accounts, or custom entries.</p>
<?php if ($status): ?><p class="notice" role="status"><?=viewEscape($status)?></p><?php endif; ?>
<?php if ($error): ?><p class="notice danger" role="alert"><?=viewEscape($error)?></p><?php endif; ?>
<form method="post"><input type="hidden" name="csrf" value="<?=viewEscape(csrfToken())?>"><button class="btn btn-blue" type="submit">Add Missing Hotlines and Tips →</button></form>
<p class="fineprint">Numbers were checked against official agency pages in November 2026. Local authorities must periodically verify them. Do not use this directory as a substitute for emergency services.</p>
<a class="btn btn-outline" href="index.php">← Return to website</a></main></body></html>
