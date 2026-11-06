USE mls_db;

ALTER TABLE import_jobs
  MODIFY COLUMN status ENUM(
    'UPLOADED',
    'VALIDATING',
    'INVALID',
    'READY_FOR_REVIEW',
    'TECHNICALLY_APPROVED',
    'REJECTED',
    'PUBLISHED',
    'FAILED'
  ) NOT NULL DEFAULT 'UPLOADED';

CREATE TABLE IF NOT EXISTS import_reviews (
  id CHAR(36) NOT NULL,
  import_job_id CHAR(36) NOT NULL,
  reviewer_id VARCHAR(160) NOT NULL,
  review_scope ENUM('TECHNICAL') NOT NULL DEFAULT 'TECHNICAL',
  decision ENUM('APPROVE', 'REJECT') NOT NULL,
  reason TEXT NOT NULL,
  validation_report_sha256 CHAR(64) NOT NULL,
  actor_source ENUM('DEVELOPMENT_HEADER', 'AUTHENTICATED_USER') NOT NULL DEFAULT 'DEVELOPMENT_HEADER',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_import_reviews_job (import_job_id),
  KEY idx_import_reviews_reviewer (reviewer_id, created_at),
  CONSTRAINT fk_import_reviews_job FOREIGN KEY (import_job_id) REFERENCES import_jobs(id)
) ENGINE=InnoDB;
