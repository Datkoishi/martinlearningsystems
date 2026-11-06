import { db } from '../db.js';
import { config } from '../config.js';
import { ImportService } from './import-service.js';
import { LocalImportStorage } from './local-import-storage.js';
import { MysqlImportRepository } from './mysql-import-repository.js';

export const importService = new ImportService({
  repository: new MysqlImportRepository(db),
  storage: new LocalImportStorage(config.importStoragePath)
});
