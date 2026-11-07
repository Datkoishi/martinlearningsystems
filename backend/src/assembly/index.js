import { db } from '../db.js';
import { catalogService } from '../catalog/index.js';
import { AssemblyService } from './assembly-service.js';
import { MysqlAssemblyRepository } from './mysql-assembly-repository.js';

export const assemblyService = new AssemblyService({
  repository: new MysqlAssemblyRepository(db),
  assetService: catalogService
});
