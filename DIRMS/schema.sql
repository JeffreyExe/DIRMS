-- DIRMS 1.0 database tables. Existing installations: use upgrade.php, never reimport over live data.
CREATE TABLE IF NOT EXISTS users (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 full_name VARCHAR(120) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE,
 phone VARCHAR(35) DEFAULT NULL,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('resident','admin') NOT NULL DEFAULT 'resident',
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alerts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(180) NOT NULL,
 alert_type VARCHAR(70) NOT NULL,
 severity ENUM('low','medium','high','extreme') NOT NULL,
 location VARCHAR(180) NOT NULL,
 description TEXT NOT NULL,
 instructions TEXT DEFAULT NULL,
 expires_at DATETIME DEFAULT NULL,
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 is_demo TINYINT(1) NOT NULL DEFAULT 0,
 created_by INT UNSIGNED DEFAULT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evacuation_centers (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(180) NOT NULL,
 barangay VARCHAR(130) NOT NULL,
 address VARCHAR(255) NOT NULL,
 capacity INT UNSIGNED NOT NULL DEFAULT 0,
 occupancy INT UNSIGNED NOT NULL DEFAULT 0,
 latitude DECIMAL(10,7) DEFAULT NULL,
 longitude DECIMAL(10,7) DEFAULT NULL,
 notes TEXT DEFAULT NULL,
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 is_demo TINYINT(1) NOT NULL DEFAULT 0,
 updated_at TIMESTAMP NULL DEFAULT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incident_reports (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED DEFAULT NULL,
 incident_type VARCHAR(75) NOT NULL,
 location VARCHAR(255) NOT NULL,
 description TEXT NOT NULL,
 reporter_name VARCHAR(120) DEFAULT NULL,
 reporter_contact VARCHAR(80) DEFAULT NULL,
 photo_path VARCHAR(255) DEFAULT NULL,
 status ENUM('pending','reviewing','resolved','rejected','received','in_progress','needs_info') NOT NULL DEFAULT 'pending',
 admin_notes TEXT DEFAULT NULL,
 reference VARCHAR(32) DEFAULT NULL,
 tracking_secret_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 submission_key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 legacy_status_at_upgrade VARCHAR(24) DEFAULT NULL,
 is_demo TINYINT(1) NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
 UNIQUE KEY uq_report_reference(reference),
 UNIQUE KEY uq_report_submission_key(submission_key_hash),
 KEY idx_report_owner(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hotlines (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 organization VARCHAR(120) NOT NULL,
 phone VARCHAR(35) NOT NULL,
 description VARCHAR(220) DEFAULT NULL,
 sort_order INT NOT NULL DEFAULT 0,
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 is_demo TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tips (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(180) NOT NULL,
 body TEXT NOT NULL,
 icon VARCHAR(40) NOT NULL DEFAULT 'shield',
 sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS news (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(180) NOT NULL,
 summary TEXT NOT NULL,
 source_url VARCHAR(600) DEFAULT NULL,
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 is_demo TINYINT(1) NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
 setting_key VARCHAR(80) PRIMARY KEY,
 setting_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED DEFAULT NULL,
 action VARCHAR(50) NOT NULL,
 entity_type VARCHAR(60) NOT NULL,
 entity_id INT UNSIGNED DEFAULT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Additive tracking tables, used by setup.php and the idempotent migration runner.
CREATE TABLE IF NOT EXISTS report_status_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 report_id INT UNSIGNED NOT NULL,
 previous_status VARCHAR(24) DEFAULT NULL,
 new_status VARCHAR(24) NOT NULL,
 changed_by_user_id INT UNSIGNED DEFAULT NULL,
 event_type VARCHAR(32) NOT NULL,
 event_key VARCHAR(80) NOT NULL,
 report_version INT UNSIGNED NOT NULL,
 public_note TEXT DEFAULT NULL,
 internal_note TEXT DEFAULT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_report_event (report_id,event_key),
 UNIQUE KEY uq_report_history_version (report_id,report_version),
 KEY idx_report_history (report_id,id),
 CONSTRAINT fk_history_report FOREIGN KEY (report_id) REFERENCES incident_reports(id) ON DELETE RESTRICT,
 CONSTRAINT fk_history_actor FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_notifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 report_id INT UNSIGNED NOT NULL,
 history_id BIGINT UNSIGNED NOT NULL,
 message VARCHAR(350) NOT NULL,
 read_at TIMESTAMP NULL DEFAULT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_notification_event (user_id,history_id),
 KEY idx_notification_owner (user_id,read_at,id),
 CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_notification_report FOREIGN KEY (report_id) REFERENCES incident_reports(id) ON DELETE RESTRICT,
 CONSTRAINT fk_notification_history FOREIGN KEY (history_id) REFERENCES report_status_history(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
