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
