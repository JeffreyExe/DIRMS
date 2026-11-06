<?php
declare(strict_types=1);

date_default_timezone_set('UTC');
require_once __DIR__ . '/security-headers.php';
securityHeaders();

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('DIRMSSESSID');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        ini_set('session.cookie_secure', '1');
    }
    session_start();
}

$config = require dirname(__DIR__) . '/config.php';

function db(bool $withDatabase = true): PDO {
    global $config;
    static $instances = [];
    $key = $withDatabase ? 'application' : 'server';
    if (isset($instances[$key])) return $instances[$key];
    $dsn = 'mysql:host=' . $config['db_host'] . ';port=' . $config['db_port'] .
           ($withDatabase ? ';dbname=' . $config['db_name'] : '') . ';charset=utf8mb4';
    $instances[$key] = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $instances[$key]->exec("SET time_zone = '+00:00'");
    return $instances[$key];
}

function jsonResponse(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $message, int $status = 400): never {
    jsonResponse(['ok' => false, 'message' => $message], $status);
}
function csrfToken(): string {
    if (!isset($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}
function requireCsrf(): void {
    $received = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf'] ?? '');
    if (!hash_equals(csrfToken(), $received)) fail('Security token expired. Refresh the page and try again.', 419);
}
function requestData(): array {
    $type = (string)($_SERVER['CONTENT_TYPE'] ?? '');
    if (str_contains($type, 'application/json')) {
        $json = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($json)) fail('Invalid JSON request.');
        return $json;
    }
    return $_POST;
}
function cleanText(mixed $value, int $max = 255): string {
    if (!is_string($value) && !is_numeric($value)) return '';
    $s = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string)$value) ?? '');
    return mb_substr($s, 0, $max);
}
function requiredText(array $data, string $key, int $max = 255): string {
    $s = cleanText($data[$key] ?? '', $max);
    if ($s === '') fail(ucwords(str_replace('_',' ',$key)) . ' is required.');
    return $s;
}
function currentUser(): ?array {
    if (empty($_SESSION['user_id'])) return null;
    $stmt = db()->prepare('SELECT id, full_name, email, phone, role, is_active FROM users WHERE id = ?');
    $stmt->execute([(int)$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user || !(int)$user['is_active']) { unset($_SESSION['user_id']); return null; }
    return $user;
}
function requireAdmin(): array {
    $user = currentUser();
    if (!$user) fail('Please log in as an administrator.', 401);
    if ($user['role'] !== 'admin') fail('Administrator access required.', 403);
    return $user;
}
function adminLog(array $user, string $action, string $type, ?int $id = null): void {
    $stmt = db()->prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)');
    $stmt->execute([(int)$user['id'], $action, $type, $id]);
}
function selectAll(string $table, string $where = '1=1', string $order = 'id DESC'): array {
    // Only internal fixed identifiers may be passed to this helper.
    return db()->query("SELECT * FROM `$table` WHERE $where ORDER BY $order")->fetchAll();
}
function boolValue(mixed $v): int { return filter_var($v, FILTER_VALIDATE_BOOLEAN) ? 1 : 0; }
function intRange(mixed $v, int $min, int $max, string $label): int {
    if (filter_var($v, FILTER_VALIDATE_INT) === false) fail("$label must be a whole number.");
    $n = (int)$v;
    if ($n < $min || $n > $max) fail("$label must be between $min and $max.");
    return $n;
}
function maybeDecimal(mixed $v, float $min, float $max, string $name): ?float {
    if ($v === '' || $v === null) return null;
    if (!is_numeric($v) || (float)$v < $min || (float)$v > $max) fail("Invalid $name.");
    return (float)$v;
}
