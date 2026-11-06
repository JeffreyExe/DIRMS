<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';
require_once __DIR__ . '/app/community-seed.php';
header('X-Robots-Tag: noindex, nofollow');
$message = '';
$complete = false;
// The initial setup must be performed on the same computer hosting XAMPP.
$isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
if (!$isLocal) { http_response_code(403); exit('For security, first-time setup is available from localhost only.'); }
try {
    $server = db(false);
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $config['db_name'])) throw new RuntimeException('Invalid database name in config.php');
    $server->exec('CREATE DATABASE IF NOT EXISTS `' . $config['db_name'] . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $database = db();
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    // One CREATE TABLE per statement; comments are stripped from the beginning.
    foreach (preg_split('/;\s*(?:\r?\n|$)/', (string)$sql) as $statement) {
        $statement = preg_replace('/^\s*(?:--[^\n]*\n\s*)+/', '', $statement);
        if (trim($statement) !== '') $database->exec($statement);
    }
    $existingAdmins = (int)$database->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn();
    if ($existingAdmins > 0) $complete = true;
    elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals(csrfToken(), (string)($_POST['csrf'] ?? ''))) throw new RuntimeException('Invalid security token.');
        $name = cleanText($_POST['full_name'] ?? '', 120);
        $email = strtolower(cleanText($_POST['email'] ?? '', 190));
        $password = (string)($_POST['password'] ?? '');
        if (mb_strlen($name) < 2) throw new RuntimeException('Enter your full name.');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Enter a valid email address.');
        if (strlen($password) < 12) throw new RuntimeException('Choose a password with at least 12 characters.');
        $q = $database->prepare("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')");
        $q->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
        // These are explicitly labeled sample data, not live emergency guidance.
        $database->exec("INSERT INTO alerts (title,alert_type,severity,location,description,instructions,is_demo) VALUES
        ('Demo: Flood Preparedness Notice','Flood','high','San Pablo City','Sample alert only. This is not a live flood warning.','Monitor official local government advisories and prepare essential supplies.',1),
        ('Demo: Strong Wind Advisory','Strong Winds','medium','San Pablo City','Sample advisory for demonstrating the alert system.','Secure loose objects and monitor official weather reports.',1),
        ('Demo: Heavy Rainfall Notice','Heavy Rainfall','extreme','San Pablo City','Sample rainfall notice; no actual weather condition is being claimed.','Check verified PAGASA and local disaster office information.',1)");
        $database->exec("INSERT INTO evacuation_centers (name,barangay,address,capacity,occupancy,notes,is_demo) VALUES
        ('San Jose Covered Court','San Jose','Brgy. San Jose, San Pablo City, Laguna',300,0,'Demo only. Availability is not verified.',1),
        ('City Gymnasium','San Antonio','Brgy. San Antonio, San Pablo City, Laguna',500,500,'Demo only. Occupancy is fictitious.',1),
        ('Barangay Hall','San Miguel','Brgy. San Miguel, San Pablo City, Laguna',100,0,'Demo only. Verify official designation before travel.',1)");
        seedCommunityDirectory($database);
        $database->exec("INSERT INTO news (title,summary,is_demo) VALUES
        ('Demo: Community Preparedness Update','Sample news article to demonstrate the disaster news feature. Replace this in the administrator dashboard with a verified update.',1)");
        $defaults = [
            'site_name' => 'DIRMS',
            'city' => 'San Pablo City, Laguna',
            'contact_email' => '',
            'safety_banner' => 'Demonstration website: sample alerts and evacuation centers are NOT real-time or verified. Check official sources before taking action.'
        ];
        $q = $database->prepare('INSERT IGNORE INTO site_settings(setting_key,setting_value) VALUES(?,?)');
        foreach ($defaults as $k=>$v) $q->execute([$k,$v]);
        $complete = true;
    }
} catch (Throwable $e) {
    $message = $e->getMessage();
}
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up DIRMS</title><link rel="stylesheet" href="assets/css/style.css"></head>
<body class="setup-page"><main class="setup-card"><div class="brand"><span class="brand-mark">✦</span><span><strong>BANTAY <em>SAKUNA</em></strong><small>INSTALLATION</small></span></div>
<h1><?= $complete ? 'Installation complete' : 'Create your administrator account' ?></h1>
<?php if ($message): ?><p class="notice danger"><?= htmlspecialchars($message,ENT_QUOTES) ?></p><?php endif; ?>
<?php if ($complete): ?><p>Your database and administrator account are ready. Sign in to manage your website.</p><a class="btn btn-primary" href="index.php">Open DIRMS →</a><p class="fineprint">For security, delete or restrict setup.php after installation.</p>
<?php else: ?><p>This one-time setup creates the MySQL tables, a secure administrator account and clearly labeled example entries.</p><form method="post" class="form-stack"><input type="hidden" name="csrf" value="<?= htmlspecialchars(csrfToken(),ENT_QUOTES) ?>"><label>Full Name<input name="full_name" required minlength="2" maxlength="120" placeholder="Administrator name"></label><label>Email<input type="email" name="email" required placeholder="admin@example.com"></label><label>Password (12+ characters)<input type="password" name="password" required minlength="12" placeholder="Choose a secure password"></label><button class="btn btn-primary" type="submit">Create Admin & Install</button></form><p class="fineprint">Start Apache and MySQL in XAMPP first. If MySQL connection fails, edit config.php.</p><?php endif; ?></main></body></html>
