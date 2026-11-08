import crypto from 'node:crypto';

export class MediaPromotionError extends Error {
  constructor(code, message, cause = undefined) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MediaPromotionError';
    this.code = code;
  }
}

const isUuid = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const bytesMatch = (data, asset) => (
  data
  && data.length === asset.sizeBytes
  && crypto.createHash('sha256').update(data).digest('hex') === asset.sha256
);

export class MediaPromotionService {
  constructor({ repository, archiveStorage, objectStorage = null, actor = 'eduassess-media-promoter' }) {
    this.repository = repository;
    this.archiveStorage = archiveStorage;
    this.objectStorage = objectStorage;
    this.actor = actor;
    if (!/^[A-Za-z0-9._:@/-]{1,160}$/.test(actor)) {
      throw new MediaPromotionError('MEDIA_PROMOTION_ACTOR_INVALID', 'MEDIA_PROMOTION_ACTOR không hợp lệ.');
    }
  }

  async status() {
    return this.repository.getStatus();
  }

  async promoteBatch({ limit = 100, dryRun = false } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new MediaPromotionError('MEDIA_PROMOTION_LIMIT_INVALID', 'Limit phải nằm trong khoảng 1–1000.');
    }
    const candidates = await this.repository.listPromotionCandidates(limit);
    const results = [];
    for (const asset of candidates) results.push(await this.promoteAsset(asset.id, { dryRun }));
    return { requested: candidates.length, promoted: results.filter((result) => result.changed).length, results };
  }

  async promoteAsset(assetId, { allowRolledBack = false, dryRun = false } = {}) {
    if (!isUuid(assetId)) throw new MediaPromotionError('MEDIA_ASSET_ID_INVALID', 'Media asset id không hợp lệ.');
    if (!this.objectStorage) throw new MediaPromotionError('OBJECT_STORAGE_DISABLED', 'Object storage chưa được bật.');
    const asset = await this.repository.findAssetById(assetId);
    if (!asset) throw new MediaPromotionError('MEDIA_ASSET_NOT_FOUND', 'Không tìm thấy media asset.');
    if (asset.approvalStatus !== 'PUBLISHED') {
      throw new MediaPromotionError('MEDIA_ASSET_NOT_PUBLISHED', 'Chỉ asset PUBLISHED mới được promote.');
    }
    if (asset.objectRolledBackAt && !allowRolledBack) {
      throw new MediaPromotionError('MEDIA_ASSET_ROLLED_BACK', 'Asset đã rollback; cần --allow-rolled-back để promote lại.');
    }

    if (asset.storageBackend === 'OBJECT') {
      const expectedKey = this.objectStorage.keyForSha256(asset.sha256);
      if (asset.objectStorageKey !== expectedKey) {
        throw new MediaPromotionError('OBJECT_ASSET_KEY_INVALID', 'Object key active không khớp content-address của asset.');
      }
      const existing = await this.objectStorage.readObject(asset.objectStorageKey);
      if (!bytesMatch(existing, asset)) {
        throw new MediaPromotionError('OBJECT_ASSET_INTEGRITY_FAILED', 'Object đang active không khớp hash/size.');
      }
      return { assetId, changed: false, objectStorageKey: asset.objectStorageKey, uploaded: false };
    }
    const source = await this.archiveStorage.readArchiveEntry(asset.storageKey);
    if (!bytesMatch(source, asset)) {
      throw new MediaPromotionError('ARCHIVE_ASSET_INTEGRITY_FAILED', 'Archive source không khớp hash/size; không upload/cutover.');
    }
    const objectStorageKey = this.objectStorage.keyForSha256(asset.sha256);
    if (dryRun) return { assetId, changed: false, dryRun: true, objectStorageKey };

    const objectResult = await this.objectStorage.ensureVerifiedObject({
      key: objectStorageKey,
      data: source,
      mimeType: asset.mimeType,
      expectedSha256: asset.sha256,
      expectedSizeBytes: asset.sizeBytes
    });
    const transition = await this.repository.markPromoted({
      asset,
      objectStorageKey,
      actor: this.actor,
      allowRolledBack
    });
    return {
      assetId,
      changed: transition.changed,
      objectStorageKey,
      uploaded: objectResult.uploaded
    };
  }

  async rollbackAsset(assetId) {
    if (!isUuid(assetId)) throw new MediaPromotionError('MEDIA_ASSET_ID_INVALID', 'Media asset id không hợp lệ.');
    const asset = await this.repository.findAssetById(assetId);
    if (!asset) throw new MediaPromotionError('MEDIA_ASSET_NOT_FOUND', 'Không tìm thấy media asset.');
    if (asset.storageBackend === 'OBJECT') {
      const archive = await this.archiveStorage.readArchiveEntry(asset.storageKey);
      if (!bytesMatch(archive, asset)) {
        throw new MediaPromotionError(
          'ARCHIVE_ASSET_INTEGRITY_FAILED',
          'Archive source không khớp hash/size; không thể rollback an toàn.'
        );
      }
    }
    const result = await this.repository.markRolledBack({ asset, actor: this.actor });
    return { assetId, changed: result.changed, storageBackend: 'ARCHIVE' };
  }
}
