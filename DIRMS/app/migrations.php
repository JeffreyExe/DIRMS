<?php
declare(strict_types=1);

/** Additive upgrades only. Back up the database and uploads before running. */
const DIRMS_TRACKING_SCHEMA_VERSION = '20261107_tracking_v1';
const DIRMS_SCHEMA_VERSION = '20261107_center_activity_v2';

function dirmsColumnExists(PDO $pdo, string $table, string $column): bool {
    $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');
    $q->execute([$table, $column]);
    return (int)$q->fetchColumn() > 0;
}

function dirmsIndexExists(PDO $pdo, string $table, string $index): bool {
    $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?');
    $q->execute([$table, $index]);
    return (int)$q->fetchColumn() > 0;
}

function dirmsSchemaReady(PDO $pdo, ?string $version = null): bool {
    try {
        $q = $pdo->prepare('SELECT version FROM schema_migrations WHERE version=?');
        $q->execute([$version ?? DIRMS_SCHEMA_VERSION]);
        return (bool)$q->fetchColumn();
    } catch (PDOException $e) {
        // Missing tracking tables are expected on an installation awaiting upgrade.
        if (in_array((string)$e->getCode(), ['42S02', '42S22'], true)) return false;
        throw $e;
    }
}

function dirmsMigrate(PDO $pdo): bool {
    $lockName = 'dirms_upgrade_' . substr(hash('sha256', (string)$pdo->query('SELECT DATABASE()')->fetchColumn()), 0, 32);
    $lock = $pdo->prepare('SELECT GET_LOCK(?, 15)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('Another database upgrade is running. Please try again shortly.');
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        if (dirmsSchemaReady($pdo)) return false;
        if (!dirmsSchemaReady($pdo, DIRMS_TRACKING_SCHEMA_VERSION)) {
            // ENUM is extended, never reordered or reduced. Unknown deployment-specific values are retained.
            $type = $pdo->query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='incident_reports' AND COLUMN_NAME='status'")->fetchColumn();
            if (!$type || !str_starts_with((string)$type, 'enum(')) throw new RuntimeException('Expected the existing incident_reports.status ENUM; inspect the database before upgrading.');
            preg_match_all("/'((?:[^'\\\\]|\\\\.)*)'/", (string)$type, $matches);
            $statuses = array_map(static fn(string $v): string => str_replace("\\'", "'", $v), $matches[1]);
            foreach (['pending','received','reviewing','in_progress','resolved','rejected','needs_info'] as $status) {
                if (!in_array($status, $statuses, true)) $statuses[] = $status;
            }
            $pdo->exec('ALTER TABLE incident_reports MODIFY status ENUM(' . implode(',', array_map([$pdo, 'quote'], $statuses)) . ") NOT NULL DEFAULT 'pending'");
            $columns = [
                'reference' => 'VARCHAR(32) DEFAULT NULL',
                'tracking_secret_hash' => 'CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL',
                'version' => 'INT UNSIGNED NOT NULL DEFAULT 1',
                'submission_key_hash' => 'CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL',
                'legacy_status_at_upgrade' => 'VARCHAR(24) DEFAULT NULL',
            ];
            foreach ($columns as $column => $definition) {
                if (!dirmsColumnExists($pdo, 'incident_reports', $column)) $pdo->exec("ALTER TABLE incident_reports ADD COLUMN `$column` $definition");
            }
            $pdo->exec("UPDATE incident_reports SET legacy_status_at_upgrade=status, updated_at=updated_at WHERE status<>'pending' AND legacy_status_at_upgrade IS NULL");
            // Existing printed BS receipts must continue to identify exactly the same reports.
            $pdo->exec("UPDATE incident_reports SET reference=CONCAT('BS-', LPAD(id, GREATEST(6, LENGTH(id)), '0')), updated_at=updated_at WHERE reference IS NULL OR reference=''");
            if (!dirmsIndexExists($pdo, 'incident_reports', 'uq_report_reference')) $pdo->exec('ALTER TABLE incident_reports ADD UNIQUE KEY uq_report_reference(reference)');
            if (!dirmsIndexExists($pdo, 'incident_reports', 'uq_report_submission_key')) $pdo->exec('ALTER TABLE incident_reports ADD UNIQUE KEY uq_report_submission_key(submission_key_hash)');
            if (!dirmsIndexExists($pdo, 'incident_reports', 'idx_report_owner')) $pdo->exec('ALTER TABLE incident_reports ADD KEY idx_report_owner(user_id,id)');
            $sql = file_get_contents(dirname(__DIR__) . '/migrations/001_tracking_tables.sql');
            if ($sql === false) throw new RuntimeException('Tracking migration file is missing.');
            foreach (preg_split('/;\s*(?:\r?\n|$)/', $sql) as $statement) {
                $statement = preg_replace('/^\s*(?:--[^\n]*\n\s*)+/', '', $statement);
                if (trim((string)$statement) !== '') $pdo->exec($statement);
            }
            // This records the known submission only. A legacy current status is not a fabricated admin event.
            $pdo->exec("INSERT INTO report_status_history (report_id,previous_status,new_status,changed_by_user_id,event_type,event_key,report_version,public_note,created_at) SELECT r.id,NULL,'pending',u.id,'legacy_submission','submission',1,'Original submission timestamp retained. Earlier administrative transitions were not recorded.',r.created_at FROM incident_reports r LEFT JOIN users u ON u.id=r.user_id WHERE NOT EXISTS (SELECT 1 FROM report_status_history h WHERE h.report_id=r.id AND h.event_key='submission')");
            // Prevent any application endpoint or accidental SQL edit from rewriting established history.
            foreach (['UPDATE' => 'dirms_history_no_update', 'DELETE' => 'dirms_history_no_delete'] as $operation => $trigger) {
                $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?');
                $q->execute([$trigger]);
                if (!(int)$q->fetchColumn()) $pdo->exec("CREATE TRIGGER `$trigger` BEFORE $operation ON report_status_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Report history is immutable'");
            }
            $q = $pdo->prepare('INSERT INTO schema_migrations(version) VALUES(?)');
            $q->execute([DIRMS_TRACKING_SCHEMA_VERSION]);
        }
        // Existing centers have no known last-edit timestamp. Leave it NULL until a real edit.
        if (!dirmsColumnExists($pdo, 'evacuation_centers', 'updated_at')) {
            $sql = file_get_contents(dirname(__DIR__) . '/migrations/002_center_activity.sql');
            if ($sql === false) throw new RuntimeException('Center activity migration file is missing.');
            $pdo->exec($sql);
        }
        $q = $pdo->prepare('INSERT INTO schema_migrations(version) VALUES(?)');
        $q->execute([DIRMS_SCHEMA_VERSION]);
        return true;
    } finally {
        $q = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $q->execute([$lockName]);
    }
}
