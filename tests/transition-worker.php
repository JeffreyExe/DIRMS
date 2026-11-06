<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || getenv('DIRMS_TEST_ALLOW_RESET') !== '1') exit(2);
require __DIR__ . '/../DIRMS/app/bootstrap.php';
require __DIR__ . '/../DIRMS/app/tracking.php';
if (!preg_match('/^[A-Za-z0-9_]+_test$/D', $config['db_name'])) exit(2);
echo "ready\n";
flush();
try {
    reportTransition((int)($argv[1]??0), ['id'=>2,'role'=>'admin'], (int)($argv[2]??0), 'received');
    echo "saved\n";
} catch (TrackingException $e) {
    echo $e->httpStatus===409 ? "conflict\n" : "unexpected\n";
} catch (Throwable) {
    echo "unexpected\n";
}
