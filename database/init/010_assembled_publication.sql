USE mls_db;

ALTER TABLE exams
  MODIFY COLUMN source_id CHAR(36) NULL;

CREATE TABLE IF NOT EXISTS exam_blueprints (
  id CHAR(36) NOT NULL,
  stable_key VARCHAR(160) NOT NULL,
  created_by_user_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exam_blueprints_stable_key (stable_key),
  KEY idx_exam_blueprints_creator (created_by_user_id, created_at),
  CONSTRAINT fk_exam_blueprints_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exam_blueprint_versions (
  id CHAR(36) NOT NULL,
  blueprint_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  schema_version VARCHAR(30) NOT NULL,
  blueprint_json JSON NOT NULL,
  approval_status ENUM('NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED') NOT NULL DEFAULT 'NEEDS_REVIEW',
  created_by_user_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exam_blueprint_versions_number (blueprint_id, version_number),
  KEY idx_exam_blueprint_versions_status (approval_status, created_at),
  CONSTRAINT fk_exam_blueprint_versions_blueprint FOREIGN KEY (blueprint_id) REFERENCES exam_blueprints(id),
  CONSTRAINT fk_exam_blueprint_versions_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE assembly_runs
  ADD COLUMN blueprint_version_id CHAR(36) NULL AFTER created_by_user_id;

INSERT IGNORE INTO exam_blueprints
  (id, stable_key, created_by_user_id, created_at)
SELECT id, CONCAT('assembly-run:', id), created_by_user_id, created_at
FROM assembly_runs;

INSERT IGNORE INTO exam_blueprint_versions
  (id, blueprint_id, version_number, schema_version, blueprint_json,
   approval_status, created_by_user_id, created_at)
SELECT id, id, 1, '1.0.0', blueprint_json,
       'REJECTED', created_by_user_id, created_at
FROM assembly_runs;

UPDATE assembly_runs
SET blueprint_version_id = id
WHERE blueprint_version_id IS NULL;

ALTER TABLE assembly_runs
  MODIFY COLUMN blueprint_version_id CHAR(36) NOT NULL,
  ADD UNIQUE KEY uq_assembly_runs_blueprint_version (blueprint_version_id),
  ADD CONSTRAINT fk_assembly_runs_blueprint_version
    FOREIGN KEY (blueprint_version_id) REFERENCES exam_blueprint_versions(id);

CREATE TABLE IF NOT EXISTS assembly_reviews (
  id CHAR(36) NOT NULL,
  assembly_run_id CHAR(36) NOT NULL,
  blueprint_version_id CHAR(36) NOT NULL,
  reviewer_user_id CHAR(36) NOT NULL,
  decision ENUM('APPROVE', 'REJECT') NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  selection_sha256 CHAR(64) NOT NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assembly_reviews_run (assembly_run_id),
  KEY idx_assembly_reviews_reviewer (reviewer_user_id, created_at),
  CONSTRAINT fk_assembly_reviews_run FOREIGN KEY (assembly_run_id) REFERENCES assembly_runs(id),
  CONSTRAINT fk_assembly_reviews_blueprint FOREIGN KEY (blueprint_version_id) REFERENCES exam_blueprint_versions(id),
  CONSTRAINT fk_assembly_reviews_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assembly_publications (
  id CHAR(36) NOT NULL,
  assembly_run_id CHAR(36) NOT NULL,
  blueprint_version_id CHAR(36) NOT NULL,
  exam_version_id CHAR(36) NOT NULL,
  published_by_user_id CHAR(36) NOT NULL,
  selection_sha256 CHAR(64) NOT NULL,
  source_snapshot_sha256 CHAR(64) NOT NULL,
  student_snapshot_json JSON NOT NULL,
  scoring_snapshot_json JSON NOT NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  published_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assembly_publications_run (assembly_run_id),
  UNIQUE KEY uq_assembly_publications_blueprint (blueprint_version_id),
  UNIQUE KEY uq_assembly_publications_exam_version (exam_version_id),
  KEY idx_assembly_publications_publisher (published_by_user_id, published_at),
  CONSTRAINT fk_assembly_publications_run FOREIGN KEY (assembly_run_id) REFERENCES assembly_runs(id),
  CONSTRAINT fk_assembly_publications_blueprint FOREIGN KEY (blueprint_version_id) REFERENCES exam_blueprint_versions(id),
  CONSTRAINT fk_assembly_publications_exam_version FOREIGN KEY (exam_version_id) REFERENCES exam_versions(id),
  CONSTRAINT fk_assembly_publications_publisher FOREIGN KEY (published_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
