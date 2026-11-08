USE mls_db;

ALTER TABLE media_assets
  ADD COLUMN storage_backend ENUM('ARCHIVE', 'OBJECT') NOT NULL DEFAULT 'ARCHIVE' AFTER storage_key,
  ADD COLUMN object_storage_key VARCHAR(700) NULL AFTER storage_backend,
  ADD COLUMN object_promoted_at DATETIME(6) NULL AFTER object_storage_key,
  ADD COLUMN object_rolled_back_at DATETIME(6) NULL AFTER object_promoted_at,
  ADD KEY idx_media_assets_storage_backend (storage_backend, object_rolled_back_at, id),
  ADD CONSTRAINT chk_media_assets_object_key
    CHECK (storage_backend = 'ARCHIVE' OR object_storage_key IS NOT NULL);

CREATE TABLE IF NOT EXISTS media_asset_storage_events (
  id CHAR(36) NOT NULL,
  asset_id CHAR(36) NOT NULL,
  event_type ENUM('PROMOTED', 'ROLLED_BACK') NOT NULL,
  from_backend ENUM('ARCHIVE', 'OBJECT') NOT NULL,
  to_backend ENUM('ARCHIVE', 'OBJECT') NOT NULL,
  archive_storage_key VARCHAR(500) NOT NULL,
  object_storage_key VARCHAR(700) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  actor VARCHAR(160) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_media_storage_events_asset (asset_id, created_at),
  CONSTRAINT fk_media_storage_events_asset FOREIGN KEY (asset_id) REFERENCES media_assets(id)
) ENGINE=InnoDB;
