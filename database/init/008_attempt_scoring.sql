USE mls_db;

ALTER TABLE exam_attempts
  ADD COLUMN answer_revision INT UNSIGNED NOT NULL DEFAULT 0 AFTER snapshot_sha256,
  ADD COLUMN last_saved_at DATETIME(6) NULL AFTER answer_revision,
  ADD COLUMN current_score_revision INT UNSIGNED NULL AFTER submitted_at;

CREATE TABLE IF NOT EXISTS attempt_responses (
  attempt_id CHAR(36) NOT NULL,
  question_version_id CHAR(36) NOT NULL,
  answer_json JSON NOT NULL,
  saved_revision INT UNSIGNED NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (attempt_id, question_version_id),
  KEY idx_attempt_responses_question (question_version_id),
  CONSTRAINT fk_attempt_responses_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id),
  CONSTRAINT fk_attempt_responses_question FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attempt_score_revisions (
  id CHAR(36) NOT NULL,
  attempt_id CHAR(36) NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  scoring_state ENUM('PENDING', 'FINAL', 'REGRADING') NOT NULL,
  scoring_version VARCHAR(80) NOT NULL,
  result_json JSON NOT NULL,
  reason VARCHAR(1000) NULL,
  created_by_type ENUM('SYSTEM', 'USER') NOT NULL,
  created_by_user_id CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attempt_score_revision (attempt_id, revision_number),
  KEY idx_attempt_score_state (scoring_state, created_at),
  CONSTRAINT fk_attempt_score_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id),
  CONSTRAINT fk_attempt_score_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attempt_operations (
  id CHAR(36) NOT NULL,
  attempt_id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NOT NULL,
  operation_type ENUM('AUTOSAVE', 'SUBMIT') NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  request_sha256 CHAR(64) NOT NULL,
  response_json JSON NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attempt_operations_student_key (student_user_id, operation_type, idempotency_key),
  KEY idx_attempt_operations_attempt (attempt_id, operation_type, created_at),
  CONSTRAINT fk_attempt_operations_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id),
  CONSTRAINT fk_attempt_operations_student FOREIGN KEY (student_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
