<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function publicData(): array {
    $settings = [];
    foreach (db()->query('SELECT setting_key, setting_value FROM site_settings')->fetchAll() as $row) $settings[$row['setting_key']] = $row['setting_value'];
    return [
        'alerts' => selectAll('alerts', 'is_active=1 AND (expires_at IS NULL OR expires_at >= NOW())', 'created_at DESC,id DESC'),
        'centers' => selectAll('evacuation_centers', 'is_active=1', 'id DESC'),
        'hotlines' => selectAll('hotlines', 'is_active=1', 'sort_order ASC,id ASC'),
        'tips' => selectAll('tips', '1=1', 'sort_order ASC,id ASC'),
        'news' => selectAll('news', 'is_active=1', 'created_at DESC,id DESC'),
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
            $date = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $expire);
            if (!$date || $date->format('Y-m-d\TH:i') !== $expire) fail('Invalid expiry date/time.');
            $expire = $date->format('Y-m-d H:i:s');
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
            'is_demo'=>0,
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
            'is_active'=>boolValue($data['is_active']??false),
            'is_demo'=>0,
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
            'is_demo'=>0,
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
            'is_demo'=>0,
        ];
    } else fail('Unsupported item type.');
    $savedId = insertOrUpdate($type==='centers'?'evacuation_centers':$type,$fields,$id);
    adminLog($user,$id?'updated':'created',$type,$savedId);
    return ['ok'=>true,'message'=>'Saved successfully.','id'=>$savedId];
}
function adminDataset(): array {
    $pdo=db();
    $total = [
        'reports'=>(int)$pdo->query('SELECT COUNT(*) FROM incident_reports')->fetchColumn(),
        'residents'=>(int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='resident' AND is_active=1")->fetchColumn(),
        'centers'=>(int)$pdo->query('SELECT COUNT(*) FROM evacuation_centers WHERE is_active=1')->fetchColumn(),
        'alerts'=>(int)$pdo->query('SELECT COUNT(*) FROM alerts WHERE is_active=1')->fetchColumn(),
        'pending'=>(int)$pdo->query("SELECT COUNT(*) FROM incident_reports WHERE status IN ('pending','reviewing')")->fetchColumn(),
    ];
    return [
        'stats'=>$total,
        'alerts'=>selectAll('alerts','1=1','created_at DESC,id DESC'),
        'reports'=>selectAll('incident_reports','1=1','created_at DESC,id DESC'),
        'centers'=>selectAll('evacuation_centers','1=1','id DESC'),
        'hotlines'=>selectAll('hotlines','1=1','sort_order ASC,id ASC'),
        'tips'=>selectAll('tips','1=1','sort_order ASC,id ASC'),
        'news'=>selectAll('news','1=1','created_at DESC,id DESC'),
        'users'=>$pdo->query('SELECT id,full_name,email,phone,role,is_active,created_at FROM users ORDER BY created_at DESC,id DESC')->fetchAll(),
        'activity'=>$pdo->query('SELECT a.*,u.full_name FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 20')->fetchAll(),
        'settings'=>publicData()['settings'],
    ];
}

try {
    $action = (string)($_GET['action'] ?? 'bootstrap');
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'GET') {
        if ($action === 'bootstrap') jsonResponse(['ok'=>true, 'data'=>publicData(),'user'=>currentUser(),'csrf'=>csrfToken()]);
        if ($action === 'alerts') jsonResponse(['ok'=>true, 'alerts'=>selectAll('alerts', 'is_active=1 AND (expires_at IS NULL OR expires_at >= NOW())', 'created_at DESC,id DESC')]);
        if ($action === 'admin_data') { requireAdmin(); jsonResponse(['ok'=>true,'data'=>adminDataset(),'csrf'=>csrfToken()]); }
        if ($action === 'my_reports') {
            $user = currentUser(); if (!$user) fail('Login required.',401);
            $s=db()->prepare('SELECT id,incident_type,location,description,photo_path,status,admin_notes,created_at FROM incident_reports WHERE user_id=? ORDER BY id DESC');
            $s->execute([(int)$user['id']]);
            jsonResponse(['ok'=>true,'reports'=>$s->fetchAll()]);
        }
        fail('Endpoint not found.',404);
    }
    if ($method !== 'POST') fail('Only POST requests are allowed.',405);
    requireCsrf();
    $input = requestData();
    if ($action === 'register') {
        $fullName=requiredText($input,'full_name',120);
        $email=strtolower(requiredText($input,'email',190));
        $phone=cleanText($input['phone']??'',35);
        $pass=(string)($input['password']??'');
        if (!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Please enter a valid email.');
        if (strlen($pass)<8) fail('Use a password with at least 8 characters.');
        if (strlen($pass)>200) fail('Password is too long.');
        $q=db()->prepare("INSERT INTO users(full_name,email,phone,password_hash,role) VALUES(?,?,?,?,'resident')");
        try { $q->execute([$fullName,$email,$phone,password_hash($pass,PASSWORD_DEFAULT)]); }
        catch (PDOException $ex) { if ($ex->getCode()==='23000') fail('Email already registered.'); throw $ex; }
        session_regenerate_id(true); $_SESSION['user_id']=(int)db()->lastInsertId();
        jsonResponse(['ok'=>true,'message'=>'Your account was created.','user'=>currentUser()]);
    }
    if ($action === 'login') {
        $email=strtolower(requiredText($input,'email',190));
        $password=(string)($input['password']??'');
        $s=db()->prepare('SELECT id,password_hash,is_active FROM users WHERE email=?');
        $s->execute([$email]); $u=$s->fetch();
        if (!$u || !password_verify($password,$u['password_hash']) || !(int)$u['is_active']) fail('Incorrect email/password or account disabled.',401);
        session_regenerate_id(true); $_SESSION['user_id']=(int)$u['id'];
        jsonResponse(['ok'=>true,'message'=>'Welcome back!','user'=>currentUser()]);
    }
    if ($action === 'logout') {
        unset($_SESSION['user_id']); session_regenerate_id(true);
        jsonResponse(['ok'=>true,'message'=>'You have been logged out.']);
    }
    if ($action === 'report') {
        if (!empty($_SESSION['last_report_at']) && time()-(int)$_SESSION['last_report_at']<15) fail('Please wait 15 seconds between report submissions.',429);
        $type=requiredText($input,'incident_type',75);
        if (!in_array($type,['Flood','Fire','Landslide','Earthquake','Typhoon','Road Block','Other'],true)) fail('Please select an incident type.');
        $location=requiredText($input,'location',255);
        $description=requiredText($input,'description',3000);
        if (mb_strlen($description)<10) fail('Please describe the incident in at least 10 characters.');
        $reporter=cleanText($input['reporter_name']??'',120);
        $contact=cleanText($input['reporter_contact']??'',80);
        $photoPath=null;
        if (isset($_FILES['photo']) && $_FILES['photo']['error']!==UPLOAD_ERR_NO_FILE) {
            $file=$_FILES['photo'];
            if ($file['error']!==UPLOAD_ERR_OK) fail('Photo upload failed. Please choose another image.');
            if ($file['size']<=0 || $file['size']>$config['max_upload_bytes']) fail('Photo must be smaller than 5 MB.');
            $mime=(new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
            $allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
            if (!isset($allowed[$mime]) || !getimagesize($file['tmp_name'])) fail('Only JPG, PNG, or WebP image files are allowed.');
            $name=bin2hex(random_bytes(16)).'.'.$allowed[$mime];
            if (!move_uploaded_file($file['tmp_name'], __DIR__.'/uploads/'.$name)) fail('Unable to save the image.',500);
            $photoPath='uploads/'.$name;
        }
        try {
            $user=currentUser();
            $stmt=db()->prepare('INSERT INTO incident_reports (user_id,incident_type,location,description,reporter_name,reporter_contact,photo_path) VALUES (?,?,?,?,?,?,?)');
            $stmt->execute([$user?(int)$user['id']:null,$type,$location,$description,$reporter?:($user['full_name']??null),$contact?:($user['phone']??null),$photoPath]);
        } catch(Throwable $e) { if($photoPath) @unlink(__DIR__.'/'.$photoPath); throw $e; }
        $_SESSION['last_report_at']=time();
        $reportId=(int)db()->lastInsertId();
        jsonResponse(['ok'=>true,'message'=>'Report submitted. Your reference number is BS-'.str_pad((string)$reportId,6,'0',STR_PAD_LEFT).'.','id'=>$reportId]);
    }
    $admin=requireAdmin();
    if ($action === 'admin_save') jsonResponse(adminSave($input,$admin));
    if ($action === 'admin_delete') {
        $type=cleanText($input['type']??'',40);
        $allowed=['alerts'=>'alerts','centers'=>'evacuation_centers','hotlines'=>'hotlines','tips'=>'tips','news'=>'news','reports'=>'incident_reports'];
        if (!isset($allowed[$type])) fail('This item cannot be deleted.');
        $id=intRange($input['id']??0,1,2147483647,'Record ID');
        $q=db()->prepare('DELETE FROM `'.$allowed[$type].'` WHERE id=?');
        $q->execute([$id]);
        if (!$q->rowCount()) fail('Record not found.',404);
        adminLog($admin,'deleted',$type,$id);
        jsonResponse(['ok'=>true,'message'=>'Entry deleted.']);
    }
    if ($action === 'report_status') {
        $id=intRange($input['id']??0,1,2147483647,'Report ID');
        $status=cleanText($input['status']??'',20);
        if (!in_array($status,['pending','reviewing','resolved','rejected'],true)) fail('Invalid report status.');
        $notes=cleanText($input['admin_notes']??'',3000);
        $q=db()->prepare('UPDATE incident_reports SET status=?, admin_notes=? WHERE id=?');
        $q->execute([$status,$notes,$id]);
        $check=db()->prepare('SELECT id FROM incident_reports WHERE id=?');$check->execute([$id]);
        if (!$check->fetch()) fail('Report not found.',404);
        adminLog($admin,'reviewed','reports',$id);
        jsonResponse(['ok'=>true,'message'=>'Report updated.']);
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
        $q=db()->prepare('INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
        foreach ($allowed as $key=>$max) {
            $value=cleanText($input[$key]??'',$max);
            if ($key==='contact_email' && $value && !filter_var($value,FILTER_VALIDATE_EMAIL)) fail('Enter a valid contact email.');
            $q->execute([$key,$value]);
        }
        adminLog($admin,'updated','settings',null);
        jsonResponse(['ok'=>true,'message'=>'Site settings updated.']);
    }
    fail('Endpoint not found.',404);
} catch (PDOException $e) {
    error_log('DIRMS database error: '.$e->getMessage());
    fail('Database is unavailable. Check MySQL and run setup.php if this is a new installation.',503);
} catch (Throwable $e) {
    error_log('DIRMS application error: '.$e->getMessage());
    fail('Unable to process request. Check the server log.',500);
}
