<?php
declare(strict_types=1);

/** Persistent per-IP/account limits survive cookies being cleared. No raw IPs or secrets are stored. */
function rateLimit(string $scope, int $limit, int $window, string $identity = ''): void {
    global $config;
    $dir = $config['private_storage_path'] . '/rate-limits';
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        fail('Security storage is unavailable. Please contact the administrator.', 503);
    }
    $subject = $identity !== '' ? $identity : (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $file = $dir . '/' . hash('sha256', __DIR__ . '|' . $scope . '|' . $subject) . '.json';
    $handle = fopen($file, 'c+');
    if (!$handle || !flock($handle, LOCK_EX)) fail('Please try again later.', 503);
    $now = time();
    $bucket = json_decode(stream_get_contents($handle) ?: '{}', true);
    if (!is_array($bucket) || (int)($bucket['until'] ?? 0) <= $now) $bucket = ['until' => $now + $window, 'count' => 0];
    if ((int)$bucket['count'] >= $limit) {
        $retry = max(1, (int)$bucket['until'] - $now);
        flock($handle, LOCK_UN); fclose($handle);
        header('Retry-After: ' . $retry);
        fail('Too many attempts. Please wait before trying again.', 429);
    }
    $bucket['count']++;
    rewind($handle); ftruncate($handle, 0);
    $encoded = json_encode($bucket, JSON_THROW_ON_ERROR);
    $written = fwrite($handle, $encoded);
    $flushed = fflush($handle);
    flock($handle, LOCK_UN); fclose($handle);
    if ($written !== strlen($encoded) || !$flushed) fail('Security storage is unavailable. Please try again later.', 503);
}

function authenticatedUser(): array {
    $user = currentUser();
    if (!$user) fail('Please sign in to continue.', 401);
    return $user;
}

function guestReportGranted(int $id): bool {
    $expiry = (int)($_SESSION['guest_reports'][$id] ?? 0);
    if ($expiry > time()) return true;
    unset($_SESSION['guest_reports'][$id]);
    return false;
}

function authorizedReport(int $id): array {
    $user = currentUser();
    if ($user) {
        try { return reportGetAuthorized($id, $user); }
        catch (TrackingException $e) {
            if (!guestReportGranted($id)) throw $e;
        }
    }
    if (guestReportGranted($id)) return reportGetForGuest($id);
    fail('Report not found or access is unavailable.', 404);
}

function versionedResponse(array $payload, string $versionField = 'version'): never {
    $version = hash('sha256', json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    if (hash_equals($version, (string)($_GET[$versionField] ?? ''))) {
        jsonResponse(['ok' => true, 'unchanged' => true, 'version' => $version]);
    }
    jsonResponse(['ok' => true, 'unchanged' => false, 'version' => $version] + $payload);
}

function saveIncidentPhoto(): ?string {
    global $config;
    if (!isset($_FILES['photo']) || ($_FILES['photo']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    $file = $_FILES['photo'];
    if (!is_int($file['error']) || $file['error'] !== UPLOAD_ERR_OK) fail('Photo upload failed. Choose an image smaller than 5 MB.');
    if (!is_uploaded_file($file['tmp_name']) || $file['size'] <= 0 || $file['size'] > $config['max_upload_bytes']) fail('Photo must be no larger than 5 MB.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $allowed = ['image/jpeg'=>'jpg', 'image/png'=>'png', 'image/webp'=>'webp'];
    $size = @getimagesize($file['tmp_name']);
    if (!isset($allowed[$mime]) || !$size || ($size['mime'] ?? '') !== $mime || $size[0] * $size[1] > 40000000) {
        fail('Choose a valid JPG, PNG or WebP image of at most 40 megapixels.');
    }
    $dir = $config['private_storage_path'] . '/evidence';
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) fail('Photo storage is unavailable.', 503);
    $name = bin2hex(random_bytes(24)) . '.' . $allowed[$mime];
    if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $name)) fail('Unable to save the image.', 503);
    chmod($dir . '/' . $name, 0600);
    return 'private:' . $name;
}

function incidentPhotoFile(string $storedPath): ?string {
    global $config;
    if (str_starts_with($storedPath, 'private:')) {
        $name = substr($storedPath, 8);
        if (!preg_match('/^[a-f0-9]{48}\.(?:jpg|png|webp)$/D', $name)) return null;
        return $config['private_storage_path'] . '/evidence/' . $name;
    }
    // Legacy photos stay usable through authenticated access. Direct HTTP access
    // to uploads/ is denied by both Apache rules and the development router.
    if (!preg_match('~^uploads/[a-f0-9]{32}\.(?:jpg|png|webp)$~D', $storedPath)) return null;
    return dirname(__DIR__) . '/' . $storedPath;
}

function serveIncidentPhoto(int $id): never {
    authorizedReport($id);
    $q = db()->prepare('SELECT photo_path FROM incident_reports WHERE id=?');
    $q->execute([$id]);
    $path = incidentPhotoFile((string)$q->fetchColumn());
    if (!$path || !is_file($path)) fail('Photo not found.', 404);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
    if (!in_array($mime, ['image/jpeg','image/png','image/webp'], true)) fail('Photo not found.', 404);
    header('Content-Type: ' . $mime);
    header('Content-Disposition: inline; filename="incident-evidence.' . ($mime === 'image/jpeg' ? 'jpg' : substr($mime, 6)) . '"');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: no-store, private');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    session_write_close();
    readfile($path);
    exit;
}

function isoPublicDates(array $records): array {
    foreach ($records as &$record) {
        foreach (['created_at','updated_at','expires_at'] as $field) {
            if (!empty($record[$field])) $record[$field] = (new DateTimeImmutable((string)$record[$field], new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z');
        }
    }
    return $records;
}
