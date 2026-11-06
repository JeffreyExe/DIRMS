<?php
declare(strict_types=1);

/** Preserve a normal XAMPP/system php.ini, including its required extensions. */
function testPhpCommand(): array {
    $command = [PHP_BINARY];
    $ini = php_ini_loaded_file();
    if ($ini) {
        return [...$command, '-c', $ini];
    }
    // The disposable cloud runtime has built-in required extensions except PDO
    // MySQL and intentionally runs without an ini. Retain that CLI-only setup.
    return [...$command, '-n', '-d', 'extension_dir='.ini_get('extension_dir'), '-d', 'extension=pdo_mysql'];
}
