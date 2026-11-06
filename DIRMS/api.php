<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';
require_once __DIR__ . '/app/tracking.php';
require_once __DIR__ . '/app/security.php';
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow, noarchive');

function publicData(): array {
    $settings = [];
    foreach (db()->query('SELECT setting_key, setting_value FROM site_settings')->fetchAll() as $row) $settings[$row['setting_key']] = $row['setting_value'];
    return [
        'alerts' => isoPublicDates(selectAll('alerts', 'is_active=1 AND (expires_at IS NULL OR expires_at >= NOW())', 'created_at DESC,id DESC')),
        'centers' => isoPublicDates(selectAll('evacuation_centers', 'is_active=1', 'id DESC')),
        'hotlines' => selectAll('hotlines', 'is_active=1', 'sort_order ASC,id ASC'),
        'tips' => selectAll('tips', '1=1', 'sort_order ASC,id ASC'),
        'news' => isoPublicDates(selectAll('news', 'is_active=1', 'created_at DESC,id DESC')),
        'settings' => $settings,
    ];
}
function insertOrUpdate(string $table, array $fields, int $id): int {
    $pdo = db();
    if ($id > 0) {
        $sets = implode(', ', array_map(static fn($column) => "`$column` = ?", array_keys($fields)));
        $query = $pdo->prepare("UPDATE `$table` SET $sets WHERE id = ?");
        $query->execute([...array_values($fields), $id]);
        if ($query->rowCount() === 0) {
            $check=$pdo->prepare("SELECT id FROM `$table` WHERE id=?"); $check->execute([$id]);
            if (!$check->fetch()) fail('Entry not found.', 404);
        }
        return $id;
    }
    $names = implode(', ', array_map(static fn($col)=>"`$col`", array_keys($fields)));
    $marks = implode(', ', array_fill(0, count($fields), '?'));
    $query = $pdo->prepare("INSERT INTO `$table` ($names) VALUES ($marks)");
    $query->execute(array_values($fields));
    return (int)$pdo->lastInsertId();
}
function adminSave(array $input, array $user): array {
    $type = cleanText($input['type'] ?? '', 40);
    $data = $input['data'] ?? null;
    if (!is_array($data)) fail('Missing form data.');
    $id = intRange($input['id'] ?? 0, 0, 2147483647, 'Record ID');
    if ($type === 'alerts') {
        $severity = cleanText($data['severity'] ?? 'medium', 12);
        if (!in_array($severity, ['low','medium','high','extreme'], true)) fail('Select a valid severity.');
        $expire = cleanText($data['expires_at'] ?? '', 25);
        if ($expire !== '') {
            $date = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $expire, new DateTimeZone('Asia/Manila'));
            if (!$date || $date->format('Y-m-d\TH:i') !== $expire) fail('Invalid expiry date/time.');
            $expire = $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        }
        $fields = [
            'title'=>requiredText($data,'title',180),
            'alert_type'=>requiredText($data,'alert_type',70),
            'severity'=>$severity,
            'location'=>requiredText($data,'location',180),
            'description'=>requiredText($data,'description',5000),
            'instructions'=>cleanText($data['instructions']??'',3000),
            'expires_at'=>$expire?:null,
            'is_active'=>boolValue($data['is_active']??false),
            'is_demo'=>boolValue($data['is_demo'] ?? true),
        ];
        if ($id===0) $fields['created_by']=(int)$user['id'];
    } elseif ($type === 'centers') {
        $hasLatitude = isset($data['latitude']) && trim((string)$data['latitude']) !== '';
        $hasLongitude = isset($data['longitude']) && trim((string)$data['longitude']) !== '';
        if ($hasLatitude !== $hasLongitude) fail('For a precise map pin, please enter both latitude and longitude or leave both empty.');
        $capacity = intRange($data['capacity'] ?? '', 0, 10000000, 'Capacity');
        $occupancy = intRange($data['occupancy'] ?? '', 0, 10000000, 'Current occupancy');
        if ($capacity > 0 && $occupancy > $capacity) fail('Occupancy cannot exceed capacity.');
        $fields = [
            'name'=>requiredText($data,'name',180),
            'barangay'=>requiredText($data,'barangay',130),
            'address'=>requiredText($data,'address',255),
            'capacity'=>$capacity,
            'occupancy'=>$occupancy,
            'latitude'=>maybeDecimal($data['latitude']??null,-90,90,'latitude'),
            'longitude'=>maybeDecimal($data['longitude']??null,-180,180,'longitude'),
            'notes'=>cleanText($data['notes']??'',3000),
            'updated_at'=>gmdate('Y-m-d H:i:s'),
            'is_active'=>boolValue($data['is_active']??false),
            'is_demo'=>boolValue($data['is_demo'] ?? true),
        ];
    } elseif ($type === 'hotlines') {
        $phone = requiredText($data,'phone',35);
        if (!preg_match('/^[+\d\s().\-]{3,35}$/', $phone)) fail('Invalid phone number. Use digits, spaces, +, - or parentheses.');
        $fields = [
            'organization'=>requiredText($data,'organization',120),
            'phone'=>$phone,
            'description'=>cleanText($data['description']??'',220),
            'sort_order'=>intRange($data['sort_order']??0,-10000,10000,'Sort order'),
            'is_active'=>boolValue($data['is_active']??false),
            'is_demo'=>boolValue($data['is_demo'] ?? true),
        ];
    } elseif ($type === 'tips') {
        $fields = [
            'title'=>requiredText($data,'title',180),
            'body'=>requiredText($data,'body',5000),
            'icon'=>cleanText($data['icon']??'shield',40),
            'sort_order'=>intRange($data['sort_order']??0,-10000,10000,'Sort order'),
        ];
    } elseif ($type === 'news') {
        $url=cleanText($data['source_url']??'',600);
        if ($url && (!filter_var($url,FILTER_VALIDATE_URL) || !preg_match('/^https?:\/\//i',$url))) fail('News link must start with https:// or http://');
        $fields = [
            'title'=>requiredText($data,'title',180),
            'summary'=>requiredText($data,'summary',5000),
            'source_url'=>$url?:null,
            'is_active'=>boolValue($data['is_active']??false),
            'is_demo'=>boolValue($data['is_demo'] ?? true),
        ];
    } else fail('Unsupported item type.');
    $table = $type === 'centers' ? 'evacuation_centers' : $type;
    if ($id > 0 && array_key_exists('is_demo', $fields) && !array_key_exists('is_demo', $data)) {
        $existing = db()->prepare('SELECT is_demo FROM `' . $table . '` WHERE id=?');
        $existing->execute([$id]);
        $fields['is_demo'] = (int)$existing->fetchColumn();
    }
    $pdo=db();
    $pdo->beginTransaction();
    try {
        $savedId = insertOrUpdate($table,$fields,$id);
        adminLog($user,$id?'updated':'created',$type,$savedId);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['ok'=>true,'message'=>'Saved successfully.','id'=>$savedId];
}
function adminDataset(): array {
    $pdo=db();
    $total = [
        'reports'=>(int)$pdo->query('SELECT COUNT(*) FROM incident_reports')->fetchColumn(),
        'residents'=>(int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='resident' AND is_active=1")->fetchColumn(),
        'centers'=>(int)$pdo->query('SELECT COUNT(*) FROM evacuation_centers WHERE is_active=1')->fetchColumn(),
        'alerts'=>(int)$pdo->query('SELECT COUNT(*) FROM alerts WHERE is_active=1')->fetchColumn(),
        'pending'=>(int)$pdo->query("SELECT COUNT(*) FROM incident_reports WHERE status='pending'")->fetchColumn(),
    ];
    foreach (array_keys(reportStatuses()) as $status) {
        $q=$pdo->prepare('SELECT COUNT(*) FROM incident_reports WHERE status=?'); $q->execute([$status]);
        $total[$status]=(int)$q->fetchColumn();
    }
    return [
        'stats'=>$total,
        'alerts'=>isoPublicDates(selectAll('alerts','1=1','created_at DESC,id DESC')),
        'reports'=>reportListForAdmin(),
        'centers'=>isoPublicDates(selectAll('evacuation_centers','1=1','id DESC')),
        'hotlines'=>selectAll('hotlines','1=1','sort_order ASC,id ASC'),
        'tips'=>selectAll('tips','1=1','sort_order ASC,id ASC'),
        'news'=>isoPublicDates(selectAll('news','1=1','created_at DESC,id DESC')),
        'users'=>isoPublicDates($pdo->query('SELECT id,full_name,email,phone,role,is_active,created_at FROM users ORDER BY created_at DESC,id DESC')->fetchAll()),
        'activity'=>isoPublicDates($pdo->query('SELECT a.*,u.full_name FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 20')->fetchAll()),
        'settings'=>publicData()['settings'],
    ];
}

try {
    $action = (string)($_GET['action'] ?? 'bootstrap');
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'GET') {
        if ($action === 'bootstrap') jsonResponse(['ok'=>true, 'data'=>publicData(),'user'=>currentUser(),'csrf'=>csrfToken()]);
        if ($action === 'alerts') jsonResponse(['ok'=>true, 'alerts'=>isoPublicDates(selectAll('alerts', 'is_active=1 AND (expires_at IS NULL OR expires_at >= NOW())', 'created_at DESC,id DESC'))]);
        if ($action === 'admin_data') { requireAdmin(); jsonResponse(['ok'=>true,'data'=>adminDataset(),'csrf'=>csrfToken()]); }
        if ($action === 'my_reports') {
            $user=authenticatedUser(); reportRequireSchema();
            $payload=reportReadSnapshot(static function () use ($user): array {
                // Digest and report rows share one snapshot during concurrent updates.
                $q=db()->prepare('SELECT id,version FROM incident_reports WHERE user_id=? ORDER BY id DESC');
                $q->execute([(int)$user['id']]);
                $version=hash('sha256',json_encode($q->fetchAll()));
                if (hash_equals($version,(string)($_GET['version']??''))) return ['ok'=>true,'unchanged'=>true,'version'=>$version];
                return ['ok'=>true,'reports'=>reportListForUser($user),'version'=>$version,'unchanged'=>false];
            });
            jsonResponse($payload);
        }
        if (in_array($action,['report_details','report_history'],true)) {
            $id=intRange($_GET['id']??0,1,2147483647,'Report ID');
            $report=authorizedReport($id);
            $version=(string)$report['version'];
            if ($version===(string)($_GET['version']??'')) jsonResponse(['ok'=>true,'unchanged'=>true,'version'=>$version]);
            jsonResponse(['ok'=>true,'report'=>$report,'history'=>$report['history'],'version'=>$version,'unchanged'=>false]);
        }
        if ($action === 'my_notifications') versionedResponse(reportNotifications(authenticatedUser()));
        if ($action === 'report_photo') serveIncidentPhoto(intRange($_GET['id']??0,1,2147483647,'Report ID'));
        if ($action === 'track_guest_report') fail('Enter the reference and private tracking code in the tracking form.',405);
        fail('Endpoint not found.',404);
    }
    if ($method !== 'POST') fail('Only POST requests are allowed.',405);
    requireCsrf();
    $input = requestData();
    if ($action === 'register') {
        rateLimit('registration',20,3600);
        $fullName=requiredText($input,'full_name',120);
        $email=strtolower(requiredText($input,'email',190));
        $phone=cleanText($input['phone']??'',35);
        $pass=(string)($input['password']??'');
        if (!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Please enter a valid email.');
        if (strlen($pass)<8) fail('Use a password with at least 8 characters.');
        if (strlen($pass)>72 || str_contains($pass,"\0")) fail('Use a password of at most 72 bytes without null characters.');
        if (isset($input['confirm_password']) && !hash_equals($pass,(string)$input['confirm_password'])) fail('Passwords do not match.');
        $q=db()->prepare("INSERT INTO users(full_name,email,phone,password_hash,role) VALUES(?,?,?,?,'resident')");
        try { $q->execute([$fullName,$email,$phone,password_hash($pass,PASSWORD_DEFAULT)]); }
        catch (PDOException $ex) { if ($ex->getCode()==='23000') fail('Unable to create an account with these details. Try signing in or use another email.'); throw $ex; }
        unset($_SESSION['guest_reports'],$_SESSION['report_receipts']);
        session_regenerate_id(true); $_SESSION['user_id']=(int)db()->lastInsertId();
        jsonResponse(['ok'=>true,'message'=>'Your account was created.','user'=>currentUser()]);
    }
    if ($action === 'login') {
        $email=strtolower(requiredText($input,'email',190));
        $password=(string)($input['password']??'');
        rateLimit('login-ip',30,900);
        rateLimit('login-account',10,900,$email);
        $s=db()->prepare('SELECT id,password_hash,is_active FROM users WHERE email=?');
        $s->execute([$email]); $u=$s->fetch();
        // Verify a valid dummy hash too, keeping unknown-account errors generic.
        $valid=password_verify($password,$u['password_hash']??'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi');
        if (!$u || !$valid || !(int)$u['is_active']) fail('Unable to sign in. Check your credentials or contact the administrator.',401);
        unset($_SESSION['guest_reports'],$_SESSION['report_receipts']);
        session_regenerate_id(true); $_SESSION['user_id']=(int)$u['id'];
        jsonResponse(['ok'=>true,'message'=>'Welcome back!','user'=>currentUser()]);
    }
    if ($action === 'logout') {
        $_SESSION=[]; session_regenerate_id(true);
        jsonResponse(['ok'=>true,'message'=>'You have been logged out.']);
    }
    if ($action === 'track_guest_report') {
        rateLimit('guest-tracking',15,900);
        $reference=cleanText($input['reference']??'',32);
        $secret=cleanText($input['tracking_code']??'',128);
        $result=reportGuestLookup($reference,$secret);
        $_SESSION['guest_reports'][(int)$result['report_id']]=time()+1800;
        if (count($_SESSION['guest_reports'])>20) unset($_SESSION['guest_reports'][array_key_first($_SESSION['guest_reports'])]);
        jsonResponse(['ok'=>true]+$result);
    }
    if ($action === 'clear_guest_tracking') {
        $id=intRange($input['id']??0,1,2147483647,'Report ID');
        unset($_SESSION['guest_reports'][$id]);
        jsonResponse(['ok'=>true,'message'=>'Private report access cleared.']);
    }
    if ($action === 'mark_notification_read') {
        $user=authenticatedUser();
        if (boolValue($input['all']??false)) {
            reportRequireSchema();
            $q=db()->prepare('UPDATE report_notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE user_id=?');
            $q->execute([(int)$user['id']]);
        } else reportMarkNotificationRead(intRange($input['id']??0,1,2147483647,'Notification ID'),$user);
        jsonResponse(['ok'=>true]+reportNotifications($user));
    }
    if ($action === 'report') {
        $key=cleanText($input['submission_key']??'',128);
        if ($key!=='' && !preg_match('/^[A-Za-z0-9_-]{16,128}$/D',$key)) fail('Refresh the form before submitting.');
        $user=currentUser();
        $cacheKey=hash('sha256',($user?'user:'.$user['id']:'guest').':'.$key);
        if ($key!=='' && isset($_SESSION['report_receipts'][$cacheKey]) && $_SESSION['report_receipts'][$cacheKey]['until']>time()) {
            jsonResponse($_SESSION['report_receipts'][$cacheKey]['data']);
        }
        if (!empty($_SESSION['last_report_at']) && time()-(int)$_SESSION['last_report_at']<15) fail('Please wait 15 seconds between report submissions.',429);
        rateLimit('report-submission',20,900);
        $type=requiredText($input,'incident_type',75);
        if (!in_array($type,['Flood','Fire','Landslide','Earthquake','Typhoon','Road Block','Other'],true)) fail('Please select an incident type.');
        $location=requiredText($input,'location',255);
        if (mb_strlen($location)<3) fail('Please enter a location of at least 3 characters.');
        $description=requiredText($input,'description',3000);
        if (mb_strlen($description)<10) fail('Please describe the incident in at least 10 characters.');
        $fields=['incident_type'=>$type,'location'=>$location,'description'=>$description,
            'reporter_name'=>cleanText($input['reporter_name']??'',120),'reporter_contact'=>cleanText($input['reporter_contact']??'',80)];
        $photoPath=saveIncidentPhoto();
        try { $result=reportCreate($fields,$user,$photoPath,$key?:null); }
        catch (Throwable $e) {
            if ($photoPath && ($file=incidentPhotoFile($photoPath))) @unlink($file);
            throw $e;
        }
        $_SESSION['last_report_at']=time();
        if (!$user) $_SESSION['guest_reports'][(int)$result['id']]=time()+1800;
        $response=['ok'=>true,'message'=>'Report submitted. Keep your reference and any private tracking code safe.','report_id'=>$result['id']]+$result;
        if ($key!=='') {
            // Receipts are session-private and bounded; hashes alone cannot recover a guest secret.
            $_SESSION['report_receipts'][$cacheKey]=['until'=>time()+1800,'data'=>$response];
            if(count($_SESSION['report_receipts'])>5) array_shift($_SESSION['report_receipts']);
        }
        jsonResponse($response);
    }
    $admin=requireAdmin();
    if ($action === 'admin_save') jsonResponse(adminSave($input,$admin));
    if ($action === 'admin_delete') {
        $type=cleanText($input['type']??'',40);
        $allowed=['alerts'=>'alerts','centers'=>'evacuation_centers','hotlines'=>'hotlines','tips'=>'tips','news'=>'news'];
        if (!isset($allowed[$type])) fail('This item cannot be deleted.');
        $id=intRange($input['id']??0,1,2147483647,'Record ID');
        $q=db()->prepare('DELETE FROM `'.$allowed[$type].'` WHERE id=?');
        $q->execute([$id]);
        if (!$q->rowCount()) fail('Record not found.',404);
        adminLog($admin,'deleted',$type,$id);
        jsonResponse(['ok'=>true,'message'=>'Entry deleted.']);
    }
    if (in_array($action,['report_status','admin_acknowledge_report','report_add_public_update'],true)) {
        $id=intRange($input['id']??0,1,2147483647,'Report ID');
        $version=intRange($input['version']??0,1,2147483647,'Report version');
        $public=cleanText($input['public_note']??'',3000);
        $internal=cleanText($input['internal_note']??$input['admin_notes']??'',3000);
        if ($action==='report_add_public_update') $report=reportAddUpdate($id,$admin,$version,$public,$internal);
        else {
            $status=$action==='admin_acknowledge_report'?'received':cleanText($input['status']??'',24);
            $reopen=($input['event_type']??'')==='reopen' || boolValue($input['reopen']??false);
            $report=reportTransition($id,$admin,$version,$status,$public,$internal,(bool)$reopen);
        }
        jsonResponse(['ok'=>true,'message'=>'Report update saved.','report'=>$report,'version'=>$report['version']]);
    }
    if ($action === 'user_update') {
        $id=intRange($input['id']??0,1,2147483647,'User ID');
        $role=cleanText($input['role']??'',20);
        if (!in_array($role,['admin','resident'],true)) fail('Invalid role.');
        $active=boolValue($input['is_active']??false);
        if ($id===(int)$admin['id'] && ($role!=='admin' || !$active)) fail('You cannot remove your own administrator access.');
        $q=db()->prepare('UPDATE users SET role=?,is_active=? WHERE id=?');$q->execute([$role,$active,$id]);
        $check=db()->prepare('SELECT id FROM users WHERE id=?');$check->execute([$id]);if(!$check->fetch())fail('User not found.',404);
        adminLog($admin,'updated','users',$id);
        jsonResponse(['ok'=>true,'message'=>'User access updated.']);
    }
    if ($action === 'settings_save') {
        $allowed=['site_name'=>120,'city'=>180,'contact_email'=>190,'safety_banner'=>600];
        $values=[];
        foreach ($allowed as $key=>$max) {
            $value=cleanText($input[$key]??'',$max);
            if ($key==='contact_email' && $value && !filter_var($value,FILTER_VALIDATE_EMAIL)) fail('Enter a valid contact email.');
            $values[$key]=$value;
        }
        $pdo=db(); $pdo->beginTransaction();
        try {
            $q=$pdo->prepare('INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
            foreach ($values as $key=>$value) $q->execute([$key,$value]);
            adminLog($admin,'updated','settings',null);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        jsonResponse(['ok'=>true,'message'=>'Site settings updated.']);
    }
    fail('Endpoint not found.',404);
} catch (TrackingException $e) {
    fail($e->getMessage(),$e->httpStatus);
} catch (PDOException $e) {
    error_log('DIRMS database error: SQLSTATE '.$e->getCode());
    fail('Database is unavailable. Check MySQL and run setup.php if this is a new installation.',503);
} catch (Throwable $e) {
    error_log('DIRMS application error: '.get_class($e));
    fail('Unable to process request. Check the server log.',500);
}
