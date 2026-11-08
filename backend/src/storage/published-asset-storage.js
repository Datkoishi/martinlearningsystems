import crypto from 'node:crypto';

export class PublishedAssetStorageError extends Error {
  constructor(code, message, cause = undefined) {
    super(message, cause ? { cause } : undefined);
    this.name = 'PublishedAssetStorageError';
    this.code = code;
  }
}

const isExpectedBytes = (data, asset) => (
  data
  && data.length === asset.sizeBytes
  && crypto.createHash('sha256').update(data).digest('hex') === asset.sha256
);

export class PublishedAssetStorage {
  constructor({ archiveStorage, objectStorage = null, archiveFallback = true }) {
    this.archiveStorage = archiveStorage;
    this.objectStorage = objectStorage;
    this.archiveFallback = archiveFallback;
  }

  async readPublishedAsset(asset) {
    const backend = asset.storageBackend || 'ARCHIVE';
    if (backend === 'ARCHIVE') return this.archiveStorage.readArchiveEntry(asset.storageKey);
    if (backend !== 'OBJECT' || !asset.objectStorageKey) {
      throw new PublishedAssetStorageError('ASSET_STORAGE_STATE_INVALID', 'Trạng thái storage của asset không hợp lệ.');
    }

    let objectError = null;
    if (this.objectStorage) {
      try {
        const objectData = await this.objectStorage.readObject(asset.objectStorageKey);
        if (isExpectedBytes(objectData, asset)) return objectData;
        objectError = new PublishedAssetStorageError(
          'OBJECT_ASSET_INTEGRITY_FAILED',
          'Object bytes không khớp hash/size của asset.'
        );
      } catch (error) {
        objectError = error;
      }
    } else {
      objectError = new PublishedAssetStorageError('OBJECT_STORAGE_DISABLED', 'Object storage chưa được cấu hình.');
    }

    if (!this.archiveFallback) {
      throw new PublishedAssetStorageError('OBJECT_ASSET_UNAVAILABLE', 'Object asset không khả dụng và archive fallback đã tắt.', objectError);
    }
    return this.archiveStorage.readArchiveEntry(asset.storageKey);
  }
}
