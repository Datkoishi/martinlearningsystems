import { randomUUID } from 'node:crypto';

const mapAsset = (row) => row && ({
  id: row.id,
  storageKey: row.storage_key,
  storageBackend: row.storage_backend,
  objectStorageKey: row.object_storage_key,
  objectPromotedAt: row.object_promoted_at,
  objectRolledBackAt: row.object_rolled_back_at,
  mimeType: row.mime_type,
  sha256: row.sha256,
  sizeBytes: Number(row.size_bytes),
  approvalStatus: row.approval_status
});

const promotionError = (code, message) => Object.assign(new Error(message), { code });

const selectAssetForUpdate = async (connection, assetId) => {
  const [rows] = await connection.execute(
    `SELECT id, storage_key, storage_backend, object_storage_key, object_promoted_at,
            object_rolled_back_at, mime_type, sha256, size_bytes, approval_status
     FROM media_assets
     WHERE id = ?
     FOR UPDATE`,
    [assetId]
  );
  return mapAsset(rows[0]);
};

export class MysqlMediaPromotionRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findAssetById(assetId) {
    const [rows] = await this.pool.execute(
      `SELECT id, storage_key, storage_backend, object_storage_key, object_promoted_at,
              object_rolled_back_at, mime_type, sha256, size_bytes, approval_status
       FROM media_assets
       WHERE id = ?
       LIMIT 1`,
      [assetId]
    );
    return mapAsset(rows[0]);
  }

  async listPromotionCandidates(limit) {
    const parsedLimit = Number(limit);
    const safeLimit = Number.isSafeInteger(parsedLimit)
      ? Math.max(1, Math.min(1000, parsedLimit))
      : 100;
    const [rows] = await this.pool.query(
      `SELECT id, storage_key, storage_backend, object_storage_key, object_promoted_at,
              object_rolled_back_at, mime_type, sha256, size_bytes, approval_status
       FROM media_assets
       WHERE approval_status = 'PUBLISHED'
         AND storage_backend = 'ARCHIVE'
         AND object_rolled_back_at IS NULL
       ORDER BY id
       LIMIT ${safeLimit}`
    );
    return rows.map(mapAsset);
  }

  async markPromoted({ asset, objectStorageKey, actor, allowRolledBack = false }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const current = await selectAssetForUpdate(connection, asset.id);
      if (!current) throw promotionError('MEDIA_ASSET_NOT_FOUND', 'Không tìm thấy media asset.');
      if (current.approvalStatus !== 'PUBLISHED') {
        throw promotionError('MEDIA_ASSET_NOT_PUBLISHED', 'Chỉ asset PUBLISHED mới được promote.');
      }
      if (current.storageKey !== asset.storageKey || current.sha256 !== asset.sha256 || current.sizeBytes !== asset.sizeBytes) {
        throw promotionError('MEDIA_ASSET_CHANGED', 'Media asset đã thay đổi trong lúc promotion.');
      }
      if (current.storageBackend === 'OBJECT') {
        if (current.objectStorageKey !== objectStorageKey) {
          throw promotionError('MEDIA_ASSET_OBJECT_CONFLICT', 'Asset đã trỏ sang object key khác.');
        }
        await connection.commit();
        return { changed: false, asset: current };
      }
      if (current.objectRolledBackAt && !allowRolledBack) {
        throw promotionError('MEDIA_ASSET_ROLLED_BACK', 'Asset đã rollback; cần flag rõ để promote lại.');
      }

      await connection.execute(
        `UPDATE media_assets
         SET storage_backend = 'OBJECT', object_storage_key = ?, object_promoted_at = NOW(6),
             object_rolled_back_at = NULL
         WHERE id = ?`,
        [objectStorageKey, current.id]
      );
      await connection.execute(
        `INSERT INTO media_asset_storage_events
          (id, asset_id, event_type, from_backend, to_backend, archive_storage_key,
           object_storage_key, sha256, size_bytes, actor)
         VALUES (?, ?, 'PROMOTED', 'ARCHIVE', 'OBJECT', ?, ?, ?, ?, ?)`,
        [randomUUID(), current.id, current.storageKey, objectStorageKey, current.sha256, current.sizeBytes, actor]
      );
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, NULL, 'MEDIA_ASSET_PROMOTED', 'MEDIA_ASSET', ?, 'SUCCESS', CAST(? AS JSON))`,
        [randomUUID(), current.id, JSON.stringify({ from: 'ARCHIVE', to: 'OBJECT' })]
      );
      await connection.commit();
      return { changed: true, asset: { ...current, storageBackend: 'OBJECT', objectStorageKey } };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async markRolledBack({ asset, actor }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const current = await selectAssetForUpdate(connection, asset.id);
      if (!current) throw promotionError('MEDIA_ASSET_NOT_FOUND', 'Không tìm thấy media asset.');
      if (current.storageKey !== asset.storageKey || current.sha256 !== asset.sha256
        || current.sizeBytes !== asset.sizeBytes || current.objectStorageKey !== asset.objectStorageKey) {
        throw promotionError('MEDIA_ASSET_CHANGED', 'Media asset đã thay đổi trong lúc rollback verification.');
      }
      if (current.storageBackend === 'ARCHIVE') {
        if (current.objectRolledBackAt) {
          await connection.commit();
          return { changed: false, asset: current };
        }
        throw promotionError('MEDIA_ASSET_NOT_PROMOTED', 'Asset chưa trỏ sang object storage.');
      }
      if (!current.objectStorageKey) throw promotionError('MEDIA_ASSET_OBJECT_KEY_MISSING', 'Asset OBJECT thiếu object key.');

      await connection.execute(
        `UPDATE media_assets
         SET storage_backend = 'ARCHIVE', object_rolled_back_at = NOW(6)
         WHERE id = ?`,
        [current.id]
      );
      await connection.execute(
        `INSERT INTO media_asset_storage_events
          (id, asset_id, event_type, from_backend, to_backend, archive_storage_key,
           object_storage_key, sha256, size_bytes, actor)
         VALUES (?, ?, 'ROLLED_BACK', 'OBJECT', 'ARCHIVE', ?, ?, ?, ?, ?)`,
        [randomUUID(), current.id, current.storageKey, current.objectStorageKey, current.sha256, current.sizeBytes, actor]
      );
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, NULL, 'MEDIA_ASSET_STORAGE_ROLLED_BACK', 'MEDIA_ASSET', ?, 'SUCCESS', CAST(? AS JSON))`,
        [randomUUID(), current.id, JSON.stringify({ from: 'OBJECT', to: 'ARCHIVE' })]
      );
      await connection.commit();
      return { changed: true, asset: { ...current, storageBackend: 'ARCHIVE' } };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getStatus() {
    const [rows] = await this.pool.query(
      `SELECT
         SUM(approval_status = 'PUBLISHED' AND storage_backend = 'ARCHIVE' AND object_rolled_back_at IS NULL) AS pending,
         SUM(approval_status = 'PUBLISHED' AND storage_backend = 'OBJECT') AS active,
         SUM(approval_status = 'PUBLISHED' AND storage_backend = 'ARCHIVE' AND object_rolled_back_at IS NOT NULL) AS rolled_back,
         COUNT(*) AS total
       FROM media_assets`
    );
    const [eventRows] = await this.pool.query('SELECT COUNT(*) AS count FROM media_asset_storage_events');
    return {
      pending: Number(rows[0]?.pending || 0),
      active: Number(rows[0]?.active || 0),
      rolledBack: Number(rows[0]?.rolled_back || 0),
      total: Number(rows[0]?.total || 0),
      events: Number(eventRows[0]?.count || 0)
    };
  }
}
