import { db } from '../db.js';
import { config } from '../config.js';
import { LocalImportStorage } from '../imports/local-import-storage.js';
import { PublishedAssetStorage } from '../storage/published-asset-storage.js';
import { S3ObjectStorage } from '../storage/s3-object-storage.js';
import { metricsRegistry } from '../operations/metrics.js';
import { CatalogService } from './catalog-service.js';
import { MysqlCatalogRepository } from './mysql-catalog-repository.js';

const archiveStorage = new LocalImportStorage(config.importStoragePath);
const objectStorage = config.objectStorage.enabled ? new S3ObjectStorage(config.objectStorage) : null;

export const catalogService = new CatalogService({
  repository: new MysqlCatalogRepository(db),
  storage: new PublishedAssetStorage({
    archiveStorage,
    objectStorage,
    archiveFallback: config.objectStorage.archiveFallback,
    telemetry: metricsRegistry
  })
});

export const closeCatalogStorage = () => objectStorage?.destroy();
