USE mls_db;

ALTER TABLE question_versions
  ADD COLUMN curriculum_version VARCHAR(80) NULL AFTER subject,
  ADD COLUMN topic_key VARCHAR(160) NULL AFTER curriculum_version,
  ADD COLUMN skill_key VARCHAR(160) NULL AFTER topic_key,
  ADD COLUMN difficulty ENUM('EASY', 'MEDIUM', 'HARD') NULL AFTER skill_key,
  ADD COLUMN estimated_seconds SMALLINT UNSIGNED NULL AFTER difficulty,
  ADD COLUMN family_key VARCHAR(160) NULL AFTER estimated_seconds,
  ADD KEY idx_question_versions_assembly_pool
    (grade, subject, curriculum_version, approval_status, difficulty),
  ADD KEY idx_question_versions_assembly_topic (topic_key, approval_status),
  ADD KEY idx_question_versions_assembly_skill (skill_key, approval_status),
  ADD KEY idx_question_versions_family (family_key);

CREATE TABLE IF NOT EXISTS assembly_runs (
  id CHAR(36) NOT NULL,
  created_by_user_id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  request_sha256 CHAR(64) NOT NULL,
  status ENUM('SUCCEEDED') NOT NULL,
  blueprint_json JSON NOT NULL,
  seed VARCHAR(128) NOT NULL,
  engine_version VARCHAR(80) NOT NULL,
  selection_sha256 CHAR(64) NOT NULL,
  selection_manifest_json JSON NOT NULL,
  source_distribution_json JSON NOT NULL,
  student_snapshot_json JSON NOT NULL,
  scoring_snapshot_json JSON NOT NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assembly_runs_creator_key (created_by_user_id, idempotency_key),
  KEY idx_assembly_runs_creator_created (created_by_user_id, created_at),
  KEY idx_assembly_runs_selection (selection_sha256),
  CONSTRAINT fk_assembly_runs_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
