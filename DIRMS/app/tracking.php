<?php
declare(strict_types=1);
require_once __DIR__ . '/migrations.php';

final class TrackingException extends RuntimeException {
    public function __construct(string $message, public readonly int $httpStatus = 400) {
        parent::__construct($message, $httpStatus);
    }
}

function reportStatuses(): array {
    return [
        'pending' => 'Report Submitted', 'received' => 'Received by Admin',
        'reviewing' => 'Under Review', 'in_progress' => 'Action in Progress',
        'resolved' => 'Resolved', 'rejected' => 'Rejected',
        'needs_info' => 'Additional Information Required',
    ];
}

function reportAllowedTransitions(string $status): array {
    return match ($status) {
        'pending' => ['received','needs_info','rejected'],
        'received' => ['reviewing','needs_info','rejected'],
        'reviewing' => ['in_progress','needs_info','rejected'],
        'in_progress' => ['resolved','needs_info'],
        'needs_info' => ['reviewing','rejected'],
        default => [],
    };
}

function reportRequireSchema(): void {
    if (!dirmsSchemaReady(db())) throw new TrackingException('Report tracking needs a database upgrade. Ask an administrator to run upgrade.php after backing up the database.', 503);
}

function reportIsoTime(?string $value): ?string {
    if (!$value) return null;
    return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
}

/** Read a report row and its append-only events from one repeatable snapshot. */
function reportReadSnapshot(callable $read): mixed {
    $pdo = db();
    if ($pdo->inTransaction()) return $read();
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->beginTransaction();
    try {
        $result = $read();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

/** Only an explicitly authorized caller may serialize a raw row. */
function reportSerialize(array $row, bool $admin = false): array {
    $q = db()->prepare('SELECT h.*,u.full_name AS actor_name FROM report_status_history h LEFT JOIN users u ON u.id=h.changed_by_user_id WHERE h.report_id=? ORDER BY h.id ASC');
    $q->execute([(int)$row['id']]);
    $history = [];
    $latestPublic = '';
    foreach ($q->fetchAll() as $event) {
        if (!$admin && $event['event_type'] === 'internal_note') continue;
        $public = (string)($event['public_note'] ?? '');
        if ($public !== '' && !in_array($event['event_type'], ['submitted','legacy_submission'], true)) $latestPublic = $public;
        $item = [
            'id' => (int)$event['id'], 'event_type' => $event['event_type'],
            'previous_status' => $event['previous_status'], 'new_status' => $event['new_status'],
            'public_note' => $public, 'created_at' => reportIsoTime($event['created_at']),
            'actor_name' => $admin ? ($event['actor_name'] ?: 'Deleted account / legacy record') :
                (in_array($event['event_type'], ['submitted','legacy_submission'], true) ? 'Reporter' : 'Administrator'),
            'report_version' => (int)$event['report_version'],
        ];
        if ($admin) {
            $item['internal_note'] = (string)($event['internal_note'] ?? '');
            $item['changed_by_user_id'] = $event['changed_by_user_id'] === null ? null : (int)$event['changed_by_user_id'];
        }
        $history[] = $item;
    }
    $report = [
        'id' => (int)$row['id'], 'reference' => $row['reference'],
        'incident_type' => $row['incident_type'], 'location' => $row['location'],
        'description' => $row['description'], 'status' => $row['status'],
        'status_label' => reportStatuses()[$row['status']] ?? $row['status'],
        'version' => (int)$row['version'], 'is_demo' => (int)$row['is_demo'],
        'created_at' => reportIsoTime($row['created_at']), 'updated_at' => reportIsoTime($row['updated_at']),
        'photo_url' => empty($row['photo_path']) ? null : 'api.php?action=report_photo&id=' . (int)$row['id'],
        'public_note' => $latestPublic, 'history' => $history,
        'legacy_history_incomplete' => !empty($row['legacy_status_at_upgrade']),
        'legacy_status_at_upgrade' => $row['legacy_status_at_upgrade'] ?? null,
    ];
    if ($admin) {
        $report += [
            'user_id' => $row['user_id'] === null ? null : (int)$row['user_id'],
            'reporter_name' => $row['reporter_name'], 'reporter_contact' => $row['reporter_contact'],
            'admin_notes' => (string)($row['admin_notes'] ?? ''),
            'allowed_transitions' => reportAllowedTransitions($row['status']),
            'can_reopen' => in_array($row['status'], ['resolved','rejected'], true),
        ];
    }
    return $report;
}

function reportListForUser(array $user): array {
    return reportReadSnapshot(static function () use ($user): array {
        reportRequireSchema();
        $q = db()->prepare('SELECT * FROM incident_reports WHERE user_id=? ORDER BY id DESC');
        $q->execute([(int)$user['id']]);
        return array_map(static fn(array $row): array => reportSerialize($row), $q->fetchAll());
    });
}

function reportListForAdmin(): array {
    return reportReadSnapshot(static function (): array {
        reportRequireSchema();
        $user = currentUser();
        if (!$user || $user['role'] !== 'admin') throw new TrackingException('Administrator access required.', 403);
        return array_map(static fn(array $row): array => reportSerialize($row, true), db()->query('SELECT * FROM incident_reports ORDER BY id DESC')->fetchAll());
    });
}

function reportGetAuthorized(int $id, ?array $user): array {
    return reportReadSnapshot(static function () use ($id, $user): array {
        reportRequireSchema();
        if (!$user) throw new TrackingException('Login required.', 401);
        $admin = $user['role'] === 'admin';
        $q = db()->prepare('SELECT * FROM incident_reports WHERE id=?' . ($admin ? '' : ' AND user_id=?'));
        $q->execute($admin ? [$id] : [$id,(int)$user['id']]);
        $row = $q->fetch();
        if (!$row) throw new TrackingException('Report not found or access unavailable.', 404);
        return reportSerialize($row, $admin);
    });
}

/** Called by the API only after checking an expiring, server-side guest session grant. */
function reportGetForGuest(int $id): array {
    return reportReadSnapshot(static function () use ($id): array {
        reportRequireSchema();
        $q = db()->prepare('SELECT * FROM incident_reports WHERE id=? AND user_id IS NULL');
        $q->execute([$id]);
        $row = $q->fetch();
        if (!$row) throw new TrackingException('Report not found or access unavailable.', 404);
        return reportSerialize($row);
    });
}

function reportGuestLookup(string $reference, string $secret): array {
    return reportReadSnapshot(static function () use ($reference, $secret): array {
        reportRequireSchema();
        $reference = strtoupper(trim($reference));
        $secret = trim($secret);
        $q = db()->prepare('SELECT * FROM incident_reports WHERE reference=? AND user_id IS NULL LIMIT 1');
        $q->execute([mb_substr($reference, 0, 32)]);
        $row = $q->fetch();
        $candidate = hash('sha256', $secret);
        $stored = $row['tracking_secret_hash'] ?? str_repeat('0', 64);
        $matches = hash_equals((string)$stored, $candidate);
        if (!$row || !$matches || !preg_match('/^[a-f0-9]{64}$/D', $secret)) throw new TrackingException('The reference or private tracking code could not be verified.', 404);
        return ['report' => reportSerialize($row), 'report_id' => (int)$row['id']];
    });
}

function reportCreate(array $fields, ?array $user, ?string $photoPath, ?string $submissionKey = null): array {
    reportRequireSchema();
    $pdo = db();
    $code = $user ? null : bin2hex(random_bytes(32));
    $submissionHash = null;
    if ($submissionKey !== null) {
        if (!preg_match('/^[A-Za-z0-9_-]{16,128}$/D', $submissionKey)) throw new TrackingException('Invalid submission key. Refresh the form and try again.');
        $scope = $user ? 'user:' . (int)$user['id'] : 'guest:' . session_id();
        $submissionHash = hash('sha256', $scope . ':' . $submissionKey);
    }
    $pdo->beginTransaction();
    try {
        if ($submissionHash !== null) {
            $q = $pdo->prepare('SELECT id FROM incident_reports WHERE submission_key_hash=?');
            $q->execute([$submissionHash]);
            if ($q->fetch()) throw new TrackingException('This submission was already saved. Open your report receipt or My Reports.', 409);
        }
        $q = $pdo->prepare('INSERT INTO incident_reports(user_id,incident_type,location,description,reporter_name,reporter_contact,photo_path,tracking_secret_hash,submission_key_hash) VALUES(?,?,?,?,?,?,?,?,?)');
        $q->execute([
            $user ? (int)$user['id'] : null, $fields['incident_type'], $fields['location'], $fields['description'],
            $fields['reporter_name'] ?: ($user['full_name'] ?? null),
            $fields['reporter_contact'] ?: ($user['phone'] ?? null), $photoPath,
            $code === null ? null : hash('sha256', $code), $submissionHash,
        ]);
        $id = (int)$pdo->lastInsertId();
        $reference = 'DIRMS-' . str_pad((string)$id, 6, '0', STR_PAD_LEFT);
        $q = $pdo->prepare('UPDATE incident_reports SET reference=?,updated_at=updated_at WHERE id=?');
        $q->execute([$reference,$id]);
        $q = $pdo->prepare("INSERT INTO report_status_history(report_id,previous_status,new_status,changed_by_user_id,event_type,event_key,report_version,created_at) SELECT id,NULL,'pending',user_id,'submitted','submission',1,created_at FROM incident_reports WHERE id=?");
        $q->execute([$id]);
        $q = $pdo->prepare('SELECT * FROM incident_reports WHERE id=?');
        $q->execute([$id]);
        $result = ['id' => $id, 'reference' => $reference, 'tracking_code' => $code, 'report' => reportSerialize($q->fetch())];
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($e instanceof PDOException && $e->getCode() === '23000') throw new TrackingException('This submission was already saved. Open your report receipt or My Reports.', 409);
        throw $e;
    }
}

function reportValidateActor(array $admin): void {
    $q = db()->prepare("SELECT id FROM users WHERE id=? AND role='admin' AND is_active=1");
    $q->execute([(int)($admin['id'] ?? 0)]);
    if (!$q->fetch()) throw new TrackingException('Administrator access required.', 403);
}

function reportTransition(int $id, array $admin, int $expectedVersion, string $newStatus, string $publicNote = '', string $internalNote = '', bool $reopen = false): array {
    return reportSaveEvent($id, $admin, $expectedVersion, $newStatus, $publicNote, $internalNote, $reopen);
}

function reportAddUpdate(int $id, array $admin, int $expectedVersion, string $publicNote = '', string $internalNote = ''): array {
    return reportSaveEvent($id, $admin, $expectedVersion, null, $publicNote, $internalNote, false);
}

function reportSaveEvent(int $id, array $admin, int $expectedVersion, ?string $newStatus, string $publicNote, string $internalNote, bool $reopen): array {
    reportRequireSchema();
    reportValidateActor($admin);
    $publicNote = cleanText($publicNote, 3000);
    $internalNote = cleanText($internalNote, 3000);
    if ($expectedVersion < 1) throw new TrackingException('Refresh the report before saving; its version is required.', 409);
    if ($newStatus !== null && !isset(reportStatuses()[$newStatus])) throw new TrackingException('Select a valid report status.');
    if ($newStatus === null && $publicNote === '' && $internalNote === '') throw new TrackingException('Write a public update or internal note before saving.');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT * FROM incident_reports WHERE id=? FOR UPDATE');
        $q->execute([$id]);
        $row = $q->fetch();
        if (!$row) throw new TrackingException('Report not found.', 404);
        if ((int)$row['version'] !== $expectedVersion) throw new TrackingException('This report changed while you were reviewing it. Refresh and review the latest history before saving again.', 409);
        $previous = $row['status'];
        $eventType = $publicNote !== '' ? 'public_update' : 'internal_note';
        if ($newStatus !== null) {
            if ($newStatus === $previous) throw new TrackingException('The report already has this status. Use Save Notes for an update without a status change.', 409);
            if ($reopen) {
                if (!in_array($previous, ['resolved','rejected'], true) || $newStatus !== 'reviewing') throw new TrackingException('Only a resolved or rejected report can be explicitly reopened for review.');
                if ($publicNote === '') throw new TrackingException('Explain why this report is being reopened.');
                $eventType = 'reopen';
            } else {
                if (!in_array($newStatus, reportAllowedTransitions($previous), true)) throw new TrackingException('This status transition is not allowed. Follow the report workflow or explicitly reopen a closed report.');
                $eventType = 'status_change';
            }
            if (in_array($newStatus, ['in_progress','resolved','rejected','needs_info'], true) && $publicNote === '') {
                throw new TrackingException(match ($newStatus) {
                    'in_progress' => 'Describe the follow-up or action now underway.',
                    'resolved' => 'A public resolution summary is required.',
                    'rejected' => 'A public explanation is required when rejecting a report.',
                    default => 'Describe the additional information the reporter needs to provide.',
                });
            }
        } else $newStatus = $previous;
        $nextVersion = $expectedVersion + 1;
        $q = $pdo->prepare('UPDATE incident_reports SET status=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?');
        $q->execute([$newStatus,$nextVersion,$id,$expectedVersion]);
        if ($q->rowCount() !== 1) throw new TrackingException('The report has changed. Refresh before saving.', 409);
        $q = $pdo->prepare('INSERT INTO report_status_history(report_id,previous_status,new_status,changed_by_user_id,event_type,event_key,report_version,public_note,internal_note) VALUES(?,?,?,?,?,?,?,?,?)');
        $q->execute([$id,$previous,$newStatus,(int)$admin['id'],$eventType,'version:' . $nextVersion,$nextVersion,$publicNote ?: null,$internalNote ?: null]);
        $historyId = (int)$pdo->lastInsertId();
        if ($row['user_id'] !== null && $eventType !== 'internal_note') {
            $message = $row['reference'] . ': ' . ($eventType === 'public_update' ? 'New public update' : ($eventType === 'reopen' ? 'Report reopened — Under Review' : reportStatuses()[$newStatus]));
            $q = $pdo->prepare('INSERT INTO report_notifications(user_id,report_id,history_id,message) VALUES(?,?,?,?)');
            $q->execute([(int)$row['user_id'],$id,$historyId,$message]);
        }
        $q = $pdo->prepare('INSERT INTO activity_logs(user_id,action,entity_type,entity_id) VALUES(?,?,?,?)');
        $q->execute([(int)$admin['id'],$eventType,'reports',$id]);
        $result = reportGetAuthorized($id,$admin);
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function reportNotifications(array $user): array {
    return reportReadSnapshot(static function () use ($user): array {
        reportRequireSchema();
        $q = db()->prepare('SELECT n.id,n.report_id,n.message,n.read_at,n.created_at,r.reference FROM report_notifications n JOIN incident_reports r ON r.id=n.report_id WHERE n.user_id=? AND r.user_id=? ORDER BY n.id DESC LIMIT 100');
        $q->execute([(int)$user['id'],(int)$user['id']]);
        $notifications = [];
        foreach ($q->fetchAll() as $item) {
            $item['id'] = (int)$item['id']; $item['report_id'] = (int)$item['report_id'];
            $item['read_at'] = reportIsoTime($item['read_at']); $item['created_at'] = reportIsoTime($item['created_at']);
            $notifications[] = $item;
        }
        $q = db()->prepare('SELECT COUNT(*) FROM report_notifications n JOIN incident_reports r ON r.id=n.report_id WHERE n.user_id=? AND r.user_id=? AND n.read_at IS NULL');
        $q->execute([(int)$user['id'],(int)$user['id']]);
        return ['notifications' => $notifications, 'unread_count' => (int)$q->fetchColumn()];
    });
}

function reportMarkNotificationRead(int $id, array $user): void {
    reportRequireSchema();
    $q = db()->prepare('UPDATE report_notifications n JOIN incident_reports r ON r.id=n.report_id SET n.read_at=COALESCE(n.read_at,CURRENT_TIMESTAMP) WHERE n.id=? AND n.user_id=? AND r.user_id=?');
    $q->execute([$id,(int)$user['id'],(int)$user['id']]);
    // Uniform response also covers absent/foreign IDs without leaking ownership.
}
