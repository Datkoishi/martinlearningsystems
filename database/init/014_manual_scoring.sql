USE mls_db;

ALTER TABLE user_roles
  MODIFY COLUMN role ENUM(
    'STUDENT',
    'GUARDIAN',
    'TEACHER',
    'SCHOOL_ADMIN',
    'CONTENT_EDITOR',
    'ACADEMIC_REVIEWER',
    'ASSESSMENT_SPECIALIST',
    'MANUAL_GRADER',
    'SUPER_ADMIN',
    'SUPPORT_OPERATOR',
    'DATA_PROTECTION_RESPONSIBLE',
    'FORMAL_ASSESSMENT_APPROVER'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS attempt_grading_assignments (
  id CHAR(36) NOT NULL,
  attempt_id CHAR(36) NOT NULL,
  assignment_type ENUM('INITIAL', 'REGRADE') NOT NULL,
  source_score_revision INT UNSIGNED NOT NULL,
  assigned_to_user_id CHAR(36) NOT NULL,
  assigned_by_user_id CHAR(36) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  status ENUM('OPEN', 'COMPLETED') NOT NULL DEFAULT 'OPEN',
  completed_score_revision INT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL,
  completed_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attempt_grading_source (attempt_id, source_score_revision, assignment_type),
  KEY idx_attempt_grading_assignee (assigned_to_user_id, status, created_at),
  CONSTRAINT fk_attempt_grading_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id),
  CONSTRAINT fk_attempt_grading_assignee FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
  CONSTRAINT fk_attempt_grading_assigner FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS manual_scoring_operations (
  id CHAR(36) NOT NULL,
  assignment_id CHAR(36) NOT NULL,
  grader_user_id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  request_sha256 CHAR(64) NOT NULL,
  response_json JSON NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_manual_scoring_grader_key (grader_user_id, idempotency_key),
  KEY idx_manual_scoring_assignment (assignment_id, created_at),
  CONSTRAINT fk_manual_scoring_assignment
    FOREIGN KEY (assignment_id) REFERENCES attempt_grading_assignments(id),
  CONSTRAINT fk_manual_scoring_grader FOREIGN KEY (grader_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
