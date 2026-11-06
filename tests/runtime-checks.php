<?php
declare(strict_types=1);
// Optional local process checks: actual first-time setup and unavailable DB.
if (PHP_SAPI!=='cli' || getenv('DIRMS_TEST_ALLOW_RESET')!=='1') exit("CLI and DIRMS_TEST_ALLOW_RESET=1 required.\n");
require __DIR__.'/../DIRMS/app/bootstrap.php';
require __DIR__.'/php-process.php';
if (!preg_match('/^[A-Za-z0-9_]+_test$/D',$config['db_name'])) exit("A disposable *_test database is required.\n");
$setupDb = substr($config['db_name'],0,-5).'_setup_test';
$pdo = db(false);
$count = 0;
function runtimeCheck(bool $ok,string $label): void {
    global $count;
    if (!$ok) throw new RuntimeException('FAILED: '.$label);
    $count++; echo 'PASS '.$label."\n";
}
function launchTestServer(array $overrides): array {
    $root = dirname(__DIR__);
    $port = random_int(18000,25000);
    $log = tempnam(sys_get_temp_dir(),'dirms-qa-log-');
    $cmd = [...testPhpCommand(),'-S','127.0.0.1:'.$port,'-t',$root.'/DIRMS',$root.'/DIRMS/router.php'];
    $process = proc_open($cmd,[0=>['pipe','r'],1=>['file',$log,'a'],2=>['file',$log,'a']],$pipes,$root,array_merge(getenv(),$overrides));
    if (!is_resource($process)) throw new RuntimeException('Unable to start local PHP test server');
    fclose($pipes[0]);
    for($i=0;$i<40;$i++) {
        $socket = @stream_socket_client('tcp://127.0.0.1:'.$port,$code,$message,0.1);
        if($socket) { fclose($socket); return [$process,'http://127.0.0.1:'.$port,$log]; }
        usleep(100000);
    }
    proc_terminate($process); proc_close($process); @unlink($log);
    throw new RuntimeException('Local PHP test server did not become ready');
}
function runtimeRequest(string $url,?array $post=null,string $cookie=''): array {
    $context = stream_context_create(['http'=>['method'=>$post===null?'GET':'POST','header'=>"Content-Type: application/x-www-form-urlencoded\r\nCookie: ".$cookie,'content'=>$post===null?'':http_build_query($post),'ignore_errors'=>true,'follow_location'=>0,'timeout'=>8]]);
    $body = file_get_contents($url,false,$context);
    preg_match('/\s(\d{3})\s/',($http_response_header??[])[0]??'',$match);
    return ['status'=>(int)($match[1]??0),'body'=>(string)$body,'headers'=>$http_response_header??[]];
}
$servers = [];
try {
    // This database is derived exclusively from the explicitly disposable name.
    $pdo->exec('DROP DATABASE IF EXISTS `'.$setupDb.'`');
    $pdo->exec('CREATE DATABASE `'.$setupDb.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $setupPdo = new PDO('mysql:host='.$config['db_host'].';port='.$config['db_port'].';dbname='.$setupDb.';charset=utf8mb4',$config['db_user'],$config['db_pass'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $server = launchTestServer(['BS_DB_NAME'=>$setupDb]); $servers[]=$server;
    $get = runtimeRequest($server[1].'/setup.php');
    runtimeCheck($get['status']===200 && str_contains($get['body'],'Create your administrator account'),'Fresh setup GET renders installer');
    runtimeCheck(count($setupPdo->query('SHOW TABLES')->fetchAll())===0,'Fresh setup GET performs no schema writes');
    preg_match('/name="csrf" value="([a-f0-9]+)"/',$get['body'],$match);
    $csrf = $match[1]??'';
    $cookie = '';
    foreach($get['headers'] as $header) if(preg_match('/^Set-Cookie:\s*([^;]+)/i',$header,$m)) $cookie=$m[1];
    $post = ['csrf'=>$csrf,'full_name'=>'Installation QA Admin','email'=>'install@example.test','password'=>'Local-setup-password-2026!'];
    $installed = runtimeRequest($server[1].'/setup.php',$post,$cookie);
    runtimeCheck($installed['status']===200 && str_contains($installed['body'],'Installation complete'),'Fresh setup POST installs schema and administrator');
    runtimeCheck((int)$setupPdo->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn()===1,'Fresh setup creates exactly one administrator');
    runtimeCheck(password_verify($post['password'],(string)$setupPdo->query("SELECT password_hash FROM users WHERE email='install@example.test'")->fetchColumn()),'Fresh administrator password is securely hashed');
    runtimeCheck((int)$setupPdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn()===2,'Fresh setup applies both incremental schema migrations');
    runtimeCheck((int)$setupPdo->query('SELECT COUNT(*) FROM alerts WHERE is_demo=0')->fetchColumn()===0 && (int)$setupPdo->query('SELECT COUNT(*) FROM evacuation_centers WHERE is_demo=0')->fetchColumn()===0,'Seeded alerts and shelters remain demo records');
    runtimeRequest($server[1].'/setup.php',$post,$cookie);
    runtimeCheck((int)$setupPdo->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn()===1 && (int)$setupPdo->query('SELECT COUNT(*) FROM alerts')->fetchColumn()===3,'Repeated fresh-install POST does not duplicate accounts or seeds');
    $failure = launchTestServer(['BS_DB_PORT'=>'9']); $servers[]=$failure;
    $unavailable = runtimeRequest($failure[1].'/api.php?action=bootstrap');
    $json = json_decode($unavailable['body'],true);
    runtimeCheck($unavailable['status']===503 && ($json['ok']??true)===false && str_contains($json['message']??'','Database is unavailable'),'Unavailable database returns understandable HTTP 503 JSON');
    runtimeCheck(!str_contains($unavailable['body'],'SQLSTATE') && !str_contains($unavailable['body'],$config['db_name']),'Database failure response omits internal connection details');
    echo "\n$count runtime assertions passed.\n";
} catch(Throwable $e) {
    fwrite(STDERR,$e->getMessage()."\n");
    $failed = true;
} finally {
    foreach($servers as [$process,$url,$log]) { proc_terminate($process); proc_close($process); @unlink($log); }
}
if (!empty($failed)) exit(1);
