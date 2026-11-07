import { db } from '../db.js';
import { config } from '../config.js';
import { LocalImportStorage } from '../imports/local-import-storage.js';
import { CatalogService } from './catalog-service.js';
import { MysqlCatalogRepository } from './mysql-catalog-repository.js';

export const catalogService = new CatalogService({
  repository: new MysqlCatalogRepository(db),
  storage: new LocalImportStorage(config.importStoragePath)
});
