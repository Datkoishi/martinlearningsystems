USE mls_db;

ALTER TABLE import_jobs
  MODIFY COLUMN status ENUM(
    'UPLOADED',
    'VALIDATING',
    'INVALID',
    'READY_FOR_REVIEW',
    'TECHNICALLY_APPROVED',
    'ACADEMICALLY_APPROVED',
    'ACADEMICALLY_REJECTED',
    'REJECTED',
    'PUBLISHED',
    'FAILED'
  ) NOT NULL DEFAULT 'UPLOADED';

ALTER TABLE import_reviews
  MODIFY COLUMN review_scope ENUM('TECHNICAL', 'ACADEMIC') NOT NULL DEFAULT 'TECHNICAL',
  ADD COLUMN package_sha256 CHAR(64) NULL AFTER validation_report_sha256,
  DROP INDEX uq_import_reviews_job,
  ADD UNIQUE KEY uq_import_reviews_job_scope (import_job_id, review_scope);

CREATE TABLE IF NOT EXISTS import_publications (
  id CHAR(36) NOT NULL,
  import_job_id CHAR(36) NOT NULL,
  exam_version_id CHAR(36) NOT NULL,
  published_by_user_id CHAR(36) NOT NULL,
  package_sha256 CHAR(64) NOT NULL,
  validation_report_sha256 CHAR(64) NOT NULL,
  published_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_import_publications_job (import_job_id),
  UNIQUE KEY uq_import_publications_exam_version (exam_version_id),
  KEY idx_import_publications_actor (published_by_user_id, published_at),
  CONSTRAINT fk_import_publications_job FOREIGN KEY (import_job_id) REFERENCES import_jobs(id),
  CONSTRAINT fk_import_publications_exam_version FOREIGN KEY (exam_version_id) REFERENCES exam_versions(id),
  CONSTRAINT fk_import_publications_actor FOREIGN KEY (published_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
