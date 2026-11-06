USE mls_db;

CREATE TABLE IF NOT EXISTS content_sources (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  origin_type ENUM('AI_GENERATED', 'OFFICIAL_IMPORTED', 'HUMAN_AUTHORED', 'PARTNER_PROVIDED') NOT NULL,
  generator_metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usage_licenses (
  id CHAR(36) NOT NULL,
  source_id CHAR(36) NOT NULL,
  label VARCHAR(255) NOT NULL,
  publish_fixed BOOLEAN NOT NULL DEFAULT FALSE,
  extract_reuse BOOLEAN NOT NULL DEFAULT FALSE,
  derivative_assembly BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from DATETIME NULL,
  valid_until DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_usage_licenses_source (source_id),
  CONSTRAINT fk_usage_licenses_source FOREIGN KEY (source_id) REFERENCES content_sources(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS media_assets (
  id CHAR(36) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  duration_seconds DECIMAL(10,3) NULL,
  alt_text VARCHAR(1000) NOT NULL,
  approval_status ENUM('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_media_assets_storage_key (storage_key),
  KEY idx_media_assets_sha256 (sha256),
  KEY idx_media_assets_approval (approval_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exams (
  id CHAR(36) NOT NULL,
  source_id CHAR(36) NOT NULL,
  stable_key VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exams_stable_key (stable_key),
  KEY idx_exams_source (source_id),
  CONSTRAINT fk_exams_source FOREIGN KEY (source_id) REFERENCES content_sources(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exam_versions (
  id CHAR(36) NOT NULL,
  exam_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  exam_mode ENUM('FIXED', 'ASSEMBLED') NOT NULL,
  purpose ENUM('PRACTICE', 'MOCK_EXAM', 'DIAGNOSTIC', 'FORMAL_ASSESSMENT') NOT NULL,
  approval_status ENUM('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  grade SMALLINT UNSIGNED NOT NULL,
  subject VARCHAR(120) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  schema_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  published_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exam_versions_number (exam_id, version_number),
  KEY idx_exam_versions_catalog (grade, subject, exam_mode, approval_status),
  CONSTRAINT chk_exam_versions_grade CHECK (grade BETWEEN 1 AND 12),
  CONSTRAINT fk_exam_versions_exam FOREIGN KEY (exam_id) REFERENCES exams(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exam_sections (
  id CHAR(36) NOT NULL,
  exam_version_id CHAR(36) NOT NULL,
  position INT UNSIGNED NOT NULL,
  title VARCHAR(500) NOT NULL,
  instruction_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exam_sections_position (exam_version_id, position),
  CONSTRAINT fk_exam_sections_version FOREIGN KEY (exam_version_id) REFERENCES exam_versions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stimuli (
  id CHAR(36) NOT NULL,
  stable_key VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stimuli_stable_key (stable_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stimulus_versions (
  id CHAR(36) NOT NULL,
  stimulus_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  title VARCHAR(500) NULL,
  content_json JSON NOT NULL,
  schema_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  approval_status ENUM('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stimulus_versions_number (stimulus_id, version_number),
  CONSTRAINT fk_stimulus_versions_stimulus FOREIGN KEY (stimulus_id) REFERENCES stimuli(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_groups (
  id CHAR(36) NOT NULL,
  stable_key VARCHAR(160) NOT NULL,
  stimulus_version_id CHAR(36) NULL,
  selection_policy ENUM('ATOMIC_ALL', 'SPLIT_WITH_STIMULUS') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_question_groups_stable_key (stable_key),
  CONSTRAINT fk_question_groups_stimulus FOREIGN KEY (stimulus_version_id) REFERENCES stimulus_versions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS questions (
  id CHAR(36) NOT NULL,
  stable_key VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_questions_stable_key (stable_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_versions (
  id CHAR(36) NOT NULL,
  question_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  question_type ENUM('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_NUMBER', 'SHORT_TEXT', 'ESSAY') NOT NULL,
  content_json JSON NOT NULL,
  answer_key_json JSON NOT NULL,
  explanation_json JSON NULL,
  points DECIMAL(8,2) NOT NULL,
  grade SMALLINT UNSIGNED NOT NULL,
  subject VARCHAR(120) NOT NULL,
  schema_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
  approval_status ENUM('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_question_versions_number (question_id, version_number),
  KEY idx_question_versions_pool (grade, subject, question_type, approval_status),
  CONSTRAINT chk_question_versions_grade CHECK (grade BETWEEN 1 AND 12),
  CONSTRAINT chk_question_versions_points CHECK (points > 0),
  CONSTRAINT fk_question_versions_question FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_options (
  id CHAR(36) NOT NULL,
  question_version_id CHAR(36) NOT NULL,
  option_key VARCHAR(80) NOT NULL,
  position INT UNSIGNED NOT NULL,
  content_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_question_options_key (question_version_id, option_key),
  UNIQUE KEY uq_question_options_position (question_version_id, position),
  CONSTRAINT fk_question_options_version FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_group_items (
  group_id CHAR(36) NOT NULL,
  question_version_id CHAR(36) NOT NULL,
  position INT UNSIGNED NOT NULL,
  PRIMARY KEY (group_id, question_version_id),
  UNIQUE KEY uq_question_group_items_position (group_id, position),
  CONSTRAINT fk_question_group_items_group FOREIGN KEY (group_id) REFERENCES question_groups(id),
  CONSTRAINT fk_question_group_items_question FOREIGN KEY (question_version_id) REFERENCES question_versions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exam_items (
  id CHAR(36) NOT NULL,
  exam_section_id CHAR(36) NOT NULL,
  position INT UNSIGNED NOT NULL,
  question_version_id CHAR(36) NULL,
  question_group_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exam_items_position (exam_section_id, position),
  CONSTRAINT chk_exam_items_one_target CHECK ((question_version_id IS NULL) <> (question_group_id IS NULL)),
  CONSTRAINT fk_exam_items_section FOREIGN KEY (exam_section_id) REFERENCES exam_sections(id),
  CONSTRAINT fk_exam_items_question FOREIGN KEY (question_version_id) REFERENCES question_versions(id),
  CONSTRAINT fk_exam_items_group FOREIGN KEY (question_group_id) REFERENCES question_groups(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS source_provenance (
  question_version_id CHAR(36) NOT NULL,
  source_id CHAR(36) NOT NULL,
  license_id CHAR(36) NOT NULL,
  relation_type ENUM('PRIMARY', 'ADAPTED_FROM', 'SUPPORTING') NOT NULL DEFAULT 'PRIMARY',
  PRIMARY KEY (question_version_id, source_id),
  CONSTRAINT fk_source_provenance_question FOREIGN KEY (question_version_id) REFERENCES question_versions(id),
  CONSTRAINT fk_source_provenance_source FOREIGN KEY (source_id) REFERENCES content_sources(id),
  CONSTRAINT fk_source_provenance_license FOREIGN KEY (license_id) REFERENCES usage_licenses(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS asset_references (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id CHAR(36) NOT NULL,
  owner_type ENUM('STIMULUS_VERSION', 'QUESTION_VERSION', 'QUESTION_OPTION', 'EXPLANATION', 'EXAM_SECTION') NOT NULL,
  owner_id CHAR(36) NOT NULL,
  json_path VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_reference_location (asset_id, owner_type, owner_id, json_path),
  KEY idx_asset_references_owner (owner_type, owner_id),
  CONSTRAINT fk_asset_references_asset FOREIGN KEY (asset_id) REFERENCES media_assets(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS import_jobs (
  id CHAR(36) NOT NULL,
  package_id VARCHAR(255) NOT NULL,
  package_sha256 CHAR(64) NOT NULL,
  status ENUM('UPLOADED', 'VALIDATING', 'INVALID', 'READY_FOR_REVIEW', 'PUBLISHED', 'FAILED') NOT NULL DEFAULT 'UPLOADED',
  schema_version VARCHAR(30) NOT NULL,
  source_storage_key VARCHAR(500) NOT NULL,
  validation_report_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_import_jobs_package_hash (package_id, package_sha256),
  KEY idx_import_jobs_status (status)
) ENGINE=InnoDB;
