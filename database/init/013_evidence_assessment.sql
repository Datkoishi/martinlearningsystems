USE mls_db;

CREATE TABLE IF NOT EXISTS assessment_definitions (
  id CHAR(36) NOT NULL,
  stable_key VARCHAR(160) NOT NULL,
  created_by_user_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assessment_definitions_stable_key (stable_key),
  KEY idx_assessment_definitions_creator (created_by_user_id, created_at),
  CONSTRAINT fk_assessment_definitions_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assessment_framework_versions (
  id CHAR(36) NOT NULL,
  assessment_definition_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  schema_version VARCHAR(30) NOT NULL,
  framework_purpose ENUM('CURRICULUM_LEARNING', 'GENERAL_COMPETENCY', 'EXAM_READINESS') NOT NULL,
  grade SMALLINT UNSIGNED NOT NULL,
  subject VARCHAR(120) NOT NULL,
  source_exam_purpose ENUM('PRACTICE', 'MOCK_EXAM', 'DIAGNOSTIC') NOT NULL,
  config_json JSON NOT NULL,
  config_sha256 CHAR(64) NOT NULL,
  approval_status ENUM('NEEDS_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'NEEDS_REVIEW',
  created_by_user_id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  request_sha256 CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assessment_framework_version (assessment_definition_id, version_number),
  UNIQUE KEY uq_assessment_framework_creator_key (created_by_user_id, idempotency_key),
  KEY idx_assessment_framework_available
    (approval_status, grade, subject, framework_purpose, source_exam_purpose, created_at),
  CONSTRAINT chk_assessment_framework_grade CHECK (grade BETWEEN 1 AND 12),
  CONSTRAINT fk_assessment_framework_definition
    FOREIGN KEY (assessment_definition_id) REFERENCES assessment_definitions(id),
  CONSTRAINT fk_assessment_framework_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assessment_framework_reviews (
  id CHAR(36) NOT NULL,
  framework_version_id CHAR(36) NOT NULL,
  reviewer_user_id CHAR(36) NOT NULL,
  decision ENUM('APPROVE', 'REJECT') NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  config_sha256 CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assessment_framework_review (framework_version_id),
  KEY idx_assessment_framework_reviewer (reviewer_user_id, created_at),
  CONSTRAINT fk_assessment_framework_review_version
    FOREIGN KEY (framework_version_id) REFERENCES assessment_framework_versions(id),
  CONSTRAINT fk_assessment_framework_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assessment_results (
  id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NOT NULL,
  framework_version_id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  request_sha256 CHAR(64) NOT NULL,
  result_state ENUM('INSUFFICIENT_EVIDENCE', 'CLASSIFIED') NOT NULL,
  evidence_snapshot_json JSON NOT NULL,
  interpretation_json JSON NOT NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  generated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assessment_results_student_key (student_user_id, idempotency_key),
  KEY idx_assessment_results_student_framework
    (student_user_id, framework_version_id, generated_at),
  CONSTRAINT fk_assessment_results_student FOREIGN KEY (student_user_id) REFERENCES users(id),
  CONSTRAINT fk_assessment_results_framework
    FOREIGN KEY (framework_version_id) REFERENCES assessment_framework_versions(id)
) ENGINE=InnoDB;
