<?php
// Local PHP development server only: php -S 127.0.0.1:8080 -t DIRMS DIRMS/router.php
declare(strict_types=1);
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
if (preg_match('~(?:^|/)(?:storage|uploads|app|tests|docs|\.[^/]*)(?:/|$)~i', $path)
    || preg_match('~(?:config\.php|schema\.sql|router\.php|\.log)$~i', $path)
    || str_contains($path, '..')) {
    http_response_code(404);
    exit('Not found.');
}
return false;
