<?php
declare(strict_types=1);

// Destructive only to an explicitly selected disposable *_test database.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (getenv('DIRMS_TEST_ALLOW_RESET') !== '1') exit("Set DIRMS_TEST_ALLOW_RESET=1 for a disposable test database.\n");
require __DIR__ . '/../DIRMS/app/bootstrap.php';
require __DIR__ . '/../DIRMS/app/tracking.php';
require __DIR__ . '/php-process.php';
if (!preg_match('/^[A-Za-z0-9_]+_test$/D', $config['db_name'])) exit("Refusing to reset a database whose name does not end in _test.\n");
$base = rtrim(getenv('DIRMS_TEST_URL') ?: 'http://127.0.0.1:8080', '/');
if (!in_array(parse_url($base, PHP_URL_HOST), ['127.0.0.1','localhost','::1'], true)) exit("Test server URL must be local.\n");
$pdo = db();
$passed = 0;
function check(bool $condition, string $description): void {
    global $passed;
    if (!$condition) throw new RuntimeException('FAILED: ' . $description);
    $passed++;
    echo 'PASS ' . $description . "\n";
}
function sql(string $query, array $params = []): PDOStatement {
    global $pdo;
    $s = $pdo->prepare($query); $s->execute($params); return $s;
}
final class TestClient {
    private array $cookies = [];
    public string $csrf = '';
    public function call(string $action, string $method = 'GET', array $data = [], array $files = [], bool $csrf = true): array {
        global $base;
        $headers = ['Accept: application/json'];
        if ($this->cookies) $headers[] = 'Cookie: ' . implode('; ', array_map(static fn($k,$v)=>$k.'='.$v, array_keys($this->cookies), $this->cookies));
        if ($csrf && $this->csrf !== '') $headers[] = 'X-CSRF-Token: ' . $this->csrf;
        $content = '';
        if ($method === 'POST') {
            if ($files) {
                $boundary = 'dirmsqa' . bin2hex(random_bytes(12));
                $headers[] = 'Content-Type: multipart/form-data; boundary=' . $boundary;
                foreach ($data as $key => $value) $content .= '--'.$boundary."\r\nContent-Disposition: form-data; name=\"$key\"\r\n\r\n".$value."\r\n";
                foreach ($files as $key => [$name,$mime,$bytes]) $content .= '--'.$boundary."\r\nContent-Disposition: form-data; name=\"$key\"; filename=\"$name\"\r\nContent-Type: $mime\r\n\r\n".$bytes."\r\n";
                $content .= '--'.$boundary."--\r\n";
            } else {
                $headers[] = 'Content-Type: application/json';
                $content = json_encode($data, JSON_THROW_ON_ERROR);
            }
        }
        $context = stream_context_create(['http'=>['method'=>$method,'header'=>implode("\r\n",$headers),'content'=>$content,'ignore_errors'=>true,'timeout'=>15,'follow_location'=>0]]);
        $body = file_get_contents($base.'/api.php?action='.$action, false, $context);
        $responseHeaders = $http_response_header ?? [];
        preg_match('/\s(\d{3})\s/', $responseHeaders[0] ?? '', $match);
        foreach ($responseHeaders as $header) if (preg_match('/^Set-Cookie:\s*([^=;]+)=([^;]*)/i',$header,$m)) $this->cookies[$m[1]]=$m[2];
        $json = json_decode((string)$body, true);
        if (isset($json['csrf'])) $this->csrf = $json['csrf'];
        return ['status'=>(int)($match[1]??0),'json'=>$json,'body'=>(string)$body,'headers'=>$responseHeaders];
    }
    public function bootstrap(): array { return $this->call('bootstrap'); }
    public function post(string $action,array $data,array $files=[]): array { return $this->call($action,'POST',$data,$files); }
    public function page(string $path, ?array $data=null): array {
        global $base;
        $cookies = implode('; ',array_map(static fn($k,$v)=>$k.'='.$v,array_keys($this->cookies),$this->cookies));
        $context = stream_context_create(['http'=>['method'=>$data===null?'GET':'POST','header'=>"Content-Type: application/x-www-form-urlencoded\r\nCookie: ".$cookies,'content'=>$data===null?'':http_build_query($data),'ignore_errors'=>true,'follow_location'=>0,'timeout'=>10]]);
        $body = file_get_contents($base.$path,false,$context);
        preg_match('/\s(\d{3})\s/',($http_response_header??[])[0]??'',$match);
        return ['status'=>(int)($match[1]??0),'headers'=>$http_response_header??[],'body'=>(string)$body];
    }
}
function success(array $response, string $description): array {
    check($response['status']===200 && ($response['json']['ok']??false)===true, $description . ' (HTTP ' . $response['status'] . ')');
    return $response['json'];
}
function denied(array $response, array $statuses, string $description): void {
    check(in_array($response['status'],$statuses,true) && ($response['json']['ok']??true)===false, $description);
}
function transition(TestClient $admin,array $report,string $status,string $public='',string $private='',bool $reopen=false): array {
    return success($admin->post('report_status',['id'=>$report['id'],'version'=>$report['version'],'status'=>$status,'public_note'=>$public,'internal_note'=>$private,'event_type'=>$reopen?'reopen':'status_change']), 'Admin transition to '.$status)['report'];
}

try {
    // Original checked-in schema, not the new schema: exercises a real upgrade.
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) $pdo->exec('DROP TABLE `'.str_replace('`','``',$table).'`');
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    $schema = file_get_contents(__DIR__.'/fixtures/legacy-schema.sql');
    foreach (preg_split('/;\s*(?:\r?\n|$)/',(string)$schema) as $statement) if (trim($statement)!=='') $pdo->exec($statement);
    $password = 'Local-QA-password-2026!';
    $hash = password_hash($password,PASSWORD_DEFAULT);
    sql("INSERT INTO users(id,full_name,email,password_hash,role) VALUES(1,'Legacy Resident','legacy@example.test',?,'resident'),(2,'Test Administrator','admin@example.test',?,'admin')",[$hash,$hash]);
    sql("INSERT INTO incident_reports(id,user_id,incident_type,location,description,status,admin_notes,created_at,updated_at) VALUES(125,1,'Flood','Legacy test location','Existing resident record to preserve','reviewing','Private legacy admin note','2020-01-02 03:04:05','2020-01-03 04:05:06'),(126,NULL,'Fire','Legacy guest location','Existing guest without tracking secret','resolved',NULL,'2020-02-02 03:04:05','2020-02-03 04:05:06')");
    sql("INSERT INTO evacuation_centers(id,name,barangay,address,capacity,occupancy,is_demo) VALUES(1,'Legacy Demo Center','Test','Test address',100,0,1)");
    check(dirmsMigrate($pdo)===true,'Original schema upgrades additively');
    check(dirmsMigrate($pdo)===false,'Repeated migration is idempotent');
    check(sql('SELECT updated_at FROM evacuation_centers WHERE id=1')->fetchColumn()===null,'Legacy center does not receive an invented last-edit timestamp');
    sql('DELETE FROM schema_migrations WHERE version=?',[DIRMS_SCHEMA_VERSION]);
    sql('ALTER TABLE evacuation_centers DROP COLUMN updated_at');
    check(dirmsMigrate($pdo)===true && sql('SELECT updated_at FROM evacuation_centers WHERE id=1')->fetchColumn()===null,'Tracking v1 installation upgrades independently to center activity v2');
    check((int)sql('SELECT COUNT(*) FROM report_status_history')->fetchColumn()===2,'Second migration preserves prior immutable history');
    check((int)sql('SELECT COUNT(*) FROM incident_reports')->fetchColumn()===2,'Upgrade preserves all reports');
    $legacy = sql('SELECT * FROM incident_reports WHERE id=125')->fetch();
    check($legacy['reference']==='BS-000125' && $legacy['status']==='reviewing','Original BS reference and current status preserved');
    check($legacy['created_at']==='2020-01-02 03:04:05' && $legacy['updated_at']==='2020-01-03 04:05:06','Upgrade preserves original timestamps');
    $history = sql('SELECT * FROM report_status_history WHERE report_id=125')->fetchAll();
    check(count($history)===1 && $history[0]['event_type']==='legacy_submission' && strtotime($history[0]['created_at'])===strtotime($legacy['created_at']) && $history[0]['new_status']==='pending','Backfill records only known submission, no invented administrator actions');
    check(password_verify($password,(string)sql('SELECT password_hash FROM users WHERE id=1')->fetchColumn()),'Existing account password retained');
    try { sql("UPDATE report_status_history SET public_note='altered' WHERE report_id=125"); check(false,'Immutable history update blocked'); } catch(PDOException) { check(true,'Immutable history update blocked'); }
    try { sql('DELETE FROM report_status_history WHERE report_id=125'); check(false,'Immutable history deletion blocked'); } catch(PDOException) { check(true,'Immutable history deletion blocked'); }

    $anonymous = new TestClient();
    success($anonymous->bootstrap(),'Public bootstrap');
    denied($anonymous->call('my_reports'),[401],'Anonymous cannot list resident reports');
    denied($anonymous->call('admin_data'),[401,403],'Anonymous cannot access admin data');
    denied($anonymous->call('login','POST',['email'=>'admin@example.test','password'=>$password],[],false),[419],'State change requires CSRF token');
    $legacyClient = new TestClient(); success($legacyClient->bootstrap(),'Legacy resident bootstrap');
    success($legacyClient->post('login',['email'=>'legacy@example.test','password'=>$password]),'Existing resident can still log in');
    $old = success($legacyClient->call('report_details&id=125'),'Owner can read legacy BS report')['report'];
    check($old['reference']==='BS-000125' && $old['legacy_history_incomplete']===true,'Legacy tracking discloses incomplete historical progression');
    check(!str_contains(json_encode($old),'Private legacy admin note'),'Legacy internal notes are private');
    $admin = new TestClient(); success($admin->bootstrap(),'Admin bootstrap');
    success($admin->post('login',['email'=>'admin@example.test','password'=>$password]),'Administrator logs in');
    $setupBefore = $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn().':'.$pdo->query('SELECT COUNT(*) FROM alerts')->fetchColumn().':'.$pdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn();
    $setupGet = $admin->page('/setup.php');
    check(str_contains($setupGet['body'],'Installation complete'),'Established installation setup GET shows existing setup');
    $setupPost = $admin->page('/setup.php',['csrf'=>$admin->csrf,'full_name'=>'Never Create Admin','email'=>'never-create@example.test','password'=>$password]);
    check(str_contains($setupPost['body'],'Installation complete') && (int)sql("SELECT COUNT(*) FROM users WHERE email='never-create@example.test'")->fetchColumn()===0,'Repeated setup POST cannot create another administrator');
    $setupAfter = $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn().':'.$pdo->query('SELECT COUNT(*) FROM alerts')->fetchColumn().':'.$pdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn();
    check($setupBefore===$setupAfter,'Established setup GET and POST preserve database and seed counts');
    $resident = new TestClient(); success($resident->bootstrap(),'Resident bootstrap');
    success($resident->post('register',['full_name'=>'New Resident','email'=>'resident@example.test','phone'=>'','password'=>$password]),'Register resident');
    $duplicate = new TestClient(); success($duplicate->bootstrap(),'Second session bootstrap');
    denied($duplicate->post('register',['full_name'=>'Duplicate','email'=>'resident@example.test','password'=>$password]),[400,409],'Duplicate email prevented');
    $other = new TestClient(); success($other->bootstrap(),'Other resident bootstrap');
    success($other->post('register',['full_name'=>'Other Resident','email'=>'other@example.test','password'=>$password]),'Register different resident');
    $data = ['incident_type'=>'Flood','location'=>'QA test location, San Pablo City','description'=>'Non-emergency automated test report.','submission_key'=>bin2hex(random_bytes(16))];
    denied($resident->post('report',array_replace($data,['description'=>'tiny'])),[400],'Short incident description rejected');
    denied($resident->post('report',$data,['photo'=>['bad.php','image/png','<?php echo "invalid";']]),[400],'Disguised executable upload rejected');
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lYQAAAAASUVORK5CYII=');
    denied($resident->post('report',$data,['photo'=>['too-large.png','image/png',$png.str_repeat('x',5*1024*1024)]]),[400],'Image larger than 5 MB is rejected');
    $receipt = success($resident->post('report',$data,['photo'=>['evidence.png','image/png',$png]]),'Resident submits flood report with image');
    $report = $receipt['report']; $id = (int)$report['id'];
    check(str_starts_with($receipt['reference'],'DIRMS-') && $report['status']==='pending' && count($report['history'])===1,'Submission creates DIRMS receipt and pending-only history');
    check(($receipt['tracking_code']??null)===null,'Registered owner uses session rather than a guest tracking secret');
    $retry = $resident->post('report',$data,['photo'=>['evidence.png','image/png',$png]]);
    check(in_array($retry['status'],[200,409],true) && (int)sql('SELECT COUNT(*) FROM incident_reports WHERE user_id=?',[$report['history'][0]['changed_by_user_id']??3])->fetchColumn()===1,'Repeated submission key cannot duplicate report');
    $list = success($resident->call('my_reports'),'Resident My Reports');
    check(count($list['reports'])===1 && $list['reports'][0]['id']===$id,'My Reports contains only own reports');
    check(str_contains(strtolower(implode(' ',$resident->call('my_reports')['headers'])),'no-store'),'Sensitive report API prevents caching');
    if (isset($list['version'])) check(success($resident->call('my_reports&version='.rawurlencode((string)$list['version'])),'Conditional report poll')['unchanged']===true,'Unchanged poll avoids resending report data');
    denied($other->call('report_details&id='.$id),[403,404],'Different resident cannot read report');
    denied($other->call('report_history&id='.$id),[403,404],'Different resident cannot read report history');
    denied($anonymous->call('report_details&id='.$id),[401,403,404],'Anonymous cannot read registered report');
    denied($resident->post('report_status',['id'=>$id,'version'=>1,'status'=>'received']),[403],'Resident cannot change administrative status');
    $photo = $resident->call('report_photo&id='.$id);
    check($photo['status']===200 && str_starts_with($photo['body'],"\x89PNG"),'Owner can read protected evidence');
    denied($other->call('report_photo&id='.$id),[403,404],'Other resident cannot read evidence');
    $path = (string)sql('SELECT photo_path FROM incident_reports WHERE id=?',[$id])->fetchColumn();
    $direct = @file_get_contents($base.'/'.ltrim($path,'/'),false,stream_context_create(['http'=>['ignore_errors'=>true]]));
    check(!str_starts_with((string)$direct,"\x89PNG"),'Direct evidence storage URL is blocked');
    $before = (int)sql('SELECT COUNT(*) FROM report_status_history WHERE report_id=?',[$id])->fetchColumn();
    denied($admin->post('report_status',['id'=>$id,'version'=>1,'status'=>'resolved','public_note'=>'Cannot skip all stages.']),[400,409],'Invalid status transition rejected');
    check((int)sql('SELECT COUNT(*) FROM report_status_history WHERE report_id=?',[$id])->fetchColumn()===$before,'Rejected transition leaves history unchanged');
    $report = transition($admin,$report,'received');
    denied($admin->post('report_status',['id'=>$id,'version'=>1,'status'=>'received']),[409],'Repeated/stale status save does not duplicate event');
    $report = transition($admin,$report,'reviewing');
    $report = success($admin->post('report_add_public_update',['id'=>$id,'version'=>$report['version'],'public_note'=>'Review evidence received.','internal_note'=>'Private QA review note.']),'Admin saves public review note')['report'];
    check(end($report['history'])['event_type']==='public_update','Public note does not create a false progress milestone');
    $public = success($resident->call('report_details&id='.$id),'Resident refreshes tracking after admin review')['report'];
    check($public['status']==='reviewing' && $public['public_note']==='Review evidence received.','Resident sees updated status and public note without reauthentication');
    check(!str_contains(json_encode($public),'Private QA review note.') && !array_key_exists('admin_notes',$public) && !array_key_exists('internal_note',$public['history'][0]),'Resident payload never exposes internal notes');
    $report = transition($admin,$report,'in_progress','QA follow-up action is now underway.');
    denied($admin->post('report_status',['id'=>$id,'version'=>$report['version'],'status'=>'resolved']),[400],'Resolution requires a public summary');
    $report = transition($admin,$report,'resolved','QA outcome recorded; test case closed.');
    $final = success($resident->call('report_details&id='.$id),'Resident reads resolution')['report'];
    check($final['status']==='resolved' && count(array_filter($final['history'],static fn($e)=>in_array($e['event_type'],['submitted','status_change'],true)))===5,'Complete workflow contains five actual milestones');
    foreach ($final['history'] as $event) check((bool)strtotime($event['created_at']), 'History timestamp exists for event '.$event['id']);
    $oldHistory = $final['history'];
    $notice = success($resident->call('my_notifications'),'Owner reads notification center');
    check($notice['unread_count']>=5 && count($notice['notifications'])>=5,'Status changes and public update create owner notifications');
    $notificationId = $notice['notifications'][0]['id'];
    success($other->post('mark_notification_read',['id'=>$notificationId]),'Foreign notification mark returns uniform response');
    check(sql('SELECT read_at FROM report_notifications WHERE id=?',[$notificationId])->fetchColumn()===null,'Foreign user cannot mark owner notification read');
    check(success($other->call('my_notifications'),'Other resident notifications')['unread_count']===0,'Notifications do not leak to another account');
    success($resident->post('mark_notification_read',['id'=>$notificationId]),'Owner marks notification read');
    check(sql('SELECT read_at FROM report_notifications WHERE id=?',[$notificationId])->fetchColumn()!==null,'Read notification persists');
    $report = transition($admin,$report,'reviewing','Explicitly reopening QA case.','',true);
    check(end($report['history'])['event_type']==='reopen','Reopening creates a separate explicit event');
    $reopened = success($resident->call('report_details&id='.$id),'Resident reads reopened report')['report'];
    check(array_slice($reopened['history'],0,count($oldHistory))===$oldHistory,'Reopening preserves all previous events and timestamps');
    $noticeCount = (int)sql('SELECT COUNT(*) FROM report_notifications WHERE report_id=?',[$id])->fetchColumn();
    $report = success($admin->post('report_add_public_update',['id'=>$id,'version'=>$report['version'],'internal_note'=>'Private follow-up only.']),'Admin saves internal note')['report'];
    check((int)sql('SELECT COUNT(*) FROM report_notifications WHERE report_id=?',[$id])->fetchColumn()===$noticeCount,'Internal-only note does not send resident notification');
    $report = transition($admin,$report,'needs_info','Please provide the nearest visible landmark.');
    check(success($resident->call('report_details&id='.$id),'Resident reads information request')['report']['public_note']==='Please provide the nearest visible landmark.','Needs-information response clearly carries request');
    denied($admin->post('report_status',['id'=>$id,'version'=>$report['version'],'status'=>'rejected']),[400],'Rejection requires a public explanation');
    $report = transition($admin,$report,'rejected','Duplicate QA incident; existing case retained.');
    check($report['status']==='rejected' && end($report['history'])['new_status']==='rejected','Rejected report retains its real history');

    $concurrentReceipt = success($other->post('report',array_replace($data,['submission_key'=>bin2hex(random_bytes(16))])),'Submit separate concurrency test report');
    $concurrentId = (int)$concurrentReceipt['id'];
    // Inject a database write failure after report/history writes but before commit.
    // This proves the transaction rolls all three records back together.
    sql("CREATE TRIGGER qa_notification_failure BEFORE INSERT ON report_notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QA injected write failure'");
    try {
        denied($admin->post('report_status',['id'=>$concurrentId,'version'=>1,'status'=>'received']),[503],'Database write failure returns understandable failure');
        $unchanged = sql('SELECT status,version FROM incident_reports WHERE id=?',[$concurrentId])->fetch();
        check($unchanged['status']==='pending' && (int)$unchanged['version']===1,'Failed transaction restores report status and version');
        check((int)sql('SELECT COUNT(*) FROM report_status_history WHERE report_id=?',[$concurrentId])->fetchColumn()===1,'Failed transaction leaves no partial history event');
        check((int)sql('SELECT COUNT(*) FROM report_notifications WHERE report_id=?',[$concurrentId])->fetchColumn()===0,'Failed transaction leaves no notification');
    } finally { sql('DROP TRIGGER qa_notification_failure'); }
    $pdo->beginTransaction();
    sql('SELECT id FROM incident_reports WHERE id=? FOR UPDATE',[$concurrentId]);
    $workers = [];
    for ($i=0;$i<2;$i++) {
        $command = [...testPhpCommand(),__DIR__.'/transition-worker.php',(string)$concurrentId,'1'];
        $process = proc_open($command,[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
        if (!is_resource($process)) throw new RuntimeException('Could not launch concurrency worker');
        fclose($pipes[0]);
        if (trim((string)fgets($pipes[1]))!=='ready') throw new RuntimeException('Concurrency worker did not initialize');
        $workers[] = [$process,$pipes];
    }
    $pdo->commit();
    $outcomes = [];
    foreach ($workers as [$process,$pipes]) {
        $outcomes[] = trim(stream_get_contents($pipes[1]));
        fclose($pipes[1]); fclose($pipes[2]); proc_close($process);
    }
    sort($outcomes);
    check($outcomes===['conflict','saved'],'Two concurrent writers produce exactly one save and one version conflict');
    check((int)sql('SELECT COUNT(*) FROM report_status_history WHERE report_id=?',[$concurrentId])->fetchColumn()===2 && (int)sql('SELECT COUNT(*) FROM report_notifications WHERE report_id=?',[$concurrentId])->fetchColumn()===1,'Concurrent saves create one history event and one notification');

    $guest = new TestClient(); success($guest->bootstrap(),'Guest bootstrap');
    $guestData = array_replace($data,['submission_key'=>bin2hex(random_bytes(16))]);
    $guestReceipt = success($guest->post('report',$guestData),'Guest incident submission');
    $guestId = (int)$guestReceipt['id']; $secret = (string)$guestReceipt['tracking_code']; $ref = $guestReceipt['reference'];
    $stored = (string)sql('SELECT tracking_secret_hash FROM incident_reports WHERE id=?',[$guestId])->fetchColumn();
    check((bool)preg_match('/^[a-f0-9]{64}$/D',$secret) && $stored!==$secret && hash_equals($stored,hash('sha256',$secret)),'Guest uses random 256-bit code and stores only its hash');
    $lookup = new TestClient(); success($lookup->bootstrap(),'Guest lookup bootstrap');
    denied($lookup->call('report_details&id='.$guestId),[401,403,404],'Guest report ID alone grants no access');
    denied($lookup->call('track_guest_report&reference='.rawurlencode($ref).'&tracking_code=not-a-secret'),[400,404,405],'Guest secret lookup cannot use URL query');
    $wrong = $lookup->post('track_guest_report',['reference'=>$ref,'tracking_code'=>str_repeat('a',64)]);
    $missing = $lookup->post('track_guest_report',['reference'=>'DIRMS-999999999','tracking_code'=>str_repeat('a',64)]);
    denied($wrong,[404],'Wrong private tracking code rejected');
    check($wrong['status']===$missing['status'] && $wrong['json']['message']===$missing['json']['message'],'Unknown reference and wrong code return identical generic errors');
    $tracked = success($lookup->post('track_guest_report',['reference'=>$ref,'tracking_code'=>$secret]),'Correct guest reference and code track report');
    check($tracked['report']['id']===$guestId && !str_contains(json_encode($tracked['report']),$secret),'Guest tracking response excludes private secret');
    $guestRetry = success($guest->post('report',$guestData),'Guest retries saved submission without creating a second report');
    check($guestRetry['id']===$guestId && $guestRetry['tracking_code']===$secret,'Guest session recovers original receipt and private code on retry');
    check(success($lookup->call('report_details&id='.$guestId),'Granted guest session refreshes tracked report')['report']['id']===$guestId,'Guest polling uses expiring server-side authorization');
    denied($lookup->call('report_details&id='.$id),[401,403,404],'Guest grant cannot read other reports');
    denied($lookup->post('track_guest_report',['reference'=>'BS-000126','tracking_code'=>str_repeat('a',64)]),[404],'Legacy guest report without a secret fails closed');
    success($lookup->post('login',['email'=>'legacy@example.test','password'=>$password]),'Guest tracking session signs into a resident account');
    denied($lookup->call('report_details&id='.$guestId),[403,404],'Switching account revokes previous guest report grant');
    $guestThrottled = false;
    for($i=0;$i<25;$i++) {
        $attempt = $lookup->post('track_guest_report',['reference'=>$ref,'tracking_code'=>str_repeat('a',64)]);
        if($attempt['status']===429) { $guestThrottled=true; break; }
        if($attempt['status']!==404) throw new RuntimeException('Unexpected guest lookup failure status '.$attempt['status']);
    }
    check($guestThrottled,'Guest tracking guesses are rate limited independently of cookies');

    // Existing CRUD actions still round-trip the ordinary public modules.
    $save = success($admin->post('admin_save',['type'=>'centers','id'=>0,'data'=>['name'=>'QA unverified center','barangay'=>'QA','address'=>'Test address','capacity'=>0,'occupancy'=>0,'latitude'=>'','longitude'=>'','notes'=>'Test only','is_active'=>true,'is_demo'=>true]]),'Admin saves center with unknown GPS');
    $center = sql('SELECT * FROM evacuation_centers WHERE id=?',[$save['id']])->fetch();
    check($center['latitude']===null && $center['longitude']===null,'Unknown center coordinates remain NULL');
    check(!empty($center['updated_at']),'Center last activity records actual administrator save');
    success($admin->post('admin_save',['type'=>'centers','id'=>1,'data'=>['name'=>'Edited Demo Center','barangay'=>'Test','address'=>'Test address','capacity'=>100,'occupancy'=>0,'latitude'=>'','longitude'=>'','is_active'=>true]]),'Edit demo center without explicit verification');
    check((int)sql('SELECT is_demo FROM evacuation_centers WHERE id=1')->fetchColumn()===1,'Ordinary edit retains demo labeling');
    denied($admin->post('admin_save',['type'=>'centers','id'=>$save['id'],'data'=>['name'=>'QA','barangay'=>'QA','address'=>'Test','capacity'=>10,'occupancy'=>11,'latitude'=>'','longitude'=>'','is_active'=>true]]),[400],'Center occupancy cannot exceed known capacity');
    $saveAlert = success($admin->post('admin_save',['type'=>'alerts','id'=>0,'data'=>['title'=>'QA expired DEMO alert','alert_type'=>'Test','severity'=>'low','location'=>'Test','description'=>'Test only','instructions'=>'Test','expires_at'=>'2020-01-01T00:00','is_active'=>true,'is_demo'=>true]]),'Admin saves expired test alert');
    $alerts = success($anonymous->call('alerts'),'Public alerts refresh');
    check(!in_array($saveAlert['id'],array_map(static fn($a)=>(int)$a['id'],$alerts['alerts']),true),'Expired alert does not publish in public list');
    check(sql('SELECT expires_at FROM alerts WHERE id=?',[$saveAlert['id']])->fetchColumn()==='2019-12-31 16:00:00','Manila alert expiry input is stored as the correct UTC instant');
    check((int)sql('SELECT is_demo FROM alerts WHERE id=?',[$saveAlert['id']])->fetchColumn()===1,'Explicit demo alert stays labeled as demo');
    denied($other->post('admin_save',['type'=>'tips','id'=>0,'data'=>['title'=>'Forbidden','body'=>'Forbidden']]),[403],'Resident cannot write administrator content');
    $moduleCases = [
        'tips'=>['title'=>'QA preparedness tip','body'=>'Automated test content only.','icon'=>'shield','sort_order'=>99],
        'hotlines'=>['organization'=>'QA directory fixture','phone'=>'911','description'=>'Test fixture for existing emergency number','sort_order'=>99,'is_active'=>true,'is_demo'=>true],
        'news'=>['title'=>'QA demonstration bulletin','summary'=>'Automated test bulletin only.','source_url'=>'https://example.com/qa-news','is_active'=>true,'is_demo'=>true],
    ];
    foreach($moduleCases as $type=>$fields) {
        $saved = success($admin->post('admin_save',['type'=>$type,'id'=>0,'data'=>$fields]),'Create '.$type.' content');
        $recordId = (int)$saved['id'];
        $publicSet = success($anonymous->bootstrap(),'Public bootstrap after '.$type.' creation')['data'][$type];
        check(in_array($recordId,array_map(static fn($r)=>(int)$r['id'],$publicSet),true),'Created '.$type.' appears in public data');
        $textField = $type==='hotlines'?'description':($type==='tips'?'body':'summary');
        $fields[$textField] = 'Edited automated test content.';
        success($admin->post('admin_save',['type'=>$type,'id'=>$recordId,'data'=>$fields]),'Edit '.$type.' content');
        $editedRows = success($anonymous->bootstrap(),'Public bootstrap after '.$type.' edit')['data'][$type];
        $edited = array_values(array_filter($editedRows,static fn($r)=>(int)$r['id']===$recordId))[0]??[];
        check(($edited[$textField]??'')===$fields[$textField],'Edited '.$type.' persists publicly');
        if($type!=='tips') check((int)$edited['is_demo']===1,'Edited '.$type.' retains demo label');
        success($admin->post('admin_delete',['type'=>$type,'id'=>$recordId]),'Delete '.$type.' test content');
        $deletedRows = success($anonymous->bootstrap(),'Public bootstrap after '.$type.' deletion')['data'][$type];
        check(!in_array($recordId,array_map(static fn($r)=>(int)$r['id'],$deletedRows),true),'Deleted '.$type.' disappears from public data');
    }
    denied($admin->post('admin_save',['type'=>'news','id'=>0,'data'=>array_replace($moduleCases['news'],['source_url'=>'javascript:alert(1)'])]),[400],'News rejects unsafe source URLs');
    success($admin->post('settings_save',['site_name'=>'DIRMS','city'=>'San Pablo City, Laguna','contact_email'=>'qa@example.test','safety_banner'=>'Automated test banner.']),'Administrator updates site settings');
    $settings = success($anonymous->bootstrap(),'Public bootstrap after settings update')['data']['settings'];
    check($settings['site_name']==='DIRMS' && $settings['contact_email']==='qa@example.test','Site settings persist in public data');
    denied($admin->post('settings_save',['site_name'=>'Must not persist','city'=>'Must not persist','contact_email'=>'invalid-email','safety_banner'=>'Must not persist']),[400],'Invalid settings email is rejected');
    check(sql("SELECT setting_value FROM site_settings WHERE setting_key='site_name'")->fetchColumn()==='DIRMS','Invalid settings form does not partially overwrite earlier fields');
    foreach(['/index.php','/alerts.php','/report-incident.php','/evacuation-centers.php','/hotlines.php','/tips.php','/news.php','/login.php','/register.php','/my-reports.php','/track-report.php'] as $route) {
        check($anonymous->page($route)['status']===200,'Public route '.$route.' serves successfully');
    }
    check($anonymous->page('/admin.php')['status']===302,'Anonymous administrator page redirects to login');
    check($admin->page('/admin.php')['status']===200,'Authenticated administrator dashboard serves successfully');
    denied($admin->post('admin_delete',['type'=>'reports','id'=>$id]),[400,403,409],'Administrator cannot delete permanent incident history');
    success($resident->post('logout',[]),'Resident logs out');
    denied($resident->call('my_reports'),[401],'Logged-out session loses report access');
    success($resident->bootstrap(),'Logged-out session refreshes CSRF token');
    success($resident->post('login',['email'=>'resident@example.test','password'=>$password]),'Resident logs back in');
    sql('UPDATE users SET is_active=0 WHERE email=?',['resident@example.test']);
    denied($resident->call('my_reports'),[401],'Disabled account loses existing-session access');
    sql('UPDATE users SET is_active=1 WHERE email=?',['resident@example.test']);

    $limited = new TestClient(); success($limited->bootstrap(),'Rate-limit session bootstrap');
    $throttled = false;
    for ($i=0;$i<14;$i++) {
        $response = $limited->post('login',['email'=>'rate-limit@example.test','password'=>'incorrect-password']);
        if ($response['status']===429) { $throttled=true; break; }
        if ($response['status']!==401) throw new RuntimeException('Unexpected login failure status '.$response['status']);
    }
    check($throttled,'Repeated failed login attempts are rate limited');
    echo "\n$passed integration assertions passed.\n";
} catch (Throwable $e) {
    fwrite(STDERR,$e->getMessage()."\n");
    exit(1);
}
