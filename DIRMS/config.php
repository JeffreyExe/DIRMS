<?php
/** Local configuration. Change these values for your XAMPP / MySQL installation. */
return [
    'db_host' => getenv('BS_DB_HOST') ?: '127.0.0.1',
    'db_port' => getenv('BS_DB_PORT') ?: '3306',
    'db_name' => getenv('BS_DB_NAME') ?: 'bantay_sakuna',
    'db_user' => getenv('BS_DB_USER') ?: 'root',
    'db_pass' => getenv('BS_DB_PASS') ?: '',
    'app_name' => 'DIRMS',
    'max_upload_bytes' => 5 * 1024 * 1024,
    // Keep this outside the web document root in production. Apache deny rules
    // protect the bundled default; Nginx requires the rule in README.md.
    'private_storage_path' => getenv('DIRMS_PRIVATE_STORAGE') ?: __DIR__ . '/storage/private',
];
