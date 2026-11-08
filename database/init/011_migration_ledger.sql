USE mls_db;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) NOT NULL,
  sequence_number INT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  operation ENUM('APPLIED', 'ADOPTED', 'SKIPPED', 'BOOTSTRAPPED') NOT NULL,
  execution_ms INT UNSIGNED NOT NULL DEFAULT 0,
  applied_by VARCHAR(160) NOT NULL,
  applied_at DATETIME(6) NOT NULL,
  PRIMARY KEY (version),
  UNIQUE KEY uq_schema_migrations_sequence (sequence_number)
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_migrations
  (version, sequence_number, checksum_sha256, operation, execution_ms, applied_by, applied_at)
VALUES
  ('001_init.sql', 1, 'b81e28deabed0aed0bc20c449dafb499ecc8425df78e8b37d95db324615e22d1', 'BOOTSTRAPPED', 0, 'mysql-entrypoint', NOW(6)),
  ('002_eduassess_foundation.sql', 2, 'ff0c51cf0b3a7f34c61a3a5aa3ea8f51d17c9eb2735fa175f872317f3e67e7a8', 'BOOTSTRAPPED', 0, 'mysql-entrypoint', NOW(6)),
  ('003_demo_fixed_exam.sql', 3, '9f8b27729d1f838269fc22b12972c1d10df9dce7407a237f3da3e21548b78e98', 'BOOTSTRAPPED', 0, 'mysql-entrypoint', NOW(6)),
  ('004_import_reviews.sql', 4, '82d885743aae910a4f25bc2f219b90e85c5e2ade6f5641dd0b606b20d20d0cb4', 'BOOTSTRAPPED', 0, 'mysql-entrypoint', NOW(6)),
  ('005_identity_access.sql', 5, '55dfdd5a28ac8008e9e1365f0708c6fb01864bdacbf1ff2c5d58e05fcd318e49', 'BOOTSTRAPPED', 0, 'mysql-entrypoint', NOW(6)),
  ('006_academic_publish.sql', 6, '371c3040012fa6ec0380d83c020327ceb351f7c4745ba9dc5d2b105a047887e6', 'BOOTSTRAPPED', 0, 'mysql-entrypoint', NOW(6)),
  ('007_attempt_snapshots.sql', 7, '8f3dea383506cc8a61ad6c7b4d6d773b2991775fe5e4bff0f90ddc207d257e53', 'BOOTSTRAPPED', 0, 'mysql-entrypoint', NOW(6)),
  ('008_attempt_scoring.sql', 8, '7d0e3014b333691a3ee81a07c4e875ac1ba65e0b4ee0949012f4209020ae373e', 'BOOTSTRAPPED', 0, 'mysql-entrypoint', NOW(6)),
  ('009_assembly_foundation.sql', 9, '3c2ee8cf9dfaf8669e549183d93e398f762f24abf6ba047167c8c6db2a895296', 'BOOTSTRAPPED', 0, 'mysql-entrypoint', NOW(6)),
  ('010_assembled_publication.sql', 10, 'c2dddcbe86c645fc909310a9a71ba6b3e9a9962d694fa81490d0963cc83921f2', 'BOOTSTRAPPED', 0, 'mysql-entrypoint', NOW(6));
