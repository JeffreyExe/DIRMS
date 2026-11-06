<?php
declare(strict_types=1);
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Cache-Control: no-store');
header('Referrer-Policy: same-origin');
$page = 'my-reports';
require __DIR__ . '/index.php';
