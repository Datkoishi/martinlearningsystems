USE mls_db;

CREATE TABLE IF NOT EXISTS exam_attempts (
  id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NOT NULL,
  exam_version_id CHAR(36) NOT NULL,
  status ENUM('IN_PROGRESS', 'SUBMITTED', 'PENDING_MANUAL_SCORING', 'SCORED', 'VOIDED') NOT NULL DEFAULT 'IN_PROGRESS',
  idempotency_key VARCHAR(100) NOT NULL,
  student_snapshot_json JSON NOT NULL,
  scoring_snapshot_json JSON NOT NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  started_at DATETIME(6) NOT NULL,
  submitted_at DATETIME(6) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exam_attempts_student_idempotency (student_user_id, idempotency_key),
  KEY idx_exam_attempts_student_status (student_user_id, status, started_at),
  KEY idx_exam_attempts_exam_version (exam_version_id, status),
  CONSTRAINT fk_exam_attempts_student FOREIGN KEY (student_user_id) REFERENCES users(id),
  CONSTRAINT fk_exam_attempts_exam_version FOREIGN KEY (exam_version_id) REFERENCES exam_versions(id)
) ENGINE=InnoDB;
